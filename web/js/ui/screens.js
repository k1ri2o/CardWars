// Menus: title, deck picker, deck builder, online lobby and local match setup.
import { h, clear, fill, toast, modal, storage, store } from './dom.js';
import { cardEl, portraitEl, landscapeChip, heroPowerText, LANDSCAPE_NAMES, TYPE_NAMES } from './cards.js';
import { allDecks, customDecks, findDeck, validateDeck, deckDesc, saveCustomDeck, deleteCustomDeck, encodeDeck, decodeDeck, MAX_CARDS_IN_DECK } from '../decks.js';
import { LANDSCAPES, MAX_DUPLICATES_IN_DECK, MIN_CARDS_IN_DECK, CardType } from '../engine/consts.js';
import { HostRoom, GuestRoom, LocalSession } from '../session.js';
import { normalizeCode, signalingConfig, signalingLabel } from '../net/peer.js';
import { Board, showHelp } from './board.js';

const DEFAULT_SETTINGS = { ring: true, cardLevel: 1, heroLevel: 15, turnSeconds: 0 };

export function heroLabel(l) {
  if (!l) return '';
  if (/^Leader_Super/.test(l.id)) return l.name + ' (Super)';
  if (/Sweater$/.test(l.id)) return l.name + ' (Sweater)';
  if (/_FC$/.test(l.id)) return l.name + ' (Fionna & Cake)';
  if (/^Leader_ElFisto[AB]$/.test(l.id)) return l.name + ' ' + l.id.slice(-1);
  return l.name;
}

export class App {
  constructor(root, db) {
    this.root = root;
    this.db = db;
    this.profile = {
      name: storage('cardwars.name', ''),
      deckId: storage('cardwars.deck', null),
      settings: { ...DEFAULT_SETTINGS, ...storage('cardwars.settings', {}) },
    };
    if (!this.myDeck()) this.profile.deckId = db.decks[0].id;
  }

  myDeck() { return findDeck(this.db, this.profile.deckId); }

  saveProfile() {
    store('cardwars.name', this.profile.name);
    store('cardwars.deck', this.profile.deckId);
    store('cardwars.settings', this.profile.settings);
  }

  playerName() {
    return (this.profile.name || '').trim() || 'Player';
  }

  start() {
    const m = /join=([A-Za-z0-9]+)/.exec(location.hash);
    if (m) this.joinScreen(normalizeCode(m[1]));
    else this.menu();
  }

  screen(cls, ...kids) {
    clear(this.root);
    const el = h('div.screen', { class: cls }, ...kids);
    this.root.append(el);
    window.scrollTo(0, 0);
    return el;
  }

  // ------------------------------------------------------------------ menu
  menu() {
    history.replaceState(null, '', location.pathname + location.search);
    const deck = this.myDeck();
    const leader = this.db.leaders[deck.leader];
    const nameInput = h('input.name-input', {
      value: this.profile.name, placeholder: 'Your name', maxlength: 20,
      oninput: (e) => { this.profile.name = e.target.value; this.saveProfile(); },
    });
    this.screen('menu',
      h('div.logo', h('div.logo-top', 'CARD'), h('div.logo-bottom', 'WARS'), h('div.logo-sub', 'Adventure Time · 1v1 with a friend')),
      h('div.menu-card',
        h('label.field', h('span', 'Your name'), nameInput),
        h('div.deck-tile', { onclick: () => this.pickDeck((d) => { this.profile.deckId = d.id; this.saveProfile(); this.menu(); }) },
          portraitEl(leader),
          h('div.deck-tile-info',
            h('div.deck-tile-name', deck.name),
            h('div.deck-tile-sub', `${heroLabel(leader)} · ${deck.cards.length} cards`),
            h('div.lands', deck.landscapes.map((l) => landscapeChip(l))),
          ),
          h('span.change', 'Change'),
        ),
      ),
      h('div.menu-buttons',
        h('button.primary.big', { onclick: () => this.hostScreen() }, '🌐 Host an online match'),
        h('button.primary.big', { onclick: () => this.joinScreen('') }, '🔑 Join with a code'),
        h('button.big', { onclick: () => this.localSetup('hotseat') }, '🤝 Pass & play on this device'),
        h('button.big', { onclick: () => this.localSetup('practice') }, '🤖 Practice against the computer'),
        h('div.row2',
          h('button', { onclick: () => this.deckList() }, '🃏 Decks'),
          h('button', { onclick: () => showHelp() }, '❓ How to play'),
        ),
      ),
      h('div.footer', 'Fan-made remake using the original game files. Online play connects the two browsers directly.'),
    );
  }

  // ------------------------------------------------------------------ decks
  pickDeck(onPick, { title = 'Pick a deck' } = {}) {
    const m = modal(h('div.dialog.wide.deck-picker',
      h('h2', title),
      this.deckGrid((d) => { m.close(); onPick(d); }),
      h('div.buttons', h('button', { onclick: () => m.close() }, 'Cancel')),
    ));
  }

  deckGrid(onPick) {
    const decks = allDecks(this.db);
    return h('div.deck-grid', decks.map((d) => {
      const l = this.db.leaders[d.leader];
      const err = validateDeck(this.db, d);
      return h('div.deck-tile', { class: [err ? 'invalid' : '', d.id === this.profile.deckId ? 'current' : ''].join(' '), onclick: () => (err ? toast(err, 'bad') : onPick(d)) },
        portraitEl(l),
        h('div.deck-tile-info',
          h('div.deck-tile-name', d.name),
          h('div.deck-tile-sub', `${heroLabel(l)} · ${d.cards.length} cards${d.preset ? '' : ' · yours'}`),
          h('div.lands', d.landscapes.map((x) => landscapeChip(x))),
          err ? h('div.err', err) : null,
        ));
    }));
  }

  deckList() {
    this.screen('decks',
      h('div.topbar', h('button', { onclick: () => this.menu() }, '← Back'), h('h1', 'Decks'),
        h('div.spacer'),
        h('button', { onclick: () => this.importDeck() }, 'Import code'),
        h('button.primary', { onclick: () => this.deckBuilder(null) }, '+ New deck')),
      h('p.muted.center', 'Tap a deck to edit it. Preset decks are copied when you edit them.'),
      this.deckGrid((d) => this.deckBuilder(d)),
    );
  }

  importDeck() {
    const input = h('textarea.code-box', { placeholder: 'Paste a CW1. deck code' });
    const m = modal(h('div.dialog',
      h('h2', 'Import a deck'), input,
      h('div.buttons',
        h('button', { onclick: () => m.close() }, 'Cancel'),
        h('button.primary', {
          onclick: () => {
            try {
              const d = decodeDeck(input.value);
              const err = validateDeck(this.db, d);
              if (err) throw new Error(err);
              saveCustomDeck(d);
              m.close();
              toast('Deck imported');
              this.deckList();
            } catch (e) {
              toast(e.message || 'That code did not work', 'bad');
            }
          },
        }, 'Import'),
      ),
    ));
  }

  deckBuilder(source) {
    const db = this.db;
    const d = source && !source.preset
      ? { ...source, cards: [...source.cards], landscapes: [...source.landscapes] }
      : source
        ? { id: 'my-' + Date.now().toString(36), name: source.name + ' (copy)', leader: source.leader, landscapes: [...source.landscapes], cards: [...source.cards] }
        : { id: 'my-' + Date.now().toString(36), name: 'My deck', leader: 'Leader_Finn', landscapes: ['Corn', 'Corn', 'Plains', 'Plains'], cards: [] };
    const filter = { faction: 'all', type: 'all', text: '', gold: false };
    const pool = Object.values(db.forms).filter((f) => f.type <= CardType.Spell)
      .sort((a, b) => a.faction.localeCompare(b.faction) || a.type - b.type || a.cost - b.cost || a.name.localeCompare(b.name));

    const nameInput = h('input', { value: d.name, maxlength: 40, oninput: (e) => { d.name = e.target.value; } });
    const heroBox = h('div.builder-hero');
    const landBox = h('div.builder-lands');
    const deckBox = h('div.builder-deck');
    const poolBox = h('div.builder-pool');
    const countEl = h('span.count');

    const renderHero = () => {
      const l = db.leaders[d.leader];
      fill(heroBox,
        portraitEl(l),
        h('div', h('div.deck-tile-name', heroLabel(l)), h('div.muted.small', heroPowerText(l)), h('button.small', { onclick: pickHero }, 'Change hero')),
      );
    };
    const pickHero = () => {
      const m = modal(h('div.dialog.wide',
        h('h2', 'Pick a hero'),
        h('div.hero-grid', Object.values(db.leaders).map((l) => h('div.hero-pick', {
          class: l.id === d.leader ? 'current' : '',
          title: heroPowerText(l),
          onclick: () => { d.leader = l.id; m.close(); renderHero(); },
        }, portraitEl(l), h('div.hero-pick-name', heroLabel(l)), h('div.hero-pick-power', heroPowerText(l))))),
        h('div.buttons', h('button', { onclick: () => m.close() }, 'Cancel')),
      ));
    };
    const renderLands = () => {
      fill(landBox, h('div.label', 'Landscapes (one per lane)'), h('div.lands-edit', d.landscapes.map((l, i) => h('select', {
        class: 'f-' + l,
        onchange: (e) => { d.landscapes[i] = e.target.value; renderLands(); renderDeck(); renderPool(); },
      }, LANDSCAPES.map((x) => h('option', { value: x, selected: x === l }, LANDSCAPE_NAMES[x]))))));
    };
    const renderDeck = () => {
      const counts = {};
      for (const id of d.cards) counts[id] = (counts[id] || 0) + 1;
      const ids = Object.keys(counts).sort((a, b) => db.forms[a].cost - db.forms[b].cost || db.forms[a].name.localeCompare(db.forms[b].name));
      countEl.textContent = `${d.cards.length} cards`;
      const err = validateDeck(db, d);
      const lands = new Set(d.landscapes);
      fill(deckBox,
        h('div.label', `Deck · ${d.cards.length} / ${MIN_CARDS_IN_DECK}–${MAX_CARDS_IN_DECK} cards`),
        err ? h('div.err', err) : h('div.ok', 'Ready to play'),
        h('div.deck-lines', ids.map((id) => {
          const f = db.forms[id];
          const off = f.type !== CardType.Spell && f.faction !== 'Universal' && !lands.has(f.faction);
          return h('div.deck-line', { class: ['f-' + f.faction, off ? 'off' : ''].join(' '), title: off ? `No ${LANDSCAPE_NAMES[f.faction]} lane in this deck` : 'Tap to remove one', onclick: () => { d.cards.splice(d.cards.indexOf(id), 1); renderDeck(); renderPool(); } },
            h('span.dl-cost', String(f.cost)), h('span.dl-name', f.name + (f.quality !== 'Standard' ? ' ✦' : '')), h('span.dl-n', '×' + counts[id]));
        })),
      );
    };
    const renderPool = () => {
      const counts = {};
      for (const id of d.cards) counts[id] = (counts[id] || 0) + 1;
      const t = filter.text.trim().toLowerCase();
      const list = pool.filter((f) => (filter.faction === 'all' || f.faction === filter.faction)
        && (filter.type === 'all' || f.type === Number(filter.type))
        && (filter.gold || f.quality === 'Standard')
        && (!t || f.name.toLowerCase().includes(t) || f.rawDescription.toLowerCase().includes(t)));
      fill(poolBox, ...list.map((f) => {
        const el = cardEl(f, { size: 'hand' });
        if (counts[f.id]) el.append(h('div.in-deck', '×' + counts[f.id]));
        el.addEventListener('click', () => {
          if ((counts[f.id] || 0) >= MAX_DUPLICATES_IN_DECK) return toast(`At most ${MAX_DUPLICATES_IN_DECK} copies`, 'bad');
          if (d.cards.length >= MAX_CARDS_IN_DECK) return toast('The deck is full', 'bad');
          d.cards.push(f.id);
          renderDeck();
          renderPool();
        });
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.zoom(f); });
        el.title = f.rawDescription ? f.name + ': ' + f.rawDescription.replace(/<val\d>/g, 'X') : f.name;
        return el;
      }));
    };
    const chip = (group, value, label) => h('button.chip', {
      class: filter[group] === value ? 'on' : '',
      onclick: (e) => {
        filter[group] = value;
        e.target.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
        e.target.classList.add('on');
        renderPool();
      },
    }, label);

    this.screen('builder',
      h('div.topbar',
        h('button', { onclick: () => this.deckList() }, '← Decks'),
        h('label.field.inline', h('span', 'Name'), nameInput),
        h('div.spacer'),
        countEl,
        !source || source.preset ? null : h('button.danger', {
          onclick: () => {
            if (!confirm(`Delete ${d.name}?`)) return;
            deleteCustomDeck(d.id);
            this.deckList();
          },
        }, 'Delete'),
        h('button', {
          onclick: () => {
            const code = encodeDeck(d);
            navigator.clipboard?.writeText(code).then(() => toast('Deck code copied'), () => {});
            modal(h('div.dialog', h('h2', 'Deck code'), h('textarea.code-box', { readonly: true, value: code }), h('p.muted', 'Send this to a friend; they can import it from the Decks screen.')));
          },
        }, 'Share code'),
        h('button.primary', {
          onclick: () => {
            const err = validateDeck(db, d);
            if (err) return toast(err, 'bad');
            saveCustomDeck({ id: d.id, ...deckDesc(d), preset: false });
            this.profile.deckId = d.id;
            this.saveProfile();
            toast('Deck saved and selected');
            this.deckList();
          },
        }, 'Save'),
      ),
      h('div.builder-grid',
        h('div.builder-side', heroBox, landBox, deckBox),
        h('div.builder-main',
          h('div.filters',
            h('input.search', { placeholder: 'Search cards', oninput: (e) => { filter.text = e.target.value; renderPool(); } }),
            h('div.chips', chip('faction', 'all', 'All'), ...[...LANDSCAPES, 'Universal'].map((x) => chip('faction', x, LANDSCAPE_NAMES[x]))),
            h('div.chips', chip('type', 'all', 'All types'), chip('type', '0', 'Creatures'), chip('type', '1', 'Buildings'), chip('type', '2', 'Spells'),
              h('label.check', h('input', { type: 'checkbox', onchange: (e) => { filter.gold = e.target.checked; renderPool(); } }), ' Special editions')),
          ),
          h('p.muted.small', 'Tap a card to add it, tap a line in the deck to remove it. Right-click (or long-press) a card to read it.'),
          poolBox,
        ),
      ),
    );
    renderHero();
    renderLands();
    renderDeck();
    renderPool();
  }

  zoom(form) {
    const m = modal(h('div.dialog.zoom', cardEl(form, { size: 'zoom' }), h('div.buttons', h('button', { onclick: () => m.close() }, 'Close'))));
  }

  // ------------------------------------------------------------------ settings
  settingsForm(settings, onChange, readOnly = false) {
    const sel = (key, options, label) => h('label.field.inline', h('span', label), h('select', {
      disabled: readOnly,
      onchange: (e) => { settings[key] = Number(e.target.value); onChange(settings); },
    }, options.map(([v, t]) => h('option', { value: v, selected: settings[key] === v }, t))));
    return h('div.settings',
      h('label.check', h('input', {
        type: 'checkbox', checked: settings.ring !== false, disabled: readOnly,
        onchange: (e) => { settings.ring = e.target.checked; onChange(settings); },
      }), ' Battle ring (stop the sword to hit)'),
      sel('heroLevel', [1, 3, 5, 10, 15, 20, 25, 30, 40, 50].map((n) => [n, `Level ${n} (~${n * 5 + 10} HP)`]), 'Hero level'),
      sel('cardLevel', [[1, 'Level 1'], [2, 'Level 2'], [3, 'Level 3']], 'Card level'),
      sel('turnSeconds', [[0, 'No limit'], [60, '60 seconds'], [90, '90 seconds'], [120, '2 minutes']], 'Turn timer'),
    );
  }

  // ------------------------------------------------------------------ online
  async hostScreen() {
    const deck = this.myDeck();
    const err = validateDeck(this.db, deck);
    if (err) return toast(err, 'bad');
    const room = new HostRoom(this.db);
    const settings = { ...this.profile.settings };
    const codeEl = h('div.room-code', '······');
    const linkBtn = h('button', { disabled: true }, 'Copy invite link');
    const via = h('div.muted.small', 'Opening a room…');
    const guestEl = h('div.guest-box', h('div.waiting', 'Waiting for a friend to join…'));
    const startBtn = h('button.primary.big', { disabled: true }, 'Start match');
    let left = false;
    const back = () => {
      left = true;
      room.leave();
      this.menu();
    };
    this.screen('lobby',
      h('div.topbar', h('button', { onclick: back }, '← Back'), h('h1', 'Host a match')),
      h('div.lobby-card',
        h('div.label', 'Room code'),
        codeEl,
        h('div.row2', linkBtn),
        via,
      ),
      h('div.lobby-card', h('div.label', 'Players'),
        h('div.player-line', portraitEl(this.db.leaders[deck.leader]), h('div', h('b', this.playerName()), h('div.muted.small', `${deck.name}`))),
        guestEl),
      h('div.lobby-card', h('div.label', 'Match rules'), this.settingsForm(settings, (s) => {
        this.profile.settings = { ...s };
        this.saveProfile();
        room.setLobbyInfo(this.playerName(), s);
      })),
      startBtn,
    );
    room.onLobby((g) => {
      if (left) return;
      clear(guestEl);
      if (g && g.connected) {
        const l = this.db.leaders[g.deck.leader];
        guestEl.append(h('div.player-line', portraitEl(l), h('div', h('b', g.name), h('div.muted.small', `${g.deck.name || heroLabel(l)} · ${g.deck.cards.length} cards`))));
        startBtn.disabled = false;
      } else {
        guestEl.append(h('div.waiting', 'Waiting for a friend to join…'));
        startBtn.disabled = true;
      }
    });
    startBtn.onclick = () => {
      if (!room.guest || !room.guest.connected) return;
      this.saveProfile();
      const boardRoot = this.screen('play');
      const board = new Board(boardRoot, { db: this.db, session: room, onExit: () => this.menu() });
      room.start({ hostName: this.playerName(), hostDeck: deckDesc(deck), settings: { ...settings } });
      void board;
    };
    try {
      const code = await room.open();
      if (left) { room.leave(); return; }
      room.setLobbyInfo(this.playerName(), settings);
      codeEl.textContent = code;
      const link = `${location.origin}${location.pathname}#join=${code}`;
      linkBtn.disabled = false;
      linkBtn.onclick = () => {
        navigator.clipboard?.writeText(link).then(() => toast('Invite link copied'), () => prompt('Copy this link', link));
      };
      via.textContent = `Your friend opens this game, taps Join and types the code, or opens the invite link. Connected through the ${room.label}.`;
    } catch (e) {
      if (left) return;
      via.textContent = '';
      fill(guestEl, h('div.err', e.message || String(e)), h('button', { onclick: () => this.hostScreen() }, 'Try again'));
    }
  }

  joinScreen(prefill) {
    const deck = this.myDeck();
    const input = h('input.code-input', { value: prefill || '', placeholder: 'ABC123', maxlength: 8, autocapitalize: 'characters', autocomplete: 'off' });
    const status = h('div.join-status');
    const btn = h('button.primary.big', 'Join');
    let room = null;
    let left = false;
    const back = () => {
      left = true;
      if (room) room.leave();
      this.menu();
    };
    const nameInput = h('input.name-input', {
      value: this.profile.name, placeholder: 'Your name', maxlength: 20,
      oninput: (e) => { this.profile.name = e.target.value; this.saveProfile(); },
    });
    const deckTile = h('div.deck-tile', { onclick: () => this.pickDeck((d) => { this.profile.deckId = d.id; this.saveProfile(); this.joinScreen(input.value); }) },
      portraitEl(this.db.leaders[deck.leader]),
      h('div.deck-tile-info', h('div.deck-tile-name', deck.name), h('div.lands', deck.landscapes.map((l) => landscapeChip(l)))),
      h('span.change', 'Change'));
    this.screen('lobby',
      h('div.topbar', h('button', { onclick: back }, '← Back'), h('h1', 'Join a match')),
      h('div.lobby-card',
        h('label.field', h('span', 'Your name'), nameInput),
        h('div.label', 'Your deck'), deckTile,
        h('div.label', 'Room code from your friend'), input, btn, status),
    );
    const go = async () => {
      const code = normalizeCode(input.value);
      if (code.length !== 6) return toast('Room codes have 6 letters and numbers', 'bad');
      const err = validateDeck(this.db, deck);
      if (err) return toast(err, 'bad');
      btn.disabled = true;
      input.disabled = true;
      history.replaceState(null, '', '#join=' + code);
      fill(status, h('div.muted', 'Connecting…'));
      // Keep the seat token for this tab so a reload can rejoin a running match.
      let saved = null;
      try { saved = JSON.parse(sessionStorage.getItem('cardwars.guest') || 'null'); } catch { /* none */ }
      room = new GuestRoom(saved && saved.code === code ? saved.token : null);
      try { sessionStorage.setItem('cardwars.guest', JSON.stringify({ code, token: room.token })); } catch { /* private mode */ }
      let board = null;
      room.onLobby((m) => {
        if (left) return;
        if (m.t === 'lobby') {
          const s = m.settings || {};
          fill(status,
            h('div.ok', `Connected to ${m.hostName || 'the host'}. Waiting for them to start…`),
            h('div.muted.small', `Rules: hero level ${s.heroLevel || 15}, card level ${s.cardLevel || 1}, ring ${s.ring === false ? 'off' : 'on'}${s.turnSeconds ? `, ${s.turnSeconds}s turns` : ''}.`),
          );
        } else if (m.t === 'start') {
          if (board) return;
          const boardRoot = this.screen('play');
          board = new Board(boardRoot, { db: this.db, session: room, onExit: () => this.menu() });
        } else if (m.t === 'bye' || m.t === 'lost') {
          fill(status, h('div.err', 'The host closed the room.'));
          btn.disabled = false;
          input.disabled = false;
        }
      });
      try {
        await room.join(code, this.playerName(), deckDesc(deck));
      } catch (e) {
        if (left) return;
        fill(status, h('div.err', e.message || String(e)));
        btn.disabled = false;
        input.disabled = false;
      }
    };
    btn.onclick = go;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    // After a reload mid-match, take the seat back straight away. A fresh
    // invite link waits so the player can set their name and deck first.
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem('cardwars.guest') || 'null'); } catch { /* none */ }
    if (prefill && saved && saved.code === prefill) setTimeout(go, 50);
    else if (!prefill) input.focus();
  }

  // ------------------------------------------------------------------ local
  localSetup(mode) {
    const hotseat = mode === 'hotseat';
    const settings = { ...this.profile.settings };
    const seats = [
      { name: this.playerName(), deck: this.myDeck() },
      { name: hotseat ? 'Player 2' : 'Computer', deck: null },
    ];
    const presets = this.db.decks;
    seats[1].deck = presets[Math.floor(Math.random() * presets.length)];
    const seatBox = (i) => {
      const box = h('div.lobby-card');
      const draw = () => {
        const s = seats[i];
        const l = this.db.leaders[s.deck.leader];
        fill(box,
          h('div.label', hotseat ? `Player ${i + 1}` : i === 0 ? 'You' : 'Computer'),
          hotseat || i === 0 ? h('input.name-input', { value: s.name, maxlength: 20, oninput: (e) => { s.name = e.target.value; } }) : null,
          h('div.deck-tile', { onclick: () => this.pickDeck((d) => { s.deck = d; draw(); }) },
            portraitEl(l),
            h('div.deck-tile-info', h('div.deck-tile-name', s.deck.name), h('div.deck-tile-sub', heroLabel(l)), h('div.lands', s.deck.landscapes.map((x) => landscapeChip(x)))),
            h('span.change', 'Change')),
          !hotseat && i === 1 ? h('button.small', { onclick: () => { s.deck = presets[Math.floor(Math.random() * presets.length)]; draw(); } }, 'Random deck') : null,
        );
      };
      draw();
      return box;
    };
    this.screen('lobby',
      h('div.topbar', h('button', { onclick: () => this.menu() }, '← Back'), h('h1', hotseat ? 'Pass & play' : 'Practice')),
      hotseat ? h('p.muted.center', 'Two players share this screen. Hands stay hidden between turns.') : h('p.muted.center', 'A simple computer opponent, good for learning the cards.'),
      h('div.seats', seatBox(0), seatBox(1)),
      h('div.lobby-card', h('div.label', 'Match rules'), this.settingsForm(settings, () => {})),
      h('button.primary.big', {
        onclick: () => {
          for (const s of seats) {
            const err = validateDeck(this.db, s.deck);
            if (err) return toast(err, 'bad');
          }
          if (!hotseat) {
            this.profile.name = seats[0].name;
            this.profile.deckId = seats[0].deck.id;
          }
          this.profile.settings = { ...settings };
          this.saveProfile();
          const names = seats.map((s, i) => (s.name || '').trim() || `Player ${i + 1}`);
          if (hotseat && names[0] === names[1]) names[1] += ' 2';
          const session = new LocalSession(this.db, {
            decks: seats.map((s) => deckDesc(s.deck)),
            names,
            settings: { ...settings, turnSeconds: hotseat ? settings.turnSeconds : 0 },
            humans: [true, hotseat],
          });
          const boardRoot = this.screen('play');
          new Board(boardRoot, { db: this.db, session, onExit: () => this.menu() });
        },
      }, 'Start'),
    );
  }
}

export { signalingConfig, signalingLabel, TYPE_NAMES };
