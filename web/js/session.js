// Sessions connect the board to a match. All of them talk to the board the
// same way: session.listen(cb) delivers messages, session.act(action) plays.
//   {kind:'update', seat, snap, events, fresh}   new state for the seat on screen
//   {kind:'pass', seat}                           pass-and-play: hand the device over
//   {kind:'status', text, level}                  connection news ('' text clears it)
//   {kind:'rematch', from}                        the other player asked for a rematch
//   {kind:'error', error}                         an action was refused
//   {kind:'closed', text}                         the match is over for good
import { MatchController } from './match.js';
import { hostRoom, joinRoom } from './net/peer.js';
import { validateDeck } from './decks.js';

export const PROTOCOL = 1;

class Emitter {
  constructor() {
    this.listeners = [];
    this.backlog = [];
  }

  listen(cb) {
    this.listeners.push(cb);
    const b = this.backlog;
    this.backlog = [];
    for (const m of b) cb(m);
    return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
  }

  send(msg) {
    if (!this.listeners.length) {
      this.backlog.push(msg);
      return;
    }
    for (const l of this.listeners) l(msg);
  }
}

// ---------------------------------------------------------------------------
// Practice against the bot, or pass-and-play on one device.
// ---------------------------------------------------------------------------
export class LocalSession extends Emitter {
  /** humans: [bool, bool]; two humans means pass-and-play. */
  constructor(db, { decks, names, settings, humans }) {
    super();
    this.mode = humans[0] && humans[1] ? 'hotseat' : 'practice';
    this.humans = humans;
    this.names = names;
    this.latest = [null, null];
    this.viewer = humans[0] ? 0 : 1;
    this.waitingPass = false;
    this.mc = new MatchController(db, { decks, names, settings, bots: humans.map((x) => !x) });
    if (this.mode === 'hotseat') this.handOver();
    for (const seat of [0, 1]) {
      if (!humans[seat]) continue;
      this.mc.subscribe(seat, (u) => this.onUpdate(seat, u));
    }
  }

  /** Pass-and-play: cover the screen until whoever acts next takes the device. */
  handOver() {
    this.waitingPass = true;
    this.send({ kind: 'pass', seat: this.actor() });
  }

  actor() {
    const g = this.mc.game;
    if (g.phase === 'gameover') return this.viewer;
    return g.pending ? g.pending.player : g.activePlayer;
  }

  onUpdate(seat, u) {
    this.latest[seat] = u.snap;
    if (seat !== this.viewer || this.waitingPass) return;
    this.send({ kind: 'update', seat, snap: u.snap, events: u.events });
    if (this.mode === 'hotseat') {
      const next = this.actor();
      if (next !== this.viewer && this.humans[next]) this.handOver();
    }
  }

  /** Pass-and-play: the next player took the device. */
  reveal(seat) {
    this.viewer = seat;
    this.waitingPass = false;
    this.send({ kind: 'update', seat, snap: this.latest[seat], events: [], fresh: true });
  }

  act(action) {
    const r = this.mc.act(this.viewer, action);
    if (!r.ok) this.send({ kind: 'error', error: r.error });
    return r;
  }

  rematch() {
    if (this.mode === 'hotseat') {
      this.waitingPass = true;
      this.mc.newGame();
      this.handOver();
    } else {
      this.mc.newGame();
    }
  }

  leave() {
    this.mc.dispose();
  }
}

// ---------------------------------------------------------------------------
// Online host: runs the match, plays seat 0, streams seat 1 to the guest.
// The room exists before the match so the lobby can show who joined.
// ---------------------------------------------------------------------------
export class HostRoom extends Emitter {
  constructor(db) {
    super();
    this.db = db;
    this.mode = 'online';
    this.guest = null; // { name, deck, token, pipe }
    this.mc = null;
    this.rematchWanted = [false, false];
    this.lobbyListeners = [];
  }

  async open(preferredCode) {
    const { code, peer, label } = await hostRoom((pipe) => this.onPipe(pipe), preferredCode);
    this.code = code;
    this.peer = peer;
    this.label = label;
    return code;
  }

  onLobby(cb) { this.lobbyListeners.push(cb); }
  lobbyChanged() { for (const cb of this.lobbyListeners) cb(this.guest); }

  onPipe(pipe) {
    let introduced = false;
    const timer = setTimeout(() => { if (!introduced) pipe.close(); }, 10000);
    pipe.on('message', (m) => {
      if (!introduced) {
        if (m.t !== 'hello') return;
        introduced = true;
        clearTimeout(timer);
        this.onHello(pipe, m);
        return;
      }
      if (this.guest && this.guest.pipe === pipe) this.onGuestMessage(m);
    });
    pipe.on('close', () => {
      if (this.guest && this.guest.pipe === pipe) this.onGuestLeft();
    });
  }

  onHello(pipe, m) {
    if (m.ver !== PROTOCOL) {
      pipe.send({ t: 'reject', error: 'You and the host are on different versions of the game. Both reload the page.' });
      setTimeout(() => pipe.close(), 500);
      return;
    }
    if (this.guest && this.guest.token !== m.token && this.guest.connected) {
      pipe.send({ t: 'reject', error: 'This room already has two players.' });
      setTimeout(() => pipe.close(), 500);
      return;
    }
    if (this.mc && (!this.guest || this.guest.token !== m.token)) {
      pipe.send({ t: 'reject', error: 'That match already started with someone else.' });
      setTimeout(() => pipe.close(), 500);
      return;
    }
    const err = validateDeck(this.db, m.deck);
    if (err) {
      pipe.send({ t: 'reject', error: 'Your deck can not be used: ' + err });
      setTimeout(() => pipe.close(), 500);
      return;
    }
    const name = String(m.name || 'Guest').slice(0, 20);
    const old = this.guest;
    // During a match the guest keeps the deck they started with.
    const deck = this.mc && old ? old.deck : m.deck;
    this.guest = { name, deck, token: m.token, pipe, connected: true };
    if (old && old.pipe !== pipe) old.pipe.close();
    pipe.send({ t: 'welcome', hostName: this.hostName, settings: this.settings });
    if (this.mc) {
      // Rejoin: hand the guest the whole current state.
      pipe.send({ t: 'start' });
      this.subscribeGuest();
      this.send({ kind: 'status', text: '' });
    }
    this.lobbyChanged();
  }

  setLobbyInfo(hostName, settings) {
    this.hostName = hostName;
    this.settings = settings;
    if (this.guest && this.guest.connected) this.guest.pipe.send({ t: 'lobby', hostName, settings });
  }

  onGuestMessage(m) {
    if (m.t === 'action' && this.mc) {
      const r = this.mc.act(1, m.action);
      if (!r.ok) this.guest.pipe.send({ t: 'error', error: r.error });
    } else if (m.t === 'rematch' && this.mc) {
      this.rematchWanted[1] = true;
      if (this.rematchWanted[0]) this.startRematch();
      else this.send({ kind: 'rematch', from: 1 });
    } else if (m.t === 'bye') {
      this.guest.connected = false;
      this.send({ kind: 'closed', text: `${this.guest.name} left the match.` });
      this.lobbyChanged();
    }
  }

  onGuestLeft() {
    this.guest.connected = false;
    if (this.unsubGuest) this.unsubGuest();
    this.unsubGuest = null;
    if (this.mc) {
      this.send({ kind: 'status', level: 'warn', text: `${this.guest.name} lost the connection. They can rejoin with code ${this.code}.` });
    } else {
      this.guest = null;
    }
    this.lobbyChanged();
  }

  /** Lobby: the host pressed Start. */
  start({ hostName, hostDeck, settings }) {
    this.names = [hostName, this.guest.name];
    this.mc = new MatchController(this.db, {
      decks: [hostDeck, this.guest.deck],
      names: this.names,
      settings,
    });
    this.guest.pipe.send({ t: 'start' });
    this.mc.subscribe(0, (u) => this.send({ kind: 'update', seat: 0, snap: u.snap, events: u.events }));
    this.subscribeGuest();
  }

  subscribeGuest() {
    if (this.unsubGuest) this.unsubGuest();
    const pipe = this.guest.pipe;
    this.unsubGuest = this.mc.subscribe(1, (u) => pipe.send({ t: 'state', snap: u.snap, events: u.events }));
  }

  act(action) {
    const r = this.mc.act(0, action);
    if (!r.ok) this.send({ kind: 'error', error: r.error });
    return r;
  }

  rematch() {
    this.rematchWanted[0] = true;
    if (this.rematchWanted[1]) this.startRematch();
    else if (this.guest && this.guest.connected) this.guest.pipe.send({ t: 'rematch', from: 0 });
  }

  startRematch() {
    this.rematchWanted = [false, false];
    this.mc.newGame();
  }

  leave() {
    if (this.guest && this.guest.connected) this.guest.pipe.send({ t: 'bye' });
    if (this.mc) this.mc.dispose();
    setTimeout(() => { try { this.peer.destroy(); } catch { /* gone */ } }, 300);
  }
}

// ---------------------------------------------------------------------------
// Online guest: sends actions, renders what the host sends back.
// ---------------------------------------------------------------------------
export class GuestRoom extends Emitter {
  /** token: reuse one to take your seat back after reloading the page. */
  constructor(token) {
    super();
    this.mode = 'online';
    this.token = token || Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.started = false;
    this.left = false;
    this.lobbyListeners = [];
  }

  onLobby(cb) { this.lobbyListeners.push(cb); }

  async join(code, name, deck) {
    this.code = code;
    this.name = name;
    this.deck = deck;
    await this.connect();
  }

  async connect() {
    const { pipe, peer } = await joinRoom(this.code);
    this.pipe = pipe;
    this.peer = peer;
    let welcomed = false;
    const welcome = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pipe.close(); reject(new Error('The host did not answer.')); }, 10000);
      pipe.on('message', (m) => {
        if (m.t === 'welcome') { welcomed = true; clearTimeout(timer); resolve(m); }
        else if (m.t === 'reject') { clearTimeout(timer); reject(new Error(m.error)); }
        else if (welcomed) this.onMessage(m);
      });
      pipe.on('close', () => {
        clearTimeout(timer);
        if (welcomed) this.onClose();
        else reject(new Error('The host closed the connection.'));
      });
      pipe.send({ t: 'hello', ver: PROTOCOL, name: this.name, deck: this.deck, token: this.token });
    }).catch((e) => {
      try { peer.destroy(); } catch { /* gone */ }
      throw e;
    });
    this.hostName = welcome.hostName;
    this.settings = welcome.settings;
    for (const cb of this.lobbyListeners) cb({ t: 'lobby', hostName: welcome.hostName, settings: welcome.settings });
  }

  onMessage(m) {
    switch (m.t) {
      case 'lobby':
        this.hostName = m.hostName;
        this.settings = m.settings;
        for (const cb of this.lobbyListeners) cb(m);
        break;
      case 'start':
        this.started = true;
        for (const cb of this.lobbyListeners) cb(m);
        break;
      case 'state':
        this.started = true;
        this.send({ kind: 'update', seat: 1, snap: m.snap, events: m.events });
        break;
      case 'error':
        this.send({ kind: 'error', error: m.error });
        break;
      case 'rematch':
        this.send({ kind: 'rematch', from: 0 });
        break;
      case 'bye':
        this.left = true;
        this.send({ kind: 'closed', text: `${this.hostName || 'The host'} closed the match.` });
        for (const cb of this.lobbyListeners) cb({ t: 'bye' });
        break;
      default:
    }
  }

  onClose() {
    if (this.left || this.closing) return;
    if (!this.started) {
      for (const cb of this.lobbyListeners) cb({ t: 'lost' });
      return;
    }
    this.send({ kind: 'status', level: 'warn', text: 'Lost the connection to the host. Reconnecting…' });
    this.reconnect(0);
  }

  async reconnect(attempt) {
    if (this.left || this.closing) return;
    try {
      try { this.peer.destroy(); } catch { /* gone */ }
      await this.connect();
      this.send({ kind: 'status', text: '' });
    } catch (e) {
      if (attempt < 5) {
        setTimeout(() => this.reconnect(attempt + 1), 3000);
      } else {
        this.send({ kind: 'closed', text: "Couldn't reconnect to the host. If they closed their tab, the match is over." });
      }
    }
  }

  act(action) {
    this.pipe.send({ t: 'action', action });
    return { ok: true };
  }

  rematch() {
    this.pipe.send({ t: 'rematch' });
  }

  leave() {
    this.closing = true;
    if (this.pipe) this.pipe.send({ t: 'bye' });
    setTimeout(() => { try { this.peer.destroy(); } catch { /* gone */ } }, 300);
  }
}
