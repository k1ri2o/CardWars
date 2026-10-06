// Bot-vs-bot matches across every preset deck: no ability may throw and
// every match must finish.
import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from './helpers.mjs';
import { Game } from '../js/engine/game.js';
import { Rng } from '../js/engine/rng.js';
import { playBotMatch } from '../js/bot.js';

const ROUNDS = Number(process.env.SOAK_ROUNDS || 2);

test('every preset deck plays full matches without engine errors', () => {
  const decks = db.decks;
  const errors = [];
  let turns = 0;
  let games = 0;
  for (let round = 0; round < ROUNDS; round++) {
    for (let i = 0; i < decks.length; i++) {
      const j = (i + 1 + round * 5) % decks.length;
      const seed = 1000 * round + i + 1;
      const rng = new Rng(seed * 7 + 3);
      const g = new Game(db, { seed, ring: round % 2 === 0, heroLevel: 3 });
      const origError = console.error;
      console.error = () => {};
      const apply = g.apply.bind(g);
      g.apply = (p, a) => {
        const r = apply(p, a);
        if (r.warning) errors.push(`${decks[i].leader} vs ${decks[j].leader}: ${a.type} ${r.warning}`);
        return r;
      };
      try {
        g.start([decks[i], decks[j]], ['A', 'B']);
        playBotMatch(g, { rnd: () => rng.next() });
      } finally {
        console.error = origError;
      }
      games++;
      turns += g.turn;
      assert.equal(g.phase, 'gameover', `${decks[i].id} vs ${decks[j].id} did not finish`);
    }
  }
  if (errors.length) console.log(errors.join('\n'));
  console.log(`soak: ${games} matches, ${(turns / games).toFixed(1)} turns on average`);
  assert.deepEqual(errors, []);
});
