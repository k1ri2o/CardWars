// Match controller and online host protocol, with in-memory pipes instead of WebRTC.
import test from 'node:test';
import { db, assert } from './helpers.mjs';
import { MatchController, eventForViewer } from '../js/match.js';
import { HostRoom, LocalSession, PROTOCOL } from '../js/session.js';
import { validateDeck, deckDesc } from '../js/decks.js';

const deckA = deckDesc(db.decks[0]);
const deckB = deckDesc(db.decks[1]);
const settings = { ring: true, cardLevel: 1, heroLevel: 15 };

class FakePipe {
  constructor() {
    this.sent = [];
    this.handlers = { message: [], close: [] };
    this.closed = false;
  }
  on(kind, h) { this.handlers[kind].push(h); }
  send(m) { if (!this.closed) this.sent.push(JSON.parse(JSON.stringify(m))); }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const h of this.handlers.close) h();
  }
  receive(m) { for (const h of this.handlers.message) h(m); }
  last(t) { return [...this.sent].reverse().find((m) => m.t === t); }
}

function hostWithGuest() {
  const room = new HostRoom(db);
  room.code = 'TEST01';
  room.setLobbyInfo('Host', settings);
  const pipe = new FakePipe();
  room.onPipe(pipe);
  pipe.receive({ t: 'hello', ver: PROTOCOL, name: 'Guest', deck: deckB, token: 'tok' });
  return { room, pipe };
}

test('each seat only sees its own hand', () => {
  const mc = new MatchController(db, { decks: [deckA, deckB], names: ['A', 'B'], settings });
  const seen = [];
  mc.subscribe(0, (u) => seen.push(u));
  const snap = seen[0].snap;
  assert.ok(Array.isArray(snap.players[0].hand));
  assert.equal(snap.players[1].hand, null);
  assert.equal(snap.players[1].handCount, 5 + (snap.first === 1 ? 1 : 0));
  assert.ok(snap.hints);
  mc.dispose();
});

test('drawn cards are hidden from the other player', () => {
  assert.deepEqual(eventForViewer({ t: 'toHand', side: 1, card: 'Creature_Cornball' }, 0), { t: 'toHand', side: 1 });
  assert.equal(eventForViewer({ t: 'toHand', side: 0, card: 'Creature_Cornball' }, 0).card, 'Creature_Cornball');
});

test('the turn timer ends a stalled turn', async () => {
  const mc = new MatchController(db, { decks: [deckA, deckB], names: ['A', 'B'], settings: { ...settings, turnSeconds: 0.05 } });
  const first = mc.game.activePlayer;
  const snaps = [];
  mc.subscribe(0, (u) => snaps.push(u.snap));
  assert.ok(snaps[0].turnLeft >= 0);
  await new Promise((r) => setTimeout(r, 200));
  assert.notEqual(mc.game.activePlayer, first);
  assert.ok(mc.game.turn >= 2);
  mc.dispose();
});

test('preset decks are all playable', () => {
  for (const d of db.decks) assert.equal(validateDeck(db, { ...d, preset: true }), null, d.id);
  assert.match(validateDeck(db, { ...deckA, cards: deckA.cards.slice(0, 3) }), /at least/);
  assert.match(validateDeck(db, { ...deckA, preset: false, cards: Array(5).fill('Creature_Cornball').concat(deckA.cards) }), /copies/);
});

test('host welcomes a guest, starts, and streams state', () => {
  const { room, pipe } = hostWithGuest();
  assert.equal(pipe.last('welcome').hostName, 'Host');
  assert.equal(room.guest.name, 'Guest');
  const local = [];
  room.listen((m) => local.push(m));
  room.start({ hostName: 'Host', hostDeck: deckA, settings });
  assert.ok(pipe.last('start'));
  const st = pipe.last('state');
  assert.ok(st.snap.players[1].hand, 'guest sees its own hand');
  assert.equal(st.snap.players[0].hand, null, 'guest does not see the host hand');
  assert.equal(local.at(-1).kind, 'update');
  assert.equal(local.at(-1).snap.players[1].hand, null);
  room.mc.dispose();
});

test('host refuses guest actions out of turn and applies legal ones', () => {
  const { room, pipe } = hostWithGuest();
  room.start({ hostName: 'Host', hostDeck: deckA, settings });
  const g = room.mc.game;
  const other = g.activePlayer === 1 ? 0 : 1;
  if (g.activePlayer === 0) {
    pipe.receive({ t: 'action', action: { type: 'endTurn' } });
    assert.equal(pipe.last('error').error, 'Not your turn');
    room.act({ type: 'endTurn' });
  }
  assert.equal(g.activePlayer, 1);
  const before = pipe.sent.length;
  pipe.receive({ t: 'action', action: { type: 'endTurn' } });
  assert.ok(pipe.sent.length > before);
  void other;
  room.mc.dispose();
});

test('a dropped guest can rejoin with the same token; strangers cannot', () => {
  const { room, pipe } = hostWithGuest();
  const local = [];
  room.listen((m) => local.push(m));
  room.start({ hostName: 'Host', hostDeck: deckA, settings });
  pipe.close();
  assert.equal(room.guest.connected, false);
  assert.match(local.find((m) => m.kind === 'status').text, /rejoin/);

  const stranger = new FakePipe();
  room.onPipe(stranger);
  stranger.receive({ t: 'hello', ver: PROTOCOL, name: 'Eve', deck: deckB, token: 'other' });
  assert.match(stranger.last('reject').error, /already started/);

  const back = new FakePipe();
  room.onPipe(back);
  back.receive({ t: 'hello', ver: PROTOCOL, name: 'Guest', deck: deckB, token: 'tok' });
  assert.ok(back.last('welcome'));
  assert.ok(back.last('start'));
  assert.ok(back.last('state').snap.players[1].hand);
  assert.equal(room.guest.connected, true);
  room.mc.dispose();
});

test('host rejects other versions and bad decks', () => {
  const room = new HostRoom(db);
  const p1 = new FakePipe();
  room.onPipe(p1);
  p1.receive({ t: 'hello', ver: PROTOCOL + 1, name: 'X', deck: deckB, token: 'a' });
  assert.match(p1.last('reject').error, /versions/);
  const p2 = new FakePipe();
  room.onPipe(p2);
  p2.receive({ t: 'hello', ver: PROTOCOL, name: 'X', deck: { ...deckB, cards: ['Nope'] }, token: 'b' });
  assert.match(p2.last('reject').error, /deck/);
  assert.equal(room.guest, null);
});

test('rematch starts when both players ask', () => {
  const { room, pipe } = hostWithGuest();
  room.start({ hostName: 'Host', hostDeck: deckA, settings });
  room.act({ type: 'concede' });
  assert.equal(room.mc.game.phase, 'gameover');
  room.rematch();
  assert.ok(pipe.last('rematch'));
  assert.equal(room.mc.game.phase, 'gameover');
  pipe.receive({ t: 'rematch' });
  assert.equal(room.mc.game.phase, 'setup');
  room.mc.dispose();
});

test('pass-and-play hides the board until the next player takes over', () => {
  const s = new LocalSession(db, { decks: [deckA, deckB], names: ['P1', 'P2'], settings, humans: [true, true] });
  const msgs = [];
  s.listen((m) => msgs.push(m));
  assert.equal(msgs[0].kind, 'pass');
  const seat = msgs[0].seat;
  assert.equal(msgs.length, 1, 'nothing is shown before the hand-over');
  s.reveal(seat);
  const u = msgs.at(-1);
  assert.equal(u.kind, 'update');
  assert.equal(u.seat, seat);
  assert.ok(u.snap.players[seat].hand);
  assert.equal(u.snap.players[1 - seat].hand, null);
  s.act({ type: 'endTurn' });
  assert.equal(msgs.at(-1).kind, 'pass');
  assert.equal(msgs.at(-1).seat, 1 - seat);
  s.leave();
});
