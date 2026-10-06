// Runs a Game for the seats at this device (host, pass-and-play or practice)
// and hands each seat its own view: a snapshot plus the events it hasn't seen.
import { Game } from './engine/game.js';
import { chooseBotAction } from './bot.js';

/** Removes what `viewer` must not learn from an event (cards entering the other hand). */
export function eventForViewer(ev, viewer) {
  if (ev.t === 'toHand' && ev.side !== viewer) {
    const { card, ...rest } = ev;
    return rest;
  }
  return ev;
}

export class MatchController {
  /**
   * @param {import('./engine/cards.js').CardDb} db
   * @param {{decks: object[], names: string[], settings: object, bots?: boolean[]}} cfg
   */
  constructor(db, cfg) {
    this.db = db;
    this.cfg = cfg;
    this.subs = [];
    this.bots = cfg.bots || [false, false];
    this.botTimer = null;
    this.turnTimer = null;
    this.turnKey = null;
    this.deadline = 0;
    this.newGame();
  }

  newGame() {
    const s = this.cfg.settings || {};
    this.game = new Game(this.db, {
      ring: s.ring !== false,
      cardLevel: s.cardLevel || 1,
      heroLevel: s.heroLevel || 15,
    });
    this.game.start(this.cfg.decks, this.cfg.names);
    this.turnKey = null;
    for (const sub of this.subs) sub.seen = 0;
    this.publish();
  }

  /** cb({snap, events}) whenever the game changes. */
  subscribe(player, cb) {
    const sub = { player, cb, seen: 0 };
    this.subs.push(sub);
    this.deliver(sub);
    return () => { this.subs = this.subs.filter((s) => s !== sub); };
  }

  act(player, action) {
    const r = this.game.apply(player, action);
    if (r.ok) this.publish();
    return r;
  }

  publish() {
    this.scheduleTurnTimer();
    for (const sub of this.subs) this.deliver(sub);
    this.scheduleBot();
  }

  deliver(sub) {
    const events = this.game.eventsSince(sub.seen).map((e) => eventForViewer(e, sub.player));
    sub.seen = this.game.seq;
    const snap = this.game.snapshot(sub.player);
    if (this.deadline) snap.turnLeft = Math.max(0, Math.round((this.deadline - Date.now()) / 1000));
    sub.cb({ snap, events });
  }

  /** Optional turn limit: when time runs out the current choice is made for the player and the turn ends. */
  scheduleTurnTimer() {
    const secs = (this.cfg.settings || {}).turnSeconds;
    const g = this.game;
    if (!secs || g.phase === 'gameover') {
      clearTimeout(this.turnTimer);
      this.deadline = 0;
      return;
    }
    const key = g.turn + ':' + g.activePlayer;
    if (key === this.turnKey) return;
    this.turnKey = key;
    clearTimeout(this.turnTimer);
    this.deadline = Date.now() + secs * 1000;
    this.turnTimer = setTimeout(() => this.timeUp(key), secs * 1000);
  }

  timeUp(key) {
    const g = this.game;
    for (let n = 0; n < 40 && g.phase !== 'gameover' && g.turn + ':' + g.activePlayer === key; n++) {
      const actor = g.pending ? g.pending.player : g.activePlayer;
      let a = g.pending ? chooseBotAction(g, actor) : { type: 'endTurn' };
      if (a && a.type === 'ring') a = { type: 'ring', result: 'hit' };
      if (!a || !g.apply(actor, a).ok) break;
    }
    this.publish();
  }

  scheduleBot() {
    clearTimeout(this.botTimer);
    const g = this.game;
    if (g.phase === 'gameover') return;
    const actor = g.pending ? g.pending.player : g.activePlayer;
    if (!this.bots[actor]) return;
    const delay = g.pending && g.pending.kind === 'ring' ? 700 : 900;
    this.botTimer = setTimeout(() => {
      const a = chooseBotAction(g, actor);
      if (!a) return;
      const r = this.act(actor, a);
      if (!r.ok) this.act(actor, { type: 'endTurn' });
    }, delay);
  }

  dispose() {
    clearTimeout(this.botTimer);
    clearTimeout(this.turnTimer);
    this.subs = [];
  }
}
