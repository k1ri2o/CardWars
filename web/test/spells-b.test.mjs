import test from 'node:test';
import { makeGame, put, give, discard, play, target, act, building, cardsWithScript, assert, db } from './helpers.mjs';
import '../js/engine/scripts/spells-b.js';
import { CardItem } from '../js/engine/cards.js';
import { CardType } from '../js/engine/consts.js';

const canCast = (g, p, item) => item.form.canPlay(g, p, -1);
const spell = (script, i = 0) => cardsWithScript(script)[i];
const handIds = (g, p) => g.hands[p].map((c) => c.form.id);

test('every script in the batch is used by a card or is a base class', () => {
  for (const s of ['DoubleDamage', 'DrainOpponentHealth', 'DrawCardsSpell', 'EmptyLaneCards', 'FlatFloopCost',
    'HealCreature', 'HealCreatures', 'HealSelfATK', 'KillLoneOpponent', 'MoveBuildingOpponent', 'MoveBuildingSelf',
    'RandomCard', 'ReduceActionPoints', 'ReduceCost', 'ReduceDEF', 'ReturnCard', 'ReturnCreature', 'ReturnCreatures',
    'ReturnOpponentCreature', 'ShuffleAndDraw', 'SwapATKDEFOpponent', 'SwapATKDEFSelf', 'BlockCardBuilding',
    'BlockCardCreature', 'BlockCardSpell']) {
    const id = spell(s);
    assert.ok(id, s);
    assert.equal(db.form(id).getScriptClass().name, s);
  }
});

test('DoubleDamage doubles the damage on an opposing creature', () => {
  const g = makeGame();
  const c = give(g, 0, spell('DoubleDamage'));
  const victim = put(g, 1, 2, 'Creature_Cornball'); // 2/5
  put(g, 1, 0, 'Creature_Cornball');
  assert.equal(canCast(g, 0, c), false, 'needs a damaged opposing creature');
  victim.damage = 2;
  assert.equal(canCast(g, 0, c), true);
  play(g, 0, c);
  assert.equal(g.magicPoints[0], 10 - db.form(c.form.id).cost);
  assert.equal(g.pending.side, 1);
  assert.deepEqual(g.pending.lanes, [2]);
  target(g, 0, 2);
  assert.equal(victim.damage, 4);
  assert.equal(g.pending, null);
});

test('DrainOpponentHealth deals Val1 to the opponent and heals the caster', () => {
  const g = makeGame();
  const c = give(g, 0, 'Spell_BloodTransfusion'); // val1 5
  g.health[0] = g.maxHealth[0] - 3;
  const opp = g.health[1];
  play(g, 0, c);
  assert.equal(g.health[0], g.maxHealth[0], 'healing is clamped to max');
  assert.equal(g.health[1], opp - 5);
});

test('DrawCardsSpell draws BaseVal1 cards; not castable with a full hand', () => {
  const g = makeGame();
  const c = give(g, 0, 'Spell_StrawberryButt'); // val1 2
  const deck = g.decks[0].cardCount();
  play(g, 0, c);
  assert.equal(g.hands[0].length, 2);
  assert.equal(g.decks[0].cardCount(), deck - 2);
  const c2 = give(g, 0, 'Spell_StrawberryButt');
  for (let i = 0; i < 4; i++) give(g, 0, 'Creature_Cornball');
  assert.equal(g.hands[0].length, 7);
  assert.equal(canCast(g, 0, c2), false);
  g.hands[0].pop();
  assert.equal(canCast(g, 0, c2), true);
  g.decks[0].cards.length = 0;
  assert.equal(canCast(g, 0, c2), false, 'empty deck');
});

test('EmptyLaneCards draws one card per empty lane', () => {
  const g = makeGame();
  put(g, 0, 1, 'Creature_Cornball');
  const c = give(g, 0, spell('EmptyLaneCards'));
  play(g, 0, c);
  assert.equal(g.hands[0].length, 3);
  for (let i = 0; i < 3; i++) put(g, 0, [0, 2, 3][i], 'Creature_Cornball');
  const c2 = give(g, 0, spell('EmptyLaneCards'));
  assert.equal(canCast(g, 0, c2), false, 'no empty lane');
});

test('FlatFloopCost sets every floop cost to BaseVal1 this turn', () => {
  const g = makeGame();
  const cr = put(g, 0, 0, 'Creature_Cornball'); // floop cost 2
  g.addFloopCostMod(0, 1);
  assert.equal(cr.determineFloopCost(), 3);
  const c = give(g, 0, spell('FlatFloopCost')); // val1 0
  play(g, 0, c);
  assert.equal(g.getFlatFloopCost(0), 0);
  assert.equal(g.getFloopCostMod(0), 0);
  assert.equal(cr.determineFloopCost(), 0);
  assert.equal(g.getFlatFloopCost(1), -1);
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.getFlatFloopCost(0), -1, 'reset when the turn ends');
});

test('HealCreature heals all damage on one of your damaged creatures', () => {
  const g = makeGame();
  const a = put(g, 0, 0, 'Creature_Cornball');
  const b = put(g, 0, 3, 'Creature_Cornball');
  const c = give(g, 0, spell('HealCreature'));
  assert.equal(canCast(g, 0, c), false);
  a.damage = 3;
  b.damage = 1;
  play(g, 0, c);
  assert.equal(g.pending.side, 0);
  assert.deepEqual(g.pending.lanes, [0, 3]);
  target(g, 0, 0);
  assert.equal(a.damage, 0);
  assert.equal(b.damage, 1);
});

test('HealCreatures heals every damaged creature on both sides', () => {
  const g = makeGame();
  const a = put(g, 0, 0, 'Creature_Cornball');
  const e = put(g, 1, 1, 'Creature_Cornball');
  e.damage = 4;
  const c = give(g, 0, spell('HealCreatures'));
  assert.equal(canCast(g, 0, c), false, 'needs one of your own creatures damaged');
  a.damage = 2;
  play(g, 0, c);
  assert.equal(a.damage, 0);
  assert.equal(e.damage, 0);
});

test('HealSelfATK heals a damaged creature by its own ATK', () => {
  const g = makeGame();
  const a = put(g, 0, 2, 'Creature_Cornball'); // ATK 2
  a.damage = 4;
  const c = give(g, 0, spell('HealSelfATK'));
  play(g, 0, c);
  target(g, 0, 2);
  assert.equal(a.damage, 2);
});

test('KillLoneOpponent kills the only opposing creature', () => {
  const g = makeGame();
  const c = give(g, 0, spell('KillLoneOpponent'));
  assert.equal(canCast(g, 0, c), false, 'no opposing creature');
  put(g, 1, 0, 'Creature_Cornball');
  put(g, 1, 2, 'Creature_Cornball');
  assert.equal(canCast(g, 0, c), false, 'two opposing creatures');
  g.lanes[1][2].scripts[0] = null;
  assert.equal(canCast(g, 0, c), true);
  play(g, 0, c);
  assert.equal(g.laneHasCreature(1, 0), false);
  assert.equal(g.discardPiles[1][0].form.id, 'Creature_Cornball');
});

test('MoveBuildingOpponent moves an opposing building to an empty lane', () => {
  const g = makeGame();
  const c = give(g, 0, spell('MoveBuildingOpponent'));
  assert.equal(canCast(g, 0, c), false, 'no opposing building');
  const b = put(g, 1, 0, 'Building_Obelisx');
  put(g, 1, 3, 'Building_Obelisx');
  assert.equal(canCast(g, 0, c), true);
  play(g, 0, c);
  assert.equal(g.pending.side, 1);
  assert.deepEqual(g.pending.lanes, [0, 3]);
  target(g, 0, 0);
  assert.equal(g.pending.side, 1);
  assert.deepEqual(g.pending.lanes, [1, 2]);
  target(g, 0, 2);
  assert.equal(g.pending, null);
  assert.equal(building(g, 1, 2), b);
  assert.equal(b.currentLane.index, 2);
  assert.equal(g.laneHasBuilding(1, 0), false);
  put(g, 1, 0, 'Building_Obelisx');
  put(g, 1, 1, 'Building_Obelisx');
  assert.equal(canCast(g, 0, give(g, 0, spell('MoveBuildingOpponent'))), false, 'every lane has a building');
});

test('MoveBuildingSelf moves one of your buildings to one of your empty lanes', () => {
  const g = makeGame();
  const c = give(g, 0, spell('MoveBuildingSelf'));
  assert.equal(canCast(g, 0, c), false);
  const b = put(g, 0, 1, 'Building_Obelisx');
  play(g, 0, c);
  assert.equal(g.pending.side, 0);
  assert.deepEqual(g.pending.lanes, [1]);
  target(g, 0, 1);
  assert.deepEqual(g.pending.lanes, [0, 2, 3]);
  target(g, 0, 3);
  assert.equal(building(g, 0, 3), b);
  assert.equal(g.laneHasBuilding(0, 1), false);
});

test('RandomCard puts a random card of type BaseVal1 from the deck into your hand', () => {
  const g = makeGame();
  const c = give(g, 0, spell('RandomCard')); // val1 0 = creature
  const deck = g.decks[0].cardCount();
  play(g, 0, c);
  assert.deepEqual(handIds(g, 0), ['Creature_Cornball']);
  // C# removes the card from the discard pile instead of the deck, so the deck keeps it.
  assert.equal(g.decks[0].cardCount(), deck);
  assert.ok(g.decks[0].getCards().includes(g.hands[0][0]));
  g.decks[0].cards = g.decks[0].cards.map(() => new CardItem(db.form('Spell_FallingStar')));
  assert.equal(canCast(g, 0, give(g, 0, spell('RandomCard'))), false, 'no creature in the deck');
});

test('ReduceActionPoints takes 2 magic from the opponent', () => {
  const g = makeGame();
  const c = give(g, 0, spell('ReduceActionPoints'));
  play(g, 0, c);
  assert.equal(g.magicPoints[1], 8);
  assert.equal(g.magicPoints[0], 10 - db.form(c.form.id).cost);
});

test('ReduceCost makes every card cost 1 less this turn', () => {
  const g = makeGame();
  const c = give(g, 0, spell('ReduceCost'));
  assert.equal(canCast(g, 0, c), false, 'needs another card in hand');
  const other = give(g, 0, 'Spell_BloodTransfusion'); // cost 3
  assert.equal(canCast(g, 0, c), true);
  play(g, 0, c);
  assert.equal(other.form.determineCost(g, 0), 2);
  assert.equal(other.form.determineCost(g, 1), 3);
  act(g, 0, { type: 'endTurn' });
  assert.equal(other.form.determineCost(g, 0), 3);
});

test('ReduceDEF halves the DEF of every creature on the field', () => {
  const g = makeGame();
  const c = give(g, 0, spell('ReduceDEF'));
  assert.equal(canCast(g, 0, c), false);
  const a = put(g, 0, 0, 'Creature_Cornball'); // DEF 5
  const e = put(g, 1, 0, 'Creature_Cornball');
  const dying = put(g, 1, 3, 'Creature_Cornball');
  dying.damage = 3;
  play(g, 0, c);
  assert.equal(a.def, 2);
  assert.equal(e.def, 2);
  assert.equal(a.defFactor, 0.5);
  assert.equal(g.laneHasCreature(1, 3), false, '5 -> 2 DEF with 3 damage dies');
  assert.equal(dying.markedForDeath, true);
});

test('ReturnCard returns a card of type BaseVal1 from your discard pile', () => {
  const g = makeGame();
  const c = give(g, 0, 'Spell_UnemptyCoffin'); // val1 0 = creature
  assert.equal(canCast(g, 0, c), false, 'no creature in the discard pile');
  discard(g, 0, 'Spell_FallingStar');
  const cr = discard(g, 0, 'Creature_Cornball');
  play(g, 0, c);
  assert.equal(g.pending.kind, 'discard');
  assert.deepEqual(g.pending.cards, [cr.uid]);
  act(g, 0, { type: 'discard', uid: cr.uid });
  assert.equal(g.pending, null);
  assert.deepEqual(handIds(g, 0), ['Creature_Cornball']);
  assert.equal(g.discardPiles[0].includes(cr), false);
});

test('ReturnCard for spells can pick itself back up, as in the original', () => {
  const g = makeGame();
  const c = give(g, 0, 'Spell_ScrollOfBadBreath'); // val1 2 = spell
  const old = discard(g, 0, 'Spell_FallingStar');
  play(g, 0, c);
  assert.deepEqual(g.pending.cards.slice().sort(), [c.uid, old.uid].sort());
  act(g, 0, { type: 'discard', uid: c.uid });
  assert.deepEqual(g.hands[0], [c]);
});

test('ReturnCreature returns one of your creatures to your hand', () => {
  const g = makeGame();
  const c = give(g, 0, spell('ReturnCreature'));
  assert.equal(canCast(g, 0, c), false);
  const a = put(g, 0, 1, 'Creature_Cornball');
  put(g, 0, 2, 'Creature_Cornball');
  play(g, 0, c);
  assert.deepEqual(g.pending.lanes, [1, 2]);
  target(g, 0, 1);
  assert.equal(g.laneHasCreature(0, 1), false);
  assert.equal(g.laneHasCreature(0, 2), true);
  assert.deepEqual(g.hands[0], [a.data]);
});

test('ReturnCreatures returns all your creatures; overflow goes to the discard pile', () => {
  const g = makeGame();
  const c = give(g, 0, spell('ReturnCreatures'));
  assert.equal(canCast(g, 0, c), false);
  const a = put(g, 0, 0, 'Creature_Cornball');
  const b = put(g, 0, 3, 'Creature_Cornball');
  for (let i = 0; i < 5; i++) give(g, 0, 'Spell_FallingStar');
  play(g, 0, c); // hand 5 after casting
  assert.equal(g.creatureCount(0), 0);
  assert.equal(g.hands[0].length, 7);
  assert.ok(g.hands[0].includes(a.data));
  assert.ok(g.hands[0].includes(b.data));
  const g2 = makeGame();
  const c2 = give(g2, 0, spell('ReturnCreatures'));
  const x = put(g2, 0, 0, 'Creature_Cornball');
  const y = put(g2, 0, 1, 'Creature_Cornball');
  for (let i = 0; i < 6; i++) give(g2, 0, 'Spell_FallingStar');
  play(g2, 0, c2); // hand 6 after casting
  assert.ok(g2.hands[0].includes(x.data));
  assert.equal(g2.hands[0].includes(y.data), false);
  assert.equal(g2.discardPiles[0][0], y.data);
});

test('ReturnOpponentCreature sends an opposing creature back to its owner\'s hand', () => {
  const g = makeGame();
  const c = give(g, 0, spell('ReturnOpponentCreature'));
  assert.equal(canCast(g, 0, c), false);
  const e = put(g, 1, 2, 'Creature_Cornball');
  play(g, 0, c);
  assert.equal(g.pending.side, 1);
  target(g, 0, 2);
  assert.equal(g.laneHasCreature(1, 2), false);
  assert.deepEqual(g.hands[1], [e.data]);
  // Full hand: discarded instead.
  const c2 = give(g, 0, spell('ReturnOpponentCreature'));
  const f = put(g, 1, 0, 'Creature_Cornball');
  for (let i = 0; i < 6; i++) give(g, 1, 'Spell_FallingStar');
  play(g, 0, c2);
  target(g, 0, 0);
  assert.equal(g.hands[1].length, 7);
  assert.equal(g.discardPiles[1][0], f.data);
});

test('ShuffleAndDraw shuffles your hand into your deck and draws 5', () => {
  const g = makeGame();
  const c = give(g, 0, spell('ShuffleAndDraw'));
  const kept = [give(g, 0, 'Spell_FallingStar'), give(g, 0, 'Spell_FallingStar')];
  const deck = g.decks[0].cardCount();
  play(g, 0, c);
  assert.equal(g.hands[0].length, 5);
  assert.equal(g.decks[0].cardCount(), deck + 2 - 5);
  const all = [...g.hands[0], ...g.decks[0].getCards()];
  for (const k of kept) assert.ok(all.includes(k));
  assert.equal(all.includes(c), false, 'the spell itself is in the discard pile');
});

test('SwapATKDEFOpponent swaps an opposing creature\'s ATK and DEF', () => {
  const g = makeGame();
  const c = give(g, 0, spell('SwapATKDEFOpponent'));
  assert.equal(canCast(g, 0, c), false);
  const e = put(g, 1, 1, 'Creature_Cornball', 2); // 4/10
  play(g, 0, c);
  assert.equal(g.pending.side, 1);
  target(g, 0, 1);
  assert.equal(e.atk, 10);
  assert.equal(e.def, 4);
});

test('SwapATKDEFSelf swaps one of your creatures\' ATK and DEF (base values, as in C#)', () => {
  const g = makeGame();
  const c = give(g, 0, spell('SwapATKDEFSelf'));
  assert.equal(canCast(g, 0, c), false);
  const a = put(g, 0, 0, 'Creature_Cornball'); // 2/5
  play(g, 0, c);
  assert.equal(g.pending.side, 0);
  target(g, 0, 0);
  assert.equal(a.atk, 5);
  assert.equal(a.def, 2);
  // Level 2 (4/10): C# subtracts the level-1 base stats, giving 12/9.
  const b = put(g, 0, 1, 'Creature_Cornball', 2);
  play(g, 0, give(g, 0, spell('SwapATKDEFSelf')));
  target(g, 0, 1);
  assert.equal(b.atk, 12);
  assert.equal(b.def, 9);
});

for (const [script, type, sample] of [
  ['BlockCardBuilding', CardType.Building, 'Building_Obelisx'],
  ['BlockCardCreature', CardType.Creature, 'Creature_AngelEye'],
  ['BlockCardSpell', CardType.Spell, 'Spell_FallingStar'],
]) {
  test(`${script} stops the opponent playing that card type on their next turn`, () => {
    const g = makeGame();
    const c = give(g, 0, spell(script));
    assert.equal(c.form.baseVal1, type);
    play(g, 0, c);
    assert.equal(g.isCastingEnabled(1, type), false);
    assert.equal(canCast(g, 0, give(g, 0, spell(script))), false, 'already blocked');
    act(g, 0, { type: 'endTurn' });
    assert.equal(g.activePlayer, 1);
    assert.equal(g.isCastingEnabled(1, type), false, 'still blocked on their turn');
    const card = give(g, 1, sample);
    assert.equal(g.apply(1, { type: 'play', uid: card.uid, lane: type === CardType.Spell ? -1 : 0 }).ok, false);
    for (const t of [0, 1, 2]) if (t !== type) assert.equal(g.isCastingEnabled(1, t), true);
    act(g, 1, { type: 'endTurn' });
    assert.equal(g.isCastingEnabled(1, type), true, 'cleared once their turn is over');
    assert.equal(card.form.canPlay(g, 1, type === CardType.Spell ? -1 : 0), true);
  });
}

test('spells are paid from spell points first', () => {
  const g = makeGame();
  g.spellPoints[0] = 1;
  const c = give(g, 0, spell('ReduceActionPoints')); // cost 2
  play(g, 0, c);
  assert.equal(g.spellPoints[0], 0);
  assert.equal(g.magicPoints[0], 9);
});
