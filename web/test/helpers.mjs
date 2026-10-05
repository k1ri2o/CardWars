// Test helpers: build a match and set up exact board positions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { CardDb, CardItem } from '../js/engine/cards.js';
import { Game } from '../js/engine/game.js';
import '../js/engine/scripts/index.js';

export const db = new CardDb(JSON.parse(fs.readFileSync(new URL('../data/cards.json', import.meta.url))));

/**
 * A match on turn 2 (so battles happen), player 0 to act, both hands empty,
 * 10 magic each, decks of 20 filler cards.
 * opts.landscapes: [[4 for p0], [4 for p1]] (default all 'Corn' / all 'Plains')
 * opts.heroes: ['Leader_Finn', 'Leader_Jake']
 */
export function makeGame(opts = {}) {
  const landscapes = opts.landscapes || [['Corn', 'Corn', 'Corn', 'Corn'], ['Plains', 'Plains', 'Plains', 'Plains']];
  const heroes = opts.heroes || ['Leader_Finn', 'Leader_Jake'];
  const filler = opts.filler || 'Creature_Cornball';
  const g = new Game(db, { seed: opts.seed ?? 1, ring: false, heroLevel: 3, ...opts.game });
  const deck = (p) => ({ leader: heroes[p], landscapes: landscapes[p], cards: Array(20).fill(filler) });
  g.start([deck(0), deck(1)], ['P0', 'P1'], 0);
  g.turn = 2;
  for (const p of [0, 1]) {
    g.hands[p].length = 0;
    g.magicPoints[p] = 10;
    g.leaderCooldown[p] = 0;
  }
  g.events.length = 0;
  return g;
}

/** Summons `cardId` for `player` into `lane` directly, free, ignoring landscape. */
export function put(g, player, lane, cardId, level = 1) {
  const item = new CardItem(db.form(cardId), level);
  g.hands[player].push(item);
  const mp = g.magicPoints[player];
  g.magicPoints[player] = 99;
  g.summon(player, lane, item);
  g.magicPoints[player] = mp;
  g.settle();
  const type = item.form.type;
  return g.getScript(player, lane, type);
}

/** Adds `cardId` to `player`'s hand and returns the CardItem. */
export function give(g, player, cardId, level = 1) {
  const item = new CardItem(db.form(cardId), level);
  g.hands[player].push(item);
  return item;
}

/** Puts `cardId` on top of `player`'s discard pile and returns it. */
export function discard(g, player, cardId, level = 1) {
  const item = new CardItem(db.form(cardId), level);
  g.discardPiles[player].unshift(item);
  return item;
}

/** apply() that must succeed. */
export function act(g, player, action) {
  const r = g.apply(player, action);
  assert.ok(r.ok, `action ${JSON.stringify(action)} failed: ${r.error}`);
  assert.ok(!r.warning, `action ${JSON.stringify(action)} threw inside the engine: ${r.warning}`);
  return r;
}

/** Floops the creature in `lane` for `player` (must be legal). */
export function floop(g, player, lane) {
  return act(g, player, { type: 'floop', lane });
}

/** Plays a card from hand (spells: lane -1). */
export function play(g, player, item, lane = -1) {
  return act(g, player, { type: 'play', uid: item.uid, lane });
}

/** Answers the pending lane choice. */
export function target(g, player, lane) {
  assert.ok(g.pending && g.pending.kind === 'lane', 'expected a lane choice');
  return act(g, player, { type: 'target', lane });
}

export function creature(g, player, lane) { return g.getCreature(player, lane); }
export function building(g, player, lane) { return g.getBuilding(player, lane); }

/** Every card id that uses `scriptName`. */
export function cardsWithScript(scriptName) {
  return Object.values(db.forms).filter((f) => f.scriptName === scriptName).map((f) => f.id);
}
export function heroesWithScript(scriptName) {
  return Object.values(db.leaders).filter((f) => f.scriptName === scriptName).map((f) => f.id);
}

export { assert };
