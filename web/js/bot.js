// A simple practice opponent. It only plays legal moves (it reads the same
// hints the UI shows) and makes cheap greedy choices; it is not the original
// AIManager. Also used for the bot-vs-bot soak tests.
import { CardType, other } from './engine/consts.js';

export function chooseBotAction(game, player, rnd = Math.random) {
  const p = game.pending;
  if (p) {
    if (p.player !== player) return null;
    if (p.kind === 'ring') {
      const r = rnd();
      return { type: 'ring', result: r < 0.12 ? 'crit' : r < 0.25 ? 'miss' : 'hit' };
    }
    if (p.kind === 'lane') return { type: 'target', lane: pickLane(game, player, p) };
    if (p.kind === 'discard') {
      const pile = game.getDiscardPile(p.side);
      const best = p.cards
        .map((uid) => pile.find((c) => c.uid === uid))
        .filter(Boolean)
        .sort((a, b) => b.form.cost - a.form.cost)[0];
      return { type: 'discard', uid: best ? best.uid : p.cards[0] };
    }
    return null;
  }
  if (game.phase !== 'setup' || game.activePlayer !== player) return null;

  const snap = game.snapshot(player);
  const hints = snap.hints;
  const hand = game.getHand(player);

  // Creatures first, into empty lanes, facing enemies where possible.
  const creatures = hand.filter((c) => c.form.type === CardType.Creature)
    .sort((a, b) => (b.atk + b.def) - (a.atk + a.def));
  for (const c of creatures) {
    const lanes = (hints.playable[c.uid] || []).filter((l) => !game.laneHasCreature(player, l));
    if (lanes.length) {
      const facing = lanes.filter((l) => game.getLane(player, l).opponentLane.hasCreature());
      return { type: 'play', uid: c.uid, lane: (facing.length ? facing : lanes)[0] };
    }
  }
  for (const c of hand.filter((x) => x.form.type === CardType.Building)) {
    const lanes = (hints.playable[c.uid] || []).filter((l) => !game.laneHasBuilding(player, l));
    if (lanes.length) {
      const withCreature = lanes.filter((l) => game.laneHasCreature(player, l));
      return { type: 'play', uid: c.uid, lane: (withCreature.length ? withCreature : lanes)[0] };
    }
  }
  if (hints.leader && rnd() < 0.7) return { type: 'leader' };
  for (const c of hand.filter((x) => x.form.type === CardType.Spell)) {
    if ((hints.playable[c.uid] || []).length && rnd() < 0.6) return { type: 'play', uid: c.uid, lane: -1 };
  }
  if (hints.floopable.length && rnd() < 0.75) {
    return { type: 'floop', lane: hints.floopable[Math.floor(rnd() * hints.floopable.length)] };
  }
  return { type: 'endTurn' };
}

function pickLane(game, player, p) {
  const scored = p.lanes.map((i) => {
    const lane = game.getLane(p.side, i);
    const c = lane.getCreature();
    let score = 0;
    if (p.side === other(player)) {
      if (c) score = c.atk * 2 + c.health;
      else if (lane.hasBuilding()) score = 3;
    } else if (c) {
      score = c.damage * 2 + c.atk;
    }
    return { i, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].i;
}

/** Plays a whole match bot against bot; returns the game. Throws on a stuck match. */
export function playBotMatch(game, { maxActions = 4000, rnd = Math.random } = {}) {
  let perTurn = 0;
  let lastTurn = game.turn;
  for (let n = 0; n < maxActions; n++) {
    if (game.phase === 'gameover') return game;
    const actor = game.pending ? game.pending.player : game.activePlayer;
    if (game.turn !== lastTurn) { lastTurn = game.turn; perTurn = 0; }
    let action = chooseBotAction(game, actor, rnd);
    if (++perTurn > 40 && !game.pending) action = { type: 'endTurn' };
    if (!action) throw new Error('Bot had no move');
    const r = game.apply(actor, action);
    if (!r.ok) {
      if (action.type === 'endTurn') throw new Error('Could not end the turn: ' + r.error);
      game.apply(actor, { type: 'endTurn' });
    }
    if (r.warning) game.lastWarning = r.warning;
  }
  throw new Error('Match did not finish');
}
