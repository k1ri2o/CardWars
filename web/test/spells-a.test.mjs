import test from 'node:test';
import { makeGame, put, give, play, target, act, creature, building, cardsWithScript, assert, db } from './helpers.mjs';
import '../js/engine/scripts/spells-a.js';

const spell = (name, i = 0) => cardsWithScript(name)[i];
const canCast = (g, player, item) => item.form.canPlay(g, player, -1);
const ids = (pile) => pile.map((c) => c.form.id);

test('ActionPointCreatures: +1 magic per own creature, needs a creature', () => {
  const g = makeGame();
  const id = spell('ActionPointCreatures');
  const s = give(g, 0, id);
  assert.equal(canCast(g, 0, s), false);
  put(g, 1, 0, 'Creature_Cornball');
  assert.equal(canCast(g, 0, s), false, "opponent's creatures do not count");
  put(g, 0, 0, 'Creature_Cornball');
  put(g, 0, 2, 'Creature_Cornball');
  assert.equal(canCast(g, 0, s), true);
  play(g, 0, s);
  assert.equal(g.magicPoints[0], 10 - db.form(id).cost + 2);
});

test('ActionPointLandscapes: +1 magic per distinct landscape on both boards', () => {
  const g = makeGame({ landscapes: [['Corn', 'Plains', 'Swamp', 'Corn'], ['Cotton', 'Plains', 'Plains', 'Plains']] });
  const id = spell('ActionPointLandscapes');
  const s = give(g, 0, id);
  play(g, 0, s);
  assert.equal(g.magicPoints[0], 10 - db.form(id).cost + 4);
});

const attackCases = [
  ['AttackCreatureCorn', 'Creature_Cornball', 'Creature_AngelEye'],
  ['AttackCreaturePlains', 'Creature_CowGhost', 'Creature_Cornball'],
  ['AttackCreatureSwamp', 'Creature_GL_GrayEyeBat', 'Creature_Cornball'],
  ['AttackCreatureCotton', 'Creature_DogBoy', 'Creature_Cornball'],
  ['AttackCreatureSand', 'Creature_AngelOfVanilla', 'Creature_Cornball'],
];

for (const [name, attackerId, otherId] of attackCases) {
  test(`${name}: a creature of the faction hits the creature facing it for its ATK`, () => {
    const g = makeGame();
    const s = give(g, 0, spell(name));
    const attacker = put(g, 0, 0, attackerId);
    // Right faction but nothing facing it, so it can't be picked alone.
    put(g, 0, 2, attackerId);
    assert.equal(canCast(g, 0, s), false);
    const victim = put(g, 1, 3, 'Creature_CaptainTaco'); // faces p0 lane 0
    put(g, 0, 1, otherId); // wrong faction, facing p1 lane 2
    put(g, 1, 2, 'Creature_CaptainTaco');
    assert.equal(canCast(g, 0, s), true);
    play(g, 0, s);
    assert.equal(g.pending.side, 0);
    assert.deepEqual(g.pending.lanes, [0]);
    target(g, 0, 0);
    assert.equal(victim.damage, attacker.atk);
    assert.ok(attacker.atk > 0);
    assert.equal(attacker.damage, 0);
    assert.equal(creature(g, 1, 2).damage, 0);
    assert.equal(g.pending, null);
  });
}

test('AttackCreatureCorn credits the attacker with the kill, AttackCreatureSand does not', () => {
  for (const [name, attackerId, wins] of [['AttackCreatureCorn', 'Creature_Cornball', 1], ['AttackCreatureSand', 'Creature_AngelOfVanilla', 0]]) {
    const g = makeGame();
    put(g, 0, 0, attackerId);
    const b = put(g, 0, 0, 'Building_ComfyCave');
    let won = 0;
    b.onCreatureWon = () => { won++; };
    const victim = put(g, 1, 3, 'Creature_Cornball');
    victim.damage = victim.def - 1;
    play(g, 0, give(g, 0, spell(name)));
    target(g, 0, 0);
    assert.equal(g.laneHasCreature(1, 3), false, `${name} kills`);
    assert.equal(won, wins, name);
  }
});

test('AttackSelf: enemy creature takes damage equal to its own ATK', () => {
  const g = makeGame();
  const s = give(g, 0, spell('AttackSelf'));
  put(g, 0, 0, 'Creature_Cornball');
  assert.equal(canCast(g, 0, s), false);
  const victim = put(g, 1, 1, 'Creature_CowGhost'); // 10/15
  play(g, 0, s);
  assert.equal(g.pending.side, 1);
  assert.deepEqual(g.pending.lanes, [1]);
  target(g, 0, 1);
  assert.equal(victim.damage, 10);
  // Enough ATK to kill itself.
  const s2 = give(g, 0, spell('AttackSelf'));
  put(g, 1, 2, 'Creature_ArcherDan'); // 12/6
  play(g, 0, s2);
  target(g, 0, 2);
  assert.equal(g.laneHasCreature(1, 2), false);
  assert.equal(g.discardPiles[1][0].form.id, 'Creature_ArcherDan');
});

test('BlockTargetFloop: enemy creature is floop-blocked through its next turn', () => {
  const g = makeGame();
  const s = give(g, 0, spell('BlockTargetFloop'));
  assert.equal(canCast(g, 0, s), false);
  const blocked = put(g, 1, 2, 'Creature_CoolDog');
  blocked.floopBlocked = true;
  assert.equal(canCast(g, 0, s), false, 'already blocked creatures do not count');
  const victim = put(g, 1, 0, 'Creature_AngelEye');
  assert.equal(canCast(g, 0, s), true);
  play(g, 0, s);
  assert.equal(g.pending.side, 1);
  assert.deepEqual(g.pending.lanes, [0]);
  target(g, 0, 0);
  assert.equal(victim.floopBlocked, true);
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.activePlayer, 1);
  assert.equal(victim.floopBlocked, true);
  assert.equal(g.canFloopCard(1, victim), false);
  act(g, 1, { type: 'endTurn' });
  assert.equal(g.activePlayer, 0);
  assert.equal(victim.floopBlocked, false);
});

test('DamageToATK: damaged creature gets ATK = damage (minus level-1 base ATK quirk)', () => {
  const g = makeGame();
  const s = give(g, 0, spell('DamageToATK'));
  const a = put(g, 0, 0, 'Creature_Cornball'); // 2/5
  const b = put(g, 0, 1, 'Creature_Cornball', 2); // 4/10
  put(g, 0, 2, 'Creature_Cornball');
  const enemy = put(g, 1, 0, 'Creature_Cornball');
  enemy.damage = 4;
  assert.equal(canCast(g, 0, s), false, 'only own damaged creatures count');
  a.damage = 3;
  b.damage = 6;
  play(g, 0, s);
  assert.equal(g.pending.side, 0);
  assert.deepEqual(g.pending.lanes, [0, 1]);
  target(g, 0, 0);
  assert.equal(a.atk, 3);
  play(g, 0, give(g, 0, spell('DamageToATK')));
  target(g, 0, 1);
  assert.equal(b.atkMod, 6 - 2);
  assert.equal(b.atk, 8);
});

test('DestroyBuildingLane: wipes both sides of the chosen enemy lane', () => {
  const g = makeGame();
  const id = spell('DestroyBuildingLane');
  const s = give(g, 0, id);
  put(g, 0, 0, 'Creature_Cornball');
  put(g, 0, 0, 'Building_ComfyCave');
  put(g, 0, 2, 'Creature_Cornball'); // faces empty p1 lane 1
  assert.equal(canCast(g, 0, s), false, 'needs an enemy card');
  put(g, 1, 3, 'Creature_CowGhost');
  put(g, 1, 3, 'Building_NicelandsTower');
  put(g, 1, 0, 'Building_ComfyCave');
  assert.equal(canCast(g, 0, s), true);
  play(g, 0, s);
  assert.equal(g.pending.side, 1);
  assert.deepEqual(g.pending.lanes, [0, 3]);
  target(g, 0, 3);
  assert.equal(creature(g, 1, 3), null);
  assert.equal(building(g, 1, 3), null);
  assert.equal(creature(g, 0, 0), null);
  assert.equal(building(g, 0, 0), null);
  assert.ok(creature(g, 0, 2));
  assert.ok(building(g, 1, 0));
  assert.deepEqual(ids(g.discardPiles[1]), ['Creature_CowGhost', 'Building_NicelandsTower']);
  assert.deepEqual(ids(g.discardPiles[0]), ['Creature_Cornball', 'Building_ComfyCave', id]);
});

test('DestroyEntityForAction: sacrifice a creature (or building) for 4 magic', () => {
  const g = makeGame();
  const [doom, gloom] = cardsWithScript('DestroyEntityForAction').map((id) => db.form(id))
    .sort((x, y) => x.baseVal1 - y.baseVal1);
  assert.equal(doom.baseVal1, 0);
  assert.equal(gloom.baseVal1, 1);
  const s = give(g, 0, doom.id);
  put(g, 1, 0, 'Creature_Cornball');
  assert.equal(canCast(g, 0, s), false);
  put(g, 0, 1, 'Creature_Cornball');
  put(g, 0, 2, 'Building_ComfyCave');
  assert.equal(canCast(g, 0, s), true);
  play(g, 0, s);
  assert.equal(g.pending.side, 0);
  assert.equal(g.pending.selectionType, 'Creature');
  assert.deepEqual(g.pending.lanes, [1]);
  target(g, 0, 1);
  assert.equal(creature(g, 0, 1), null);
  assert.equal(g.discardPiles[0][0].form.id, 'Creature_Cornball');
  assert.equal(g.magicPoints[0], 10 - doom.cost + 4);

  const s2 = give(g, 0, gloom.id);
  play(g, 0, s2);
  assert.equal(g.pending.selectionType, 'Building');
  assert.deepEqual(g.pending.lanes, [2]);
  target(g, 0, 2);
  assert.equal(building(g, 0, 2), null);
  assert.equal(g.discardPiles[0][0].form.id, 'Building_ComfyCave');
  assert.equal(g.magicPoints[0], 10 - doom.cost + 4 - gloom.cost + 4);
  assert.equal(canCast(g, 0, give(g, 0, gloom.id)), false);
});

test('DestroyEntityForCards: sacrifice a creature (or building) and draw BaseVal2 cards', () => {
  const g = makeGame();
  const [banana, grape] = cardsWithScript('DestroyEntityForCards').map((id) => db.form(id))
    .sort((x, y) => x.baseVal1 - y.baseVal1);
  const s = give(g, 0, banana.id);
  assert.equal(canCast(g, 0, s), false);
  put(g, 0, 3, 'Creature_Cornball');
  put(g, 0, 1, 'Building_ComfyCave');
  const deck = g.decks[0].cardCount();
  play(g, 0, s);
  assert.deepEqual(g.pending.lanes, [3]);
  target(g, 0, 3);
  assert.equal(creature(g, 0, 3), null);
  assert.equal(g.discardPiles[0][0].form.id, 'Creature_Cornball');
  assert.equal(g.hands[0].length, banana.baseVal2);
  assert.equal(g.decks[0].cardCount(), deck - banana.baseVal2);

  const s2 = give(g, 0, grape.id);
  play(g, 0, s2);
  assert.deepEqual(g.pending.lanes, [1]);
  target(g, 0, 1);
  assert.equal(building(g, 0, 1), null);
  assert.equal(g.hands[0].length, banana.baseVal2 + grape.baseVal2);

  // Needs cards left in the deck.
  put(g, 0, 0, 'Creature_Cornball');
  const s3 = give(g, 0, banana.id);
  assert.equal(canCast(g, 0, s3), true);
  g.decks[0].cards.length = 0;
  assert.equal(canCast(g, 0, s3), false);
});

test('DestroyHigherRarity: kills enemy creatures of rarity >= BaseVal1', () => {
  const g = makeGame();
  const form = db.form(spell('DestroyHigherRarity'));
  assert.equal(form.baseVal1, 4);
  const s = give(g, 0, form.id, 2); // level does not matter: BaseVal1 is used
  put(g, 1, 0, 'Creature_Cornball'); // rarity 1
  put(g, 0, 0, 'Creature_CaptainTaco'); // own rarity 5
  assert.equal(canCast(g, 0, s), false);
  put(g, 1, 1, 'Creature_Cornataur'); // rarity 4
  put(g, 1, 2, 'Creature_CaptainTaco'); // rarity 5
  put(g, 1, 3, 'Creature_CowGhost'); // rarity 3
  play(g, 0, s);
  assert.equal(g.pending, null);
  assert.ok(creature(g, 1, 0));
  assert.equal(creature(g, 1, 1), null);
  assert.equal(creature(g, 1, 2), null);
  assert.ok(creature(g, 1, 3));
  assert.ok(creature(g, 0, 0));
  assert.deepEqual(ids(g.discardPiles[1]).sort(), ['Creature_CaptainTaco', 'Creature_Cornataur']);
});

test('DestroyLowerRarity: kills enemy creatures of rarity <= BaseVal1', () => {
  const g = makeGame();
  const form = db.form(spell('DestroyLowerRarity'));
  assert.equal(form.baseVal1, 3);
  const s = give(g, 0, form.id);
  put(g, 1, 0, 'Creature_Cornataur'); // rarity 4
  put(g, 0, 0, 'Creature_Cornball'); // own rarity 1
  assert.equal(canCast(g, 0, s), false);
  put(g, 1, 1, 'Creature_Cornball'); // rarity 1
  put(g, 1, 2, 'Creature_CowGhost'); // rarity 3
  play(g, 0, s);
  assert.ok(creature(g, 1, 0));
  assert.equal(creature(g, 1, 1), null);
  assert.equal(creature(g, 1, 2), null);
  assert.ok(creature(g, 0, 0));
  assert.deepEqual(ids(g.discardPiles[1]).sort(), ['Creature_Cornball', 'Creature_CowGhost']);
});

test('DisableLane: chosen enemy lane takes no summons during that player\'s next turn', () => {
  const g = makeGame();
  const s = give(g, 0, spell('DisableLane'));
  assert.equal(canCast(g, 0, s), true, 'castable on an empty board');
  play(g, 0, s);
  assert.equal(g.pending.side, 1);
  assert.deepEqual(g.pending.lanes, [0, 1, 2, 3]);
  target(g, 0, 2);
  assert.equal(g.getLane(1, 2).disabled, true);
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.activePlayer, 1);
  assert.equal(g.getLane(1, 2).disabled, true);
  const c = give(g, 1, 'Creature_AngelEye');
  assert.equal(g.apply(1, { type: 'play', uid: c.uid, lane: 2 }).ok, false);
  play(g, 1, c, 1);
  const b = give(g, 1, 'Building_ComfyCave');
  assert.equal(g.apply(1, { type: 'play', uid: b.uid, lane: 2 }).ok, false);
  act(g, 1, { type: 'endTurn' });
  assert.equal(g.getLane(1, 2).disabled, false);
});

test('DiscardForPoints: discards the whole hand and gains BaseVal1 magic', () => {
  const g = makeGame();
  const form = db.form(spell('DiscardForPoints'));
  give(g, 0, 'Creature_Cornball');
  give(g, 0, 'Creature_AngelEye');
  give(g, 0, 'Building_ComfyCave');
  const s = give(g, 0, form.id, 2); // level 2: still BaseVal1, not Val1
  play(g, 0, s);
  assert.equal(g.hands[0].length, 0);
  assert.deepEqual(ids(g.discardPiles[0]), ['Building_ComfyCave', 'Creature_AngelEye', 'Creature_Cornball', form.id]);
  assert.equal(g.magicPoints[0], 10 - form.cost + form.baseVal1);
});
