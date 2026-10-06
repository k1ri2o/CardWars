// The battle screen. Renders a per-player snapshot, plays the events that led
// to it, and turns clicks into actions for the session.
import { h, clear, fill, sleep, toast, modal } from './dom.js';
import { cardEl, cardBackEl, portraitEl, landscapeStyle, artStyle, describe, heroPowerText, LANDSCAPE_NAMES, TYPE_NAMES } from './cards.js';
import { spinRing } from './ring.js';
import { CardType } from '../engine/consts.js';

// These change the board, so the new state is drawn before they play.
const RENDER_FIRST = new Set(['summon', 'floop', 'turn', 'move', 'steal', 'flip', 'outOfCards', 'gameover']);

export class Board {
  constructor(root, { db, session, onExit }) {
    this.root = root;
    this.db = db;
    this.session = session;
    this.onExit = onExit;
    this.snap = null;
    this.me = 0;
    this.sel = null; // uid of the selected hand card
    this.queue = [];
    this.busy = false;
    this.log = [];
    this.ringOpen = false;
    this.deadline = 0;
    this.status = '';
    this.build();
    this.unlisten = session.listen((m) => this.onMessage(m));
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
    this.clock = setInterval(() => this.renderClock(), 500);
  }

  destroy() {
    this.unlisten();
    window.removeEventListener('resize', this.onResize);
    clearInterval(this.clock);
    if (this.gameOverModal) this.gameOverModal.close();
    if (this.discardModal) this.discardModal.close();
    clear(this.root);
  }

  // ---------------------------------------------------------------- skeleton
  build() {
    clear(this.root);
    this.el = {
      oppBar: h('div.hero-bar.opp'),
      oppRow: h('div.row.opp'),
      mid: h('div.midline'),
      myRow: h('div.row.me'),
      myBar: h('div.hero-bar.me'),
      hand: h('div.hand'),
      fx: h('div.fx-layer'),
      inspect: h('div.inspect.hidden'),
      banner: h('div.banner'),
      status: h('div.net-status.hidden'),
      menuBtn: h('button.menu-btn', { title: 'Menu', onclick: () => this.openMenu() }, '☰'),
      logBtn: h('button.log-btn', { title: 'Battle log', onclick: () => this.toggleLog() }, '📜'),
      logPanel: h('div.log-panel.hidden'),
    };
    this.board = h('div.board',
      this.el.oppBar, this.el.oppRow, this.el.mid, this.el.myRow, this.el.myBar, this.el.hand,
      this.el.fx, this.el.inspect, this.el.banner, this.el.status, this.el.menuBtn, this.el.logBtn, this.el.logPanel);
    this.board.addEventListener('click', (e) => {
      if (!e.target.closest('.card, .lane, .inspect, button, .portrait-btn, .pile')) this.deselect();
    });
    this.root.append(this.board);
    this.el.mid.append(h('div.mid-text', 'Shuffling decks…'));
  }

  /** Card sizes follow the space each row gets. */
  layout() {
    const row = this.el.myRow.querySelector('.lane');
    if (row) {
      const r = row.getBoundingClientRect();
      // A lane holds a creature card (1.4 tall) and a building strip (0.36).
      const cw = Math.max(40, Math.min(r.width * 0.84, (r.height - 14) / 1.8));
      this.board.style.setProperty('--cw', cw.toFixed(1) + 'px');
    }
    const hand = this.el.hand.getBoundingClientRect();
    const hw = Math.max(48, Math.min(120, (hand.height - 12) * (5 / 7)));
    this.board.style.setProperty('--hw', hw.toFixed(1) + 'px');
  }

  // ---------------------------------------------------------------- messages
  onMessage(m) {
    if (m.kind === 'update' || m.kind === 'pass') {
      this.queue.push(m);
      this.pump();
    } else if (m.kind === 'error') {
      toast(m.error, 'bad');
    } else if (m.kind === 'status') {
      this.status = m.text;
      this.el.status.textContent = m.text;
      this.el.status.className = 'net-status' + (m.text ? ' ' + (m.level || '') : ' hidden');
    } else if (m.kind === 'rematch') {
      const who = this.snap ? this.snap.players[m.from].name : 'Your opponent';
      toast(`${who} wants a rematch`);
      if (this.gameOverModal) {
        const note = this.gameOverModal.el.querySelector('.rematch-note');
        if (note) note.textContent = `${who} wants a rematch!`;
      }
    } else if (m.kind === 'closed') {
      this.closed = true;
      modal(h('div.dialog',
        h('h2', 'Match ended'),
        h('p', m.text),
        h('div.buttons', h('button.primary', { onclick: () => this.exit() }, 'Main menu')),
      ), { dismissable: false });
    }
  }

  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const m = this.queue.shift();
        if (m.kind === 'pass') {
          await this.passScreen(m.seat);
          continue;
        }
        const fast = this.queue.length > 1 || m.fresh || !this.snap;
        await this.apply(m, fast);
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.busy = false;
    }
  }

  async apply(m, fast) {
    const prev = this.snap;
    this.me = m.seat;
    if (m.snap.turnLeft != null) this.deadline = Date.now() + m.snap.turnLeft * 1000;
    else this.deadline = 0;
    for (const ev of m.events) this.addLog(ev, m.snap);
    if (fast) {
      this.snap = m.snap;
      this.render();
      if (m.snap.phase === 'gameover') this.showGameOver();
      else this.maybeRing();
      return;
    }
    let rendered = false;
    const renderNow = () => {
      this.snap = m.snap;
      this.render();
      rendered = true;
    };
    for (const ev of m.events) {
      if (!rendered && RENDER_FIRST.has(ev.t)) renderNow();
      await this.playEvent(ev, prev || m.snap, m.snap);
    }
    if (!rendered) renderNow();
    if (m.snap.phase === 'gameover') this.showGameOver();
    else this.maybeRing();
  }

  // ---------------------------------------------------------------- events
  laneEl(side, lane) {
    return this.board.querySelector(`.lane[data-side="${side}"][data-lane="${lane}"]`);
  }

  heroEl(side) {
    return side === this.me ? this.el.myBar.querySelector('.portrait') : this.el.oppBar.querySelector('.portrait');
  }

  float(target, text, cls) {
    if (!target) return;
    const r = target.getBoundingClientRect();
    const b = this.board.getBoundingClientRect();
    const f = h('div.float', { class: cls }, text);
    f.style.left = (r.left - b.left + r.width / 2) + 'px';
    f.style.top = (r.top - b.top + r.height * 0.4) + 'px';
    this.el.fx.append(f);
    setTimeout(() => f.remove(), 1300);
  }

  showBanner(text, cls = '', ms = 1100) {
    const b = this.el.banner;
    b.textContent = text;
    b.className = 'banner show ' + cls;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { b.className = 'banner'; }, ms);
  }

  name(side, snap = this.snap) {
    if (side === this.me) return 'You';
    return snap ? snap.players[side].name : 'Opponent';
  }

  cardName(id) {
    try { return this.db.form(id).name; } catch { return id; }
  }

  async playEvent(ev, prev, next) {
    const me = this.me;
    switch (ev.t) {
      case 'battle':
        this.showBanner(ev.player === me ? 'Battle!' : `${next.players[ev.player].name} attacks!`, 'battle', 900);
        await sleep(350);
        break;
      case 'attack': {
        const lane = this.laneEl(ev.side, ev.lane);
        const card = lane && lane.querySelector('.slot.creature .card');
        if (card) {
          card.classList.remove('lunge-up', 'lunge-down');
          void card.offsetWidth;
          card.classList.add(ev.side === me ? 'lunge-up' : 'lunge-down');
        }
        if (ev.result === 'crit') this.float(lane, 'CRIT!', 'crit');
        else if (ev.result === 'miss') this.float(lane, 'MISS', 'miss');
        await sleep(ev.blocked ? 200 : 330);
        break;
      }
      case 'damage':
        this.float(this.laneEl(ev.side, ev.lane), '-' + ev.amount, 'dmg');
        await sleep(90);
        break;
      case 'heal':
        this.float(this.laneEl(ev.side, ev.lane), '+' + ev.amount, 'heal');
        break;
      case 'heroDamage': {
        const p = this.heroEl(ev.side);
        this.float(p, '-' + ev.amount, 'dmg big');
        if (p) {
          p.classList.remove('shake');
          void p.offsetWidth;
          p.classList.add('shake');
        }
        await sleep(90);
        break;
      }
      case 'heroHeal':
        this.float(this.heroEl(ev.side), '+' + ev.amount, 'heal big');
        break;
      case 'death': {
        const lane = this.laneEl(ev.side, ev.lane);
        const card = lane && lane.querySelector('.slot.creature .card');
        if (card) card.classList.add('dying');
        await sleep(260);
        break;
      }
      case 'spell':
        await this.showCast(ev.side, ev.card, next);
        break;
      case 'leader': {
        const leader = this.db.leaders[ev.leader];
        this.showBanner(`${ev.side === me ? 'You use' : next.players[ev.side].name + ' uses'} ${leader ? leader.name : 'their hero'}'s power`, 'power', 1400);
        await sleep(ev.side === me ? 200 : 700);
        break;
      }
      case 'summon': {
        const lane = this.laneEl(ev.side, ev.lane);
        const slot = lane && lane.querySelector(ev.type === CardType.Building ? '.slot.building > *' : '.slot.creature .card');
        if (slot) slot.classList.add('pop');
        if (ev.side !== me) await sleep(250);
        break;
      }
      case 'floop': {
        const lane = this.laneEl(ev.side, ev.lane);
        const card = lane && lane.querySelector('.slot.creature .card');
        if (card) card.classList.add('flooping');
        if (ev.side !== me) {
          this.showBanner(`${next.players[ev.side].name} floops ${this.cardName(ev.card)}`, 'floop', 1300);
          await sleep(500);
        }
        break;
      }
      case 'turn':
        this.showBanner(ev.player === me ? 'Your turn' : `${next.players[ev.player].name}'s turn`, ev.player === me ? 'mine' : '', 1100);
        break;
      case 'outOfCards':
        this.showBanner(`${ev.side === me ? 'You' : next.players[ev.side].name} ran out of cards!`, 'warn', 1800);
        await sleep(600);
        break;
      case 'steal':
        toast(`${this.name(ev.to, next)} took a card from ${ev.from === me ? 'you' : next.players[ev.from].name}`);
        break;
      case 'error':
        toast('A card ability misfired; the match carries on.', 'bad');
        break;
      default:
    }
  }

  async showCast(side, cardId, snap) {
    let form;
    try { form = this.db.form(cardId); } catch { return; }
    const who = side === this.me ? 'You cast' : `${snap.players[side].name} casts`;
    const box = h('div.cast-show', h('div.cast-who', `${who} ${form.name}`), cardEl(form, { size: 'zoom' }));
    this.el.fx.append(box);
    await sleep(side === this.me ? 700 : 1500);
    box.classList.add('out');
    setTimeout(() => box.remove(), 300);
  }

  addLog(ev, snap) {
    const n = (p) => (p === this.me ? 'You' : snap.players[p].name);
    let line = null;
    switch (ev.t) {
      case 'turn': line = `— Turn ${ev.turn}: ${n(ev.player)} —`; break;
      case 'summon': line = `${n(ev.side)} played ${this.cardName(ev.card)} on lane ${ev.lane + 1}`; break;
      case 'spell': line = `${n(ev.side)} cast ${this.cardName(ev.card)}`; break;
      case 'floop': line = `${n(ev.side)} flooped ${this.cardName(ev.card)}`; break;
      case 'leader': line = `${n(ev.side)} used the hero power`; break;
      case 'attack':
        if (!ev.blocked) line = `${n(ev.side)} attacked from lane ${ev.lane + 1}${ev.result === 'crit' ? ' (critical)' : ev.result === 'miss' ? ' (miss)' : ''}`;
        break;
      case 'heroDamage': line = `${n(ev.side)} took ${ev.amount} damage`; break;
      case 'heroHeal': line = `${n(ev.side)} healed ${ev.amount}`; break;
      case 'death': line = `${this.cardName(ev.card)} (${n(ev.side)}) was destroyed`; break;
      case 'outOfCards': line = `${n(ev.side)} ran out of cards: board cleared, hand reshuffled`; break;
      case 'gameover': line = `${ev.winner === this.me ? 'You' : snap.players[ev.winner].name} won`; break;
      default:
    }
    if (!line) return;
    this.log.push(line);
    if (this.log.length > 120) this.log.shift();
    if (!this.el.logPanel.classList.contains('hidden')) this.renderLog();
  }

  toggleLog() {
    this.el.logPanel.classList.toggle('hidden');
    this.renderLog();
  }

  renderLog() {
    fill(this.el.logPanel,
      h('div.log-head', 'Battle log', h('button.x', { onclick: () => this.toggleLog() }, '✕')),
      h('div.log-lines', this.log.slice().reverse().map((l) => h('div', l))),
    );
  }

  // ---------------------------------------------------------------- render
  render() {
    const s = this.snap;
    if (!s) return;
    const me = this.me;
    const opp = 1 - me;
    if (this.sel && !(s.players[me].hand || []).some((c) => c.uid === this.sel)) this.sel = null;
    this.board.classList.toggle('my-turn', s.active === me && s.phase === 'setup');
    this.renderBar(this.el.oppBar, s.players[opp], opp);
    this.renderBar(this.el.myBar, s.players[me], me);
    this.renderRow(this.el.oppRow, opp);
    this.renderRow(this.el.myRow, me);
    this.renderMid();
    this.renderHand();
    this.layout();
    if (this.inspectFor) this.refreshInspect();
    this.renderDiscardChoice();
  }

  renderBar(el, p, side) {
    const s = this.snap;
    const me = side === this.me;
    const leader = this.db.leaders[p.leader];
    const hpPct = Math.max(0, Math.min(100, (p.health / p.maxHealth) * 100));
    const ready = me && s.hints && s.hints.leader;
    const portrait = h('div.portrait-btn', {
      class: [ready ? 'ready' : '', s.active === side && s.phase !== 'gameover' ? 'active' : ''].join(' '),
      title: leader ? leader.name : '',
      onclick: () => this.inspectHero(side),
    }, portraitEl(leader), p.cooldown > 0 ? h('span.cooldown', { title: 'Turns until the hero power is ready' }, String(p.cooldown)) : h('span.power-ready', '★'));
    const piles = h('div.piles',
      h('div.pile.deck', { title: 'Cards left in deck' }, h('span.ico', '🂠'), String(p.deckCount)),
      h('div.pile.discard', { title: 'Discard pile', onclick: () => this.showDiscard(side) }, h('span.ico', '🗑'), String(p.discard.length)),
    );
    fill(el,
      portrait,
      h('div.hero-info',
        h('div.hero-name', p.name, leader ? h('span.hero-sub', ' · ' + leader.name) : null),
        h('div.hp-bar', h('div.hp-fill', { style: { width: hpPct + '%' } }), h('span.hp-text', `${p.health} / ${p.maxHealth}`)),
      ),
      h('div.magic', { title: 'Magic points' }, h('span.ico', '⚡'), String(p.magic), p.spellPoints > 0 ? h('span.spell-pts', { title: 'Spell-only magic' }, '+' + p.spellPoints) : null),
      piles,
      me ? null : h('div.opp-hand', { title: `${p.handCount} cards in hand` }, Array.from({ length: Math.min(p.handCount, 10) }, () => cardBackEl('tiny'))),
      me ? this.endTurnButton() : null,
    );
  }

  endTurnButton() {
    const s = this.snap;
    const mine = s.active === this.me && s.phase === 'setup' && !s.pending;
    return h('button.end-turn', {
      disabled: !mine,
      onclick: (e) => {
        e.stopPropagation();
        this.deselect();
        this.session.act({ type: 'endTurn' });
      },
    }, s.turn === 1 && s.active === this.me ? 'End Turn' : 'Battle!');
  }

  renderRow(el, side) {
    const s = this.snap;
    const p = s.players[side];
    const mine = side === this.me;
    clear(el);
    for (let c = 0; c < 4; c++) {
      const laneIdx = mine ? c : 3 - c;
      el.append(this.laneView(side, laneIdx, p.lanes[laneIdx]));
    }
    void s;
  }

  laneView(side, idx, lane) {
    const s = this.snap;
    const mine = side === this.me;
    const pend = s.pending;
    const choosing = pend && pend.kind === 'lane' && pend.player === this.me && pend.side === side;
    const targetable = choosing && pend.lanes.includes(idx);
    let playable = false;
    if (mine && this.sel && s.hints) {
      const lanes = s.hints.playable[this.sel] || [];
      playable = lanes.includes(idx);
    }
    const battling = s.battle && s.battle.player === side && s.battle.lane === idx;
    const el = h('div.lane', {
      class: [
        targetable ? 'targetable' : '', playable ? 'playable' : '', lane.flipped ? 'flipped' : '',
        lane.disabled ? 'disabled' : '', battling ? 'battling' : '', mine ? 'mine' : 'theirs',
      ].join(' '),
      dataset: { side: String(side), lane: String(idx) },
      style: lane.flipped ? {} : landscapeStyle(lane.type),
      title: (LANDSCAPE_NAMES[lane.type] || lane.type) + (lane.flipped ? ' (flipped)' : '') + (lane.disabled ? ' (disabled)' : ''),
      onclick: (e) => this.onLaneClick(e, side, idx),
    });
    const building = h('div.slot.building');
    const creature = h('div.slot.creature');
    if (lane.building) {
      const f = this.db.form(lane.building.id);
      const b = h('div.building-tile', { class: 'f-' + f.faction, onclick: (e) => this.onUnitClick(e, side, idx, 'building') },
        h('div.b-art', { style: artStyle(f) }),
        h('div.b-name', f.name));
      building.append(b);
    }
    if (lane.creature) {
      const u = lane.creature;
      const f = this.db.form(u.id);
      const card = cardEl(f, { size: 'board', level: u.level, unit: u, cost: f.cost });
      card.addEventListener('click', (e) => this.onUnitClick(e, side, idx, 'creature'));
      if (mine && s.hints && s.hints.floopable.includes(idx) && !s.pending) {
        card.classList.add('can-floop');
        card.append(h('button.floop-btn', {
          title: `Floop for ${u.floopCost} magic`,
          onclick: (e) => {
            e.stopPropagation();
            this.deselect();
            this.session.act({ type: 'floop', lane: idx });
          },
        }, 'FLOOP'));
      }
      creature.append(card);
    }
    if (lane.flipped) el.append(h('div.flipped-tag', 'Flipped'));
    el.append(building, creature);
    return el;
  }

  renderMid() {
    const s = this.snap;
    const me = this.me;
    const p = s.pending;
    let text = '';
    let cls = '';
    if (s.phase === 'gameover') {
      text = s.winner === me ? 'You win!' : `${s.players[s.winner].name} wins`;
    } else if (p && p.kind === 'lane') {
      if (p.player === me) {
        const src = p.source === 'leader' ? 'Hero power' : p.source ? this.cardName(p.source) : '';
        text = `${src ? src + ': ' : ''}${p.prompt || 'Pick a lane'}`;
        cls = 'prompt';
      } else {
        text = `${s.players[p.player].name} is choosing a target…`;
      }
    } else if (p && p.kind === 'discard') {
      text = p.player === me ? (p.prompt || 'Pick a card from the discard pile') : `${s.players[p.player].name} is picking from a discard pile…`;
      cls = p.player === me ? 'prompt' : '';
    } else if (p && p.kind === 'ring') {
      text = p.player === me ? 'Stop the sword!' : `${s.players[p.player].name} is attacking…`;
    } else if (s.phase === 'battle') {
      text = 'Battle!';
    } else if (s.active === me) {
      if (this.sel) {
        const card = (s.players[me].hand || []).find((c) => c.uid === this.sel);
        const f = card && this.db.form(card.id);
        const lanes = (s.hints.playable[this.sel] || []);
        if (f && f.type === CardType.Spell) text = lanes.length ? 'Tap Cast to use this spell' : "You can't cast this right now";
        else text = lanes.length ? 'Tap a glowing lane to play it' : (f ? whyNot(f, s.players[me], card) : '');
        cls = 'prompt';
      } else {
        text = s.turn === 1 ? 'Your turn. Play cards, then End Turn (no battle on turn 1).' : 'Your turn. Play cards and floop, then Battle!';
      }
    } else {
      text = `${s.players[s.active].name}'s turn`;
    }
    fill(this.el.mid,
      h('div.turn-no', `Turn ${s.turn}`),
      h('div.mid-text', { class: cls }, text),
      h('div.clock'),
    );
    this.renderClock();
  }

  renderClock() {
    const c = this.el.mid.querySelector('.clock');
    if (!c) return;
    if (!this.deadline || !this.snap || this.snap.phase === 'gameover') {
      c.textContent = '';
      return;
    }
    const left = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
    c.textContent = '⏱ ' + left;
    c.classList.toggle('low', left <= 10);
  }

  renderHand() {
    const s = this.snap;
    const me = this.me;
    const hand = s.players[me].hand || [];
    const myTurn = s.active === me && s.phase === 'setup' && !s.pending;
    clear(this.el.hand);
    hand.forEach((c, i) => {
      const f = this.db.form(c.id);
      const lanes = (s.hints && s.hints.playable[c.uid]) || [];
      const el = cardEl(f, { size: 'hand', level: c.level, cost: c.cost });
      el.style.setProperty('--i', i);
      el.style.setProperty('--n', hand.length);
      if (!myTurn || !lanes.length) el.classList.add('unplayable');
      if (this.sel === c.uid) el.classList.add('selected');
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.sel === c.uid) {
          this.deselect();
          return;
        }
        this.sel = c.uid;
        this.render();
        this.inspectCard(f, { level: c.level, cost: c.cost, handCard: c });
      });
      this.el.hand.append(el);
    });
    if (!hand.length) this.el.hand.append(h('div.hand-empty', 'No cards in hand'));
  }

  deselect() {
    const had = this.sel || this.inspectFor;
    this.sel = null;
    this.closeInspect();
    if (had && this.snap) this.render();
  }

  // ---------------------------------------------------------------- input
  onLaneClick(e, side, idx) {
    const s = this.snap;
    if (!s) return;
    const p = s.pending;
    if (p && p.kind === 'lane' && p.player === this.me && p.side === side) {
      e.stopPropagation();
      if (p.lanes.includes(idx)) this.session.act({ type: 'target', lane: idx });
      else toast('Pick one of the glowing lanes');
      return;
    }
    if (this.sel && side === this.me) {
      e.stopPropagation();
      const lanes = s.hints.playable[this.sel] || [];
      if (lanes.includes(idx)) {
        const uid = this.sel;
        this.sel = null;
        this.closeInspect();
        this.session.act({ type: 'play', uid, lane: idx });
      } else {
        toast("Can't play that there");
      }
    }
  }

  onUnitClick(e, side, idx, kind) {
    const s = this.snap;
    const p = s.pending;
    if ((p && p.kind === 'lane' && p.player === this.me && p.side === side) || (this.sel && side === this.me)) {
      return; // the lane handles it
    }
    e.stopPropagation();
    const u = s.players[side].lanes[idx][kind];
    if (!u) return;
    const f = this.db.form(u.id);
    this.inspectCard(f, { level: u.level, unit: kind === 'creature' ? u : null, side, lane: idx });
  }

  inspectCard(form, ctx) {
    this.inspectFor = { form, ctx };
    this.refreshInspect();
  }

  inspectHero(side) {
    this.sel = null;
    this.inspectFor = { hero: side };
    this.render();
  }

  refreshInspect() {
    const s = this.snap;
    const box = this.el.inspect;
    const it = this.inspectFor;
    if (!it || !s) return this.closeInspect();
    clear(box);
    box.classList.remove('hidden');
    const close = h('button.x', { onclick: (e) => { e.stopPropagation(); this.deselect(); } }, '✕');
    const buttons = h('div.buttons');
    if (it.hero != null) {
      const p = s.players[it.hero];
      const leader = this.db.leaders[p.leader];
      box.append(close, h('div.inspect-hero',
        portraitEl(leader, 'big'),
        h('h3', `${p.name} · ${leader.name}`),
        h('div.power-title', 'Hero power'),
        h('p.power-text', heroPowerText(leader)),
        h('p.muted', p.cooldown > 0 ? `Ready in ${p.cooldown} turn${p.cooldown === 1 ? '' : 's'}` : (leader.cooldown ? `Recharges every ${leader.cooldown} turns once used` : 'Ready')),
      ), buttons);
      if (it.hero === this.me && s.hints && s.hints.leader && !s.pending && s.active === this.me) {
        buttons.append(h('button.primary', {
          onclick: (e) => {
            e.stopPropagation();
            this.deselect();
            this.session.act({ type: 'leader' });
          },
        }, 'Use hero power'));
      }
      return;
    }
    const { form, ctx } = it;
    let unit = ctx.unit;
    if (ctx.side != null) {
      const lane = s.players[ctx.side].lanes[ctx.lane];
      const u = form.type === CardType.Building ? lane.building : lane.creature;
      if (!u || u.id !== form.id) return this.closeInspect();
      unit = form.type === CardType.Creature ? u : null;
    }
    box.append(close, cardEl(form, { size: 'zoom', level: ctx.level, cost: ctx.cost, unit }), buttons);
    if (unit && unit.damage > 0) buttons.append(h('div.muted', `Damage taken: ${unit.damage}`));
    const myTurn = s.active === this.me && s.phase === 'setup' && !s.pending;
    if (ctx.handCard && myTurn) {
      const lanes = s.hints.playable[ctx.handCard.uid] || [];
      if (form.type === CardType.Spell) {
        buttons.append(h('button.primary', {
          disabled: !lanes.length,
          onclick: (e) => {
            e.stopPropagation();
            const uid = ctx.handCard.uid;
            this.sel = null;
            this.closeInspect();
            this.session.act({ type: 'play', uid, lane: -1 });
          },
        }, `Cast (${ctx.cost} ⚡)`));
      } else if (lanes.length) {
        buttons.append(h('div.hint', 'Tap a glowing lane'));
      }
    }
    if (ctx.side === this.me && unit && s.hints && s.hints.floopable.includes(ctx.lane) && !s.pending) {
      buttons.append(h('button.primary', {
        onclick: (e) => {
          e.stopPropagation();
          this.deselect();
          this.session.act({ type: 'floop', lane: ctx.lane });
        },
      }, `Floop (${unit.floopCost} ⚡)`));
    }
  }

  closeInspect() {
    this.inspectFor = null;
    this.el.inspect.classList.add('hidden');
    clear(this.el.inspect);
  }

  showDiscard(side) {
    const s = this.snap;
    const pile = s.players[side].discard;
    const title = side === this.me ? 'Your discard pile' : `${s.players[side].name}'s discard pile`;
    const m = modal(h('div.dialog.wide',
      h('h2', title),
      pile.length ? h('div.card-grid', pile.map((c) => {
        const f = this.db.form(c.id);
        const el = cardEl(f, { size: 'hand', level: c.level });
        el.addEventListener('click', () => this.zoomModal(f, c.level));
        return el;
      })) : h('p.muted', 'Empty'),
      h('div.buttons', h('button', { onclick: () => m.close() }, 'Close')),
    ));
  }

  zoomModal(form, level) {
    const m = modal(h('div.dialog.zoom', cardEl(form, { size: 'zoom', level }), h('div.buttons', h('button', { onclick: () => m.close() }, 'Close'))));
  }

  /** A pending discard-pile choice gets its own dialog that can't be dismissed. */
  renderDiscardChoice() {
    const s = this.snap;
    const p = s.pending;
    const key = p && p.kind === 'discard' && p.player === this.me ? `${s.seq}` : null;
    if (this.discardKey === key) return;
    if (this.discardModal) {
      this.discardModal.close();
      this.discardModal = null;
    }
    this.discardKey = key;
    if (!key) return;
    const pile = s.players[p.side].discard;
    const src = p.source === 'leader' ? 'Hero power' : p.source ? this.cardName(p.source) : '';
    this.discardModal = modal(h('div.dialog.wide',
      h('h2', `${src ? src + ': ' : ''}${p.prompt || 'Pick a card'}`),
      h('p.muted', p.side === this.me ? 'From your discard pile' : `From ${s.players[p.side].name}'s discard pile`),
      h('div.card-grid', pile.map((c) => {
        const f = this.db.form(c.id);
        const ok = p.cards.includes(c.uid);
        const el = cardEl(f, { size: 'hand', level: c.level, cls: ok ? 'choosable' : 'unplayable' });
        if (ok) {
          el.addEventListener('click', () => {
            this.discardModal.close();
            this.discardModal = null;
            this.session.act({ type: 'discard', uid: c.uid });
          });
        }
        return el;
      })),
    ), { dismissable: false });
  }

  async maybeRing() {
    const s = this.snap;
    const p = s.pending;
    if (!p || p.kind !== 'ring' || p.player !== this.me || this.ringOpen) return;
    this.ringOpen = true;
    const atk = s.players[this.me].lanes[p.lane].creature;
    const opp = 1 - this.me;
    const def = s.players[opp].lanes[3 - p.lane].creature;
    const result = await spinRing(this.board, p, {
      attacker: atk ? this.cardName(atk.id) : 'Your creature',
      defender: def ? this.cardName(def.id) : '',
    });
    this.ringOpen = false;
    // Only answer if the ring is still the open choice (a timer may have moved on).
    if (this.snap.pending && this.snap.pending.kind === 'ring' && this.snap.seq === s.seq) {
      this.session.act({ type: 'ring', result });
    } else if (this.snap.pending && this.snap.pending.kind === 'ring') {
      this.maybeRing();
    }
  }

  // ---------------------------------------------------------------- screens
  passScreen(seat) {
    return new Promise((resolve) => {
      const name = (this.session.names && this.session.names[seat]) || `Player ${seat + 1}`;
      const cover = h('div.pass-screen',
        h('div.pass-box',
          h('h2', `Pass to ${name}`),
          h('p', 'No peeking at the other hand!'),
          h('button.primary.big', {
            onclick: () => {
              cover.remove();
              this.session.reveal(seat);
              resolve();
            },
          }, `I'm ${name}, show my cards`),
        ));
      this.closeInspect();
      this.sel = null;
      this.board.append(cover);
    });
  }

  showGameOver() {
    if (this.gameOverModal) return;
    const s = this.snap;
    const won = s.winner === this.me;
    const hotseat = this.session.mode === 'hotseat';
    const title = hotseat ? `${s.players[s.winner].name} wins!` : won ? 'You win!' : 'You lose';
    const loser = 1 - s.winner;
    const you = loser === this.me && !hotseat;
    const reason = s.endReason === 'concede'
      ? (you ? 'You conceded.' : `${s.players[loser].name} conceded.`)
      : (you ? 'Your hero was defeated.' : `${s.players[loser].name}'s hero was defeated.`);
    const leader = this.db.leaders[s.players[s.winner].leader];
    const note = h('p.rematch-note');
    const again = h('button.primary', {
      onclick: () => {
        if (this.session.mode === 'online') {
          again.disabled = true;
          note.textContent = 'Waiting for your opponent…';
        } else {
          this.gameOverModal.close();
        }
        this.session.rematch();
      },
    }, 'Rematch');
    this.gameOverModal = modal(h('div.dialog.gameover', { class: won || hotseat ? 'won' : 'lost' },
      portraitEl(leader, 'big'),
      h('h2', title),
      h('p', reason),
      note,
      h('div.buttons', again, h('button', { onclick: () => this.exit() }, 'Main menu')),
    ), { dismissable: false, onClose: () => { this.gameOverModal = null; } });
    // A rematch arrives as a fresh game: close the dialog then.
    const watch = setInterval(() => {
      if (!this.gameOverModal) return clearInterval(watch);
      if (this.snap.phase !== 'gameover') {
        clearInterval(watch);
        this.gameOverModal.close();
      }
    }, 300);
  }

  openMenu() {
    const online = this.session.mode === 'online';
    const over = this.snap && this.snap.phase === 'gameover';
    const m = modal(h('div.dialog',
      h('h2', 'Menu'),
      h('div.buttons.col',
        !over && this.snap ? h('button', {
          onclick: () => {
            m.close();
            this.session.act({ type: 'concede' });
          },
        }, this.session.mode === 'hotseat' ? `${this.snap.players[this.me].name} concedes` : 'Concede') : null,
        h('button', { onclick: () => { m.close(); this.exit(); } }, online ? 'Leave match' : 'Quit to menu'),
        h('button', { onclick: () => { m.close(); showHelp(); } }, 'How to play'),
        h('button.primary', { onclick: () => m.close() }, 'Back to the game'),
      ),
    ));
  }

  exit() {
    document.querySelectorAll('.modal-back').forEach((b) => b.remove());
    this.session.leave();
    this.destroy();
    this.onExit();
  }
}

function whyNot(form, player, card) {
  if (player.magic < card.cost) return `Not enough magic (needs ${card.cost})`;
  if (form.type !== CardType.Spell && form.faction !== 'Universal' && !player.lanes.some((l) => l.type === form.faction && !l.flipped)) {
    return `Needs a ${LANDSCAPE_NAMES[form.faction]} lane`;
  }
  return "Can't play this right now";
}

export function showHelp() {
  const m = modal(h('div.dialog.help',
    h('h2', 'How to play'),
    h('ul',
      h('li', 'Each player has 4 lanes. Your lane faces the opponent lane right above it.'),
      h('li', 'Every turn you draw a card and get magic (⚡). Play creatures and buildings into lanes that match their landscape; Rainbow cards go anywhere.'),
      h('li', 'Floop a creature to use its ability. A flooped creature still attacks.'),
      h('li', 'Press Battle! and each of your creatures attacks the lane in front of it. An empty lane means the hit goes to the hero.'),
      h('li', 'Stop the spinning sword on green to hit, bright green to crit (double damage). Red misses.'),
      h('li', 'Your hero power (tap your portrait) recharges over a few turns.'),
      h('li', 'Bring the other hero to 0 to win. Run out of cards and your board is cleared and your cards reshuffled.'),
    ),
    h('div.buttons', h('button.primary', { onclick: () => m.close() }, 'Got it')),
  ));
}

export { TYPE_NAMES, describe };
