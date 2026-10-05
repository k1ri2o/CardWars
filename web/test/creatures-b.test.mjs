import test from 'node:test';
import { makeGame, put, give, discard, floop, target, act, creature, building, cardsWithScript, assert } from './helpers.mjs';
import '../js/engine/scripts/creatures-b.js';
import { hasScript } from '../js/engine/registry.js';

// Sturdy creatures whose own scripts are floop-only, used as bystanders.
const KNIGHT = 'Creature_KnightOfObesity'; // Plains 5/40, rarity 5
const SACK = 'Creature_SackOfPain'; // Cotton 3/33
const STALKER = 'Creature_GhostStalker'; // Corn 5/32, rarity 4
const WALKER = 'Creature_MaizeWalker'; // Swamp 11/36
const SCHOLAR = 'Creature_FutureScholar'; // GainActionPoints, always floopable

const BATCH = [
  'DamageOpponentDamage', 'DamageOpponentDiscardPile', 'DamageOpponentDiscardedCreatures', 'DamageOpponentFloop',
  'DamageOpponentHealSelf', 'DamageOpponentIfDamagedLastTurn', 'DamageOpponentLandscapeVariety', 'DamageOpponentLowerATK',
  'DamageOpponentMyBuildings', 'DamageOpponentRarity', 'DamageOpponentTheirBuildings', 'DamageRandom', 'DamageTarget',
  'DamageTargetFaction', 'DamageTargetHealSelf', 'DestroyOpponentBuilding', 'DrainAdjacentDEFAddATKBonus',
  'DrainOpponentATKLowerSelfDEF', 'DrawCards', 'DrawCardsSacrifice', 'DrawCardsTake', 'EqualizeATK', 'FloopAdjacent',
  'GainActionPoints', 'HealAdjacent', 'HealAdjacentDEFAndDiscard', 'HealAdjacentDamage', 'HealAll', 'HealAllSacrifice',
  'HealHero', 'HealHeroATK', 'HealHeroFloop', 'HealRandom', 'HealSelf', 'HealSelfAndAdjacent', 'HealTarget',
  'HealTargetAdjacent', 'HealTargetAll',
];

/** The floop must be refused. */
function cantFloop(g, player, lane) {
  const r = g.apply(player, { type: 'floop', lane });
  assert.equal(r.ok, false, `floop in lane ${lane} should be refused`);
}

test('creatures-b: every script is registered and used by a card', () => {
  for (const name of BATCH) {
    assert.ok(hasScript(name), `${name} not registered`);
    assert.ok(cardsWithScript(name).length > 0, `${name} has no card`);
  }
});

// ---- damage the opposing creature ------------------------------------------

test('DamageOpponentDamage: deals this creature\'s damage to the opposing creature', () => {
  const g = makeGame();
  const thug = put(g, 0, 0, 'Creature_RecordThug');
  cantFloop(g, 0, 0);
  const enemy = put(g, 1, 3, KNIGHT);
  thug.damage = 6;
  floop(g, 0, 0);
  assert.equal(enemy.damage, 6);
  assert.equal(thug.flooped, true);
});

test('DamageOpponentDiscardPile: Val1 damage per BaseVal2 cards in your discard pile', () => {
  const g = makeGame();
  const spider = put(g, 0, 0, 'Creature_ExtraordinarySpider'); // val1 4, baseVal2 2
  const enemy = put(g, 1, 3, KNIGHT);
  discard(g, 0, 'Creature_Cornball');
  cantFloop(g, 0, 0);
  for (let i = 0; i < 4; i++) discard(g, 0, 'Creature_Cornball');
  floop(g, 0, 0);
  assert.equal(enemy.damage, spider.data.val1 * 2); // 5 cards / 2 = 2
});

test('DamageOpponentDiscardedCreatures: Val1 damage per creature in the opponent\'s discard pile', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_SteakChop'); // val1 2
  const enemy = put(g, 1, 3, KNIGHT);
  discard(g, 1, 'Spell_BoneWand');
  cantFloop(g, 0, 0);
  discard(g, 1, 'Creature_Cornball');
  discard(g, 1, 'Creature_Cornball');
  discard(g, 1, 'Creature_Cornball');
  floop(g, 0, 0);
  assert.equal(enemy.damage, 6);
});

test('DamageOpponentFloop: Val1 damage for every other floop this turn', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_BL_UselessThrone'); // val1 5
  put(g, 0, 1, SCHOLAR);
  const enemy = put(g, 1, 3, KNIGHT);
  cantFloop(g, 0, 0);
  floop(g, 0, 1);
  floop(g, 0, 0);
  assert.equal(enemy.damage, 5);
});

test('DamageOpponentHealSelf: damages the opposing creature and heals itself', () => {
  const g = makeGame();
  const dog = put(g, 0, 0, 'Creature_DogBoy'); // val1 5, val2 5
  cantFloop(g, 0, 0);
  const enemy = put(g, 1, 3, KNIGHT);
  dog.damage = 7;
  floop(g, 0, 0);
  assert.equal(enemy.damage, 5);
  assert.equal(dog.damage, 2);
});

test('DamageOpponentHealSelf: with no opposing creature it only heals', () => {
  const g = makeGame();
  const dog = put(g, 0, 0, 'Creature_DogBoy');
  dog.damage = 3;
  floop(g, 0, 0);
  assert.equal(dog.damage, 0);
});

test('DamageOpponentIfDamagedLastTurn: Val1 % of the damage taken in the last enemy battle', () => {
  const g = makeGame();
  const vamp = put(g, 0, 0, 'Creature_VampBaldMan'); // 18/17, val1 200
  const knight = put(g, 1, 3, KNIGHT); // 5/40
  cantFloop(g, 0, 0);
  act(g, 0, { type: 'endTurn' }); // vamp hits the knight for 18
  act(g, 1, { type: 'endTurn' }); // the knight hits the vamp for 5
  assert.equal(g.activePlayer, 0);
  assert.equal(vamp.damageLastTurn, 5);
  assert.equal(knight.damage, 18);
  floop(g, 0, 0);
  assert.equal(knight.damage, 18 + 10);
});

test('DamageOpponentLandscapeVariety: Val1 damage per distinct landscape you have', () => {
  const g = makeGame({ landscapes: [['Corn', 'Plains', 'Swamp', 'Corn'], ['Plains', 'Plains', 'Plains', 'Plains']] });
  put(g, 0, 0, 'Creature_RainbowBarfer'); // val1 5
  cantFloop(g, 0, 0);
  const enemy = put(g, 1, 3, KNIGHT);
  floop(g, 0, 0);
  assert.equal(enemy.damage, 15);
});

test('DamageOpponentLowerATK: damages the opposing creature and lowers its ATK', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_MermaidYellow'); // val1 5, val2 5
  cantFloop(g, 0, 0);
  const enemy = put(g, 1, 3, WALKER); // 11 ATK
  floop(g, 0, 0);
  assert.equal(enemy.damage, 5);
  assert.equal(enemy.atkMod, -5);
  assert.equal(enemy.atk, 6);
});

test('DamageOpponentMyBuildings: Val1 damage per building you control', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_GreenMermaid'); // val1 3
  const enemy = put(g, 1, 3, KNIGHT);
  cantFloop(g, 0, 0);
  put(g, 0, 1, 'Building_Obelisx');
  put(g, 0, 2, 'Building_PuffyCastle');
  put(g, 1, 0, 'Building_SandPyramid'); // the opponent's buildings don't count
  floop(g, 0, 0);
  assert.equal(enemy.damage, 6);
});

test('DamageOpponentRarity: Val1 damage per rarity star of the opposing creature', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_BL_HeadphoneJerk'); // val1 3
  cantFloop(g, 0, 0);
  const enemy = put(g, 1, 3, STALKER); // rarity 4
  floop(g, 0, 0);
  assert.equal(enemy.damage, 12);
});

test('DamageOpponentTheirBuildings: Val1 damage per enemy building', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_GreenMerman'); // val1 3
  const enemy = put(g, 1, 3, KNIGHT);
  put(g, 0, 1, 'Building_Obelisx'); // ours don't count
  cantFloop(g, 0, 0);
  put(g, 1, 0, 'Building_SandPyramid');
  put(g, 1, 1, 'Building_PuffyCastle');
  floop(g, 0, 0);
  assert.equal(enemy.damage, 6);
});

test('DamageRandom: Val1 damage to one random creature on either side', () => {
  const outcomes = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const g = makeGame({ seed });
    const skel = put(g, 0, 0, 'Creature_TravelinSkeleton'); // 3/3, val1 4
    cantFloop(g, 0, 0);
    const enemy = put(g, 1, 1, KNIGHT);
    floop(g, 0, 0);
    if (enemy.damage === 4) {
      assert.equal(creature(g, 0, 0), skel);
      assert.equal(skel.damage, 0);
      outcomes.add('enemy');
    } else {
      assert.equal(enemy.damage, 0);
      assert.equal(g.laneHasCreature(0, 0), false);
      assert.equal(g.discardPiles[0][0], skel.data);
      outcomes.add('self');
    }
  }
  assert.deepEqual([...outcomes].sort(), ['enemy', 'self']);
});

// ---- damage a chosen creature ------------------------------------------------

test('DamageTarget: Val1 damage to a chosen opposing creature', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_GrayEyeBat'); // val1 2
  cantFloop(g, 0, 0);
  const a = put(g, 1, 0, KNIGHT);
  const b = put(g, 1, 2, SACK);
  floop(g, 0, 0);
  assert.equal(g.pending.player, 0);
  assert.equal(g.pending.side, 1);
  assert.deepEqual(g.pending.lanes, [0, 2]);
  target(g, 0, 2);
  assert.equal(b.damage, 2);
  assert.equal(a.damage, 0);
  assert.equal(g.pending, null);
});

test('DamageTargetFaction: only opposing creatures of the faction in BaseVal2 (0 = Corn)', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_FlySwatter'); // val1 5, baseVal2 0
  put(g, 1, 0, KNIGHT); // Plains
  cantFloop(g, 0, 0);
  const corn = put(g, 1, 2, STALKER); // Corn
  floop(g, 0, 0);
  assert.deepEqual(g.pending.lanes, [2]);
  target(g, 0, 2);
  assert.equal(corn.damage, 5);
  assert.equal(creature(g, 1, 0).damage, 0);
});

test('DamageTargetHealSelf: damages a chosen enemy and heals itself', () => {
  const g = makeGame();
  const sgt = put(g, 0, 0, 'Creature_SgtMushroom'); // val1 4, val2 6
  cantFloop(g, 0, 0);
  const enemy = put(g, 1, 1, KNIGHT);
  sgt.damage = 8;
  floop(g, 0, 0);
  assert.deepEqual(g.pending.lanes, [1]);
  target(g, 0, 1);
  assert.equal(enemy.damage, 4);
  assert.equal(sgt.damage, 2);
});

test('DamageTargetHealSelf: with no enemies it heals itself without a choice', () => {
  const g = makeGame();
  const sgt = put(g, 0, 0, 'Creature_SgtMushroom');
  sgt.damage = 8;
  floop(g, 0, 0);
  assert.equal(g.pending, null);
  assert.equal(sgt.damage, 2);
});

test('DestroyOpponentBuilding: destroys the building in the opposing lane', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_DragonFoot');
  put(g, 1, 2, 'Building_Obelisx'); // not opposite
  cantFloop(g, 0, 0);
  const b = put(g, 1, 3, 'Building_PuffyCastle');
  floop(g, 0, 0);
  assert.equal(g.laneHasBuilding(1, 3), false);
  assert.equal(g.discardPiles[1][0], b.data);
  assert.ok(building(g, 1, 2));
});

// ---- stat drains ---------------------------------------------------------------

test('DrainAdjacentDEFAddATKBonus: neighbours lose Val1 DEF, this gains Val2 ATK', () => {
  const g = makeGame();
  const barfer = put(g, 0, 1, 'Creature_XMAS_PeaSoupBarfer'); // 12/15, val1 2, val2 7
  cantFloop(g, 0, 1);
  const left = put(g, 0, 0, KNIGHT);
  const right = put(g, 0, 2, SACK);
  const far = put(g, 0, 3, WALKER);
  floop(g, 0, 1);
  assert.equal(barfer.atk, 19);
  assert.equal(barfer.def, 15);
  assert.equal(left.def, 38);
  assert.equal(right.def, 31);
  assert.equal(far.def, 36);
});

test('DrainOpponentATKLowerSelfDEF: takes half the enemy ATK, losing as much DEF', () => {
  const g = makeGame();
  const gnome = put(g, 0, 0, 'Creature_XMAS_RainbowGnome'); // 7/14
  cantFloop(g, 0, 0);
  const enemy = put(g, 1, 3, WALKER); // 11 ATK
  floop(g, 0, 0);
  assert.equal(enemy.atk, 6);
  assert.equal(gnome.atk, 12);
  assert.equal(gnome.def, 9);
});

test('DrainOpponentATKLowerSelfDEF: an enemy with 1 ATK gives up that 1', () => {
  const g = makeGame();
  const gnome = put(g, 0, 0, 'Creature_XMAS_RainbowGnome');
  const enemy = put(g, 1, 3, 'Creature_AngelEye'); // 1/7
  floop(g, 0, 0);
  assert.equal(enemy.atk, 0);
  assert.equal(gnome.atk, 8);
  assert.equal(gnome.def, 13);
  // With 0 ATK left there is nothing to drain.
  g.startTurn(0);
  cantFloop(g, 0, 0);
});

// ---- cards ------------------------------------------------------------------------

test('DrawCards: draws BaseVal1 cards (not scaled by level)', () => {
  const g = makeGame();
  const eye = put(g, 0, 0, 'Creature_AngelEye', 2); // baseVal1 1
  assert.equal(eye.data.val1, 2);
  const deck = g.getDeck(0).cardCount();
  floop(g, 0, 0);
  assert.equal(g.hands[0].length, 1);
  assert.equal(g.getDeck(0).cardCount(), deck - 1);
});

test('DrawCards: not with a full hand', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_AngelEye');
  for (let i = 0; i < 7; i++) give(g, 0, 'Creature_Cornball');
  cantFloop(g, 0, 0);
});

test('DrawCardsSacrifice: draws and sends itself to the discard pile', () => {
  const g = makeGame();
  const slimey = put(g, 0, 0, 'Creature_GrapeSlimey'); // baseVal1 1
  floop(g, 0, 0);
  assert.equal(g.hands[0].length, 1);
  assert.equal(g.laneHasCreature(0, 0), false);
  assert.equal(g.discardPiles[0][0], slimey.data);
});

test('DrawCardsTake: returns to hand and draws', () => {
  const g = makeGame();
  const knight = put(g, 0, 0, KNIGHT); // baseVal1 1
  knight.damage = 10;
  floop(g, 0, 0);
  assert.equal(g.laneHasCreature(0, 0), false);
  assert.equal(g.hands[0].length, 2);
  assert.equal(g.hands[0][0], knight.data);
  assert.equal(g.discardPiles[0].length, 0);
});

test('EqualizeATK: the opposing creature\'s ATK becomes this creature\'s ATK', () => {
  const g = makeGame();
  put(g, 0, 0, STALKER); // 5 ATK
  cantFloop(g, 0, 0);
  const enemy = put(g, 1, 3, WALKER); // 11 ATK
  floop(g, 0, 0);
  assert.equal(enemy.atk, 5);
});

test('EqualizeATK: subtracts the form\'s BaseATK, so a levelled enemy ends above it (as in C#)', () => {
  const g = makeGame();
  put(g, 0, 0, STALKER);
  const enemy = put(g, 1, 3, WALKER, 2); // 22 ATK, BaseATK 11
  floop(g, 0, 0);
  assert.equal(enemy.atkMod, 5 - 11);
  assert.equal(enemy.atk, 16);
});

test('FloopAdjacent: runs a neighbour\'s floop ability without flooping it', () => {
  const g = makeGame();
  const cat = put(g, 0, 1, 'Creature_PunkCat');
  const wolf = put(g, 0, 0, 'Creature_WellDressedWolf'); // HealSelf
  put(g, 0, 2, 'Creature_PunkCat'); // another FloopAdjacent is never a choice
  cantFloop(g, 0, 1);
  wolf.damage = 5;
  const mp = g.magicPoints[0];
  floop(g, 0, 1);
  assert.equal(g.pending.side, 0);
  assert.deepEqual(g.pending.lanes, [0]);
  target(g, 0, 0);
  assert.equal(wolf.damage, 0);
  assert.equal(wolf.flooped, false);
  assert.equal(cat.flooped, true);
  assert.equal(g.magicPoints[0], mp - cat.data.form.floopCost);
  assert.equal(g.getFloopCountTurn(0), 1);
});

test('FloopAdjacent: a targeted neighbour asks for its own target next', () => {
  const g = makeGame();
  put(g, 0, 1, 'Creature_PunkCat');
  const bat = put(g, 0, 2, 'Creature_GrayEyeBat'); // DamageTarget, val1 2
  const enemy = put(g, 1, 0, KNIGHT);
  floop(g, 0, 1);
  assert.deepEqual(g.pending.lanes, [2]);
  target(g, 0, 2);
  assert.equal(g.pending.player, 0);
  assert.equal(g.pending.side, 1);
  assert.deepEqual(g.pending.lanes, [0]);
  target(g, 0, 0);
  assert.equal(enemy.damage, 2);
  assert.equal(bat.flooped, false);
});

test('GainActionPoints: BaseVal1 extra magic points next turn', () => {
  const g = makeGame();
  put(g, 0, 0, SCHOLAR); // baseVal1 3
  floop(g, 0, 0);
  assert.equal(g.bonusPoints[0], 3);
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.magicPoints[0], g.currentMagicPoints + 3);
  assert.equal(g.bonusPoints[0], 0);
});

// ---- healing ---------------------------------------------------------------------

test('HealAdjacent: heals adjacent creatures Val1', () => {
  const g = makeGame();
  const goat = put(g, 0, 1, 'Creature_FatGoat'); // val1 4
  const left = put(g, 0, 0, KNIGHT);
  const right = put(g, 0, 2, SACK);
  const far = put(g, 0, 3, WALKER);
  goat.damage = 3;
  cantFloop(g, 0, 1);
  left.damage = 6;
  right.damage = 2;
  far.damage = 5;
  floop(g, 0, 1);
  assert.equal(left.damage, 2);
  assert.equal(right.damage, 0);
  assert.equal(far.damage, 5);
  assert.equal(goat.damage, 3);
});

test('HealAdjacentDEFAndDiscard: heals neighbours by its DEF, then discards itself', () => {
  const g = makeGame();
  const slimey = put(g, 0, 1, 'Creature_XMAS_BlueSlimey'); // 7/14
  const left = put(g, 0, 0, KNIGHT);
  const right = put(g, 0, 2, SACK);
  cantFloop(g, 0, 1);
  left.damage = 20;
  right.damage = 10;
  slimey.damage = 5; // DEF, not health, is what heals
  floop(g, 0, 1);
  assert.equal(left.damage, 6);
  assert.equal(right.damage, 0);
  assert.equal(g.laneHasCreature(0, 1), false);
  assert.equal(g.discardPiles[0][0], slimey.data);
});

test('HealAdjacentDamage: heals neighbours by the damage on this creature', () => {
  const g = makeGame();
  const sack = put(g, 0, 1, SACK);
  const left = put(g, 0, 0, KNIGHT);
  const right = put(g, 0, 2, WALKER);
  cantFloop(g, 0, 1);
  left.damage = 8;
  right.damage = 2;
  sack.damage = 5;
  floop(g, 0, 1);
  assert.equal(left.damage, 3);
  assert.equal(right.damage, 0);
  assert.equal(sack.damage, 5);
});

test('HealAll: heals each of your creatures Val1', () => {
  const g = makeGame();
  const cow = put(g, 0, 0, 'Creature_Cow'); // val1 5
  const a = put(g, 0, 2, KNIGHT);
  const enemy = put(g, 1, 0, SACK);
  enemy.damage = 9;
  cantFloop(g, 0, 0);
  cow.damage = 3;
  a.damage = 10;
  floop(g, 0, 0);
  assert.equal(cow.damage, 0);
  assert.equal(a.damage, 5);
  assert.equal(enemy.damage, 9);
});

test('HealAllSacrifice: fully heals your other creatures and destroys itself', () => {
  const g = makeGame();
  const bully = put(g, 0, 0, 'Creature_BL_AppleBully');
  const a = put(g, 0, 1, KNIGHT);
  const b = put(g, 0, 3, SACK);
  bully.damage = 4;
  cantFloop(g, 0, 0); // its own damage doesn't count
  a.damage = 30;
  b.damage = 5;
  floop(g, 0, 0);
  assert.equal(a.damage, 0);
  assert.equal(b.damage, 0);
  assert.equal(g.laneHasCreature(0, 0), false);
  assert.equal(g.discardPiles[0][0], bully.data);
});

test('HealHero: heals your hero Val1', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_BlueberryDjini'); // val1 2
  cantFloop(g, 0, 0);
  const max = g.getMaxHealth(0);
  g.health[0] = max - 5;
  floop(g, 0, 0);
  assert.equal(g.health[0], max - 3);
});

test('HealHeroATK: heals your hero by this creature\'s ATK, capped at max', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_CottonsaurusRex'); // 6 ATK
  const max = g.getMaxHealth(0);
  g.health[0] = max - 10;
  floop(g, 0, 0);
  assert.equal(g.health[0], max - 4);
  g.startTurn(0);
  g.health[0] = max - 3;
  floop(g, 0, 0);
  assert.equal(g.health[0], max);
});

test('HealHeroFloop: heals your hero Val1 for every other floop this turn', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_BL_NicelandsCutie'); // val1 4
  put(g, 0, 1, SCHOLAR);
  const max = g.getMaxHealth(0);
  g.health[0] = max - 10;
  cantFloop(g, 0, 0);
  floop(g, 0, 1);
  floop(g, 0, 0);
  assert.equal(g.health[0], max - 6);
});

test('HealRandom: heals Val1 on a random damaged creature of yours only', () => {
  const g = makeGame();
  const wiz = put(g, 0, 0, 'Creature_TravelinWizard'); // val1 12
  const enemy = put(g, 1, 0, KNIGHT);
  enemy.damage = 20;
  cantFloop(g, 0, 0);
  const a = put(g, 0, 1, KNIGHT);
  const b = put(g, 0, 2, SACK);
  a.damage = 15;
  floop(g, 0, 0);
  assert.equal(a.damage, 3);
  assert.equal(b.damage, 0);
  assert.equal(wiz.damage, 0);
  assert.equal(enemy.damage, 20);
});

test('HealSelf: heals all damage from this creature', () => {
  const g = makeGame();
  const wolf = put(g, 0, 0, 'Creature_WellDressedWolf');
  cantFloop(g, 0, 0);
  wolf.damage = 7;
  floop(g, 0, 0);
  assert.equal(wolf.damage, 0);
});

test('HealSelfAndAdjacent: heals itself and neighbours Val1', () => {
  const g = makeGame();
  const duck = put(g, 0, 1, 'Creature_MusicMallard'); // val1 5
  const left = put(g, 0, 0, KNIGHT);
  const right = put(g, 0, 2, SACK);
  cantFloop(g, 0, 1);
  right.damage = 2;
  floop(g, 0, 1);
  assert.equal(right.damage, 0);
  g.startTurn(0);
  duck.damage = 3;
  left.damage = 10;
  floop(g, 0, 1);
  assert.equal(duck.damage, 0);
  assert.equal(left.damage, 5);
});

// ---- heal a chosen creature --------------------------------------------------------

test('HealTarget: heals a chosen damaged creature of yours Val1', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_AngelHeart'); // val1 3
  const a = put(g, 0, 1, KNIGHT);
  put(g, 0, 2, SACK);
  const enemy = put(g, 1, 0, WALKER);
  enemy.damage = 4;
  cantFloop(g, 0, 0);
  a.damage = 10;
  floop(g, 0, 0);
  assert.equal(g.pending.side, 0);
  assert.deepEqual(g.pending.lanes, [1]);
  target(g, 0, 1);
  assert.equal(a.damage, 7);
  assert.equal(g.pending, null);
});

test('HealTargetAdjacent: heals the chosen creature and its damaged neighbours Val1', () => {
  const g = makeGame();
  put(g, 0, 3, 'Creature_FairyShepard'); // val1 3
  const a = put(g, 0, 0, KNIGHT);
  const b = put(g, 0, 1, SACK);
  const c = put(g, 0, 2, WALKER);
  cantFloop(g, 0, 3);
  a.damage = 5;
  c.damage = 2;
  floop(g, 0, 3);
  assert.deepEqual(g.pending.lanes, [0, 1, 2, 3]);
  target(g, 0, 1);
  assert.equal(a.damage, 2);
  assert.equal(b.damage, 0);
  assert.equal(c.damage, 0);
});

test('HealTargetAdjacent: an empty lane next to a damaged creature can be picked but heals nothing (as in C#)', () => {
  const g = makeGame();
  put(g, 0, 3, 'Creature_FairyShepard');
  const a = put(g, 0, 1, KNIGHT);
  a.damage = 5;
  floop(g, 0, 3);
  assert.deepEqual(g.pending.lanes, [0, 1, 2]);
  target(g, 0, 0);
  assert.equal(a.damage, 5);
  assert.equal(g.pending, null);
});

test('HealTargetAll: heals all damage from a chosen creature of yours', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_KingFluff');
  const a = put(g, 0, 1, KNIGHT);
  const b = put(g, 0, 2, SACK);
  cantFloop(g, 0, 0);
  a.damage = 30;
  b.damage = 4;
  floop(g, 0, 0);
  assert.deepEqual(g.pending.lanes, [1, 2]);
  target(g, 0, 1);
  assert.equal(a.damage, 0);
  assert.equal(b.damage, 4);
});
