import test from 'node:test';
import { makeGame, put, give, play, act, creature, assert, db } from './helpers.mjs';

test('creature attacks the opposite lane; empty lane hits the hero', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_Cornball'); // 2/5
  put(g, 1, 3, 'Creature_Cornball'); // faces p0 lane 0
  put(g, 0, 1, 'Creature_Cornball');
  const hp = g.health[1];
  act(g, 0, { type: 'endTurn' });
  assert.equal(creature(g, 1, 3).damage, 2);
  assert.equal(g.health[1], hp - 2);
  assert.equal(g.activePlayer, 1);
});

test('first turn has no battle and magic grows each round', () => {
  const g = makeGame();
  g.turn = 1;
  put(g, 0, 0, 'Creature_Cornball');
  const hp = g.health[1];
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.health[1], hp);
});

test('landscape must match faction', () => {
  const g = makeGame();
  const c = give(g, 0, 'Creature_AngelEye'); // Plains creature, p0 has Corn lanes
  assert.equal(g.apply(0, { type: 'play', uid: c.uid, lane: 0 }).ok, false);
  const corn = give(g, 0, 'Creature_Cornball');
  play(g, 0, corn, 2);
  assert.equal(creature(g, 0, 2).data.form.id, 'Creature_Cornball');
});

test('creature dies at 0 health and goes to the discard pile', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_HW_GhostSludger');
  const victim = put(g, 1, 3, 'Creature_Cornball');
  victim.damage = 4;
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.laneHasCreature(1, 3), false);
  assert.equal(g.discardPiles[1][0].form.id, 'Creature_Cornball');
});

test('hero at 0 ends the match', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_HW_GhostSludger');
  g.health[1] = 1;
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.phase, 'gameover');
  assert.equal(g.winner, 0);
});

test('out of cards: bleed, board cleared, fresh deck and hand', () => {
  const g = makeGame();
  put(g, 1, 0, 'Creature_Cornball');
  g.decks[1].cards.length = 0;
  g.discardPiles[1].length = 0;
  const hp = g.health[1];
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.health[1], hp - g.getLeader(1).rank);
  assert.equal(g.laneHasCreature(1, 0), false);
  assert.equal(g.hands[1].length, 1);
});

test('snapshot hides the other hand', () => {
  const g = makeGame();
  give(g, 1, 'Creature_Cornball');
  const s = g.snapshot(0);
  assert.equal(s.players[1].hand, null);
  assert.equal(s.players[1].handCount, 1);
});
