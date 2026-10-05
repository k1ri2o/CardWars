import test from 'node:test';
import { makeGame, put, give, floop, target, act, creature, cardsWithScript, assert } from './helpers.mjs';
import '../js/engine/scripts/creatures-a.js';

const canFloop = (g, player, lane) => g.floopableLanes(player).includes(lane);
const uses = (id, script) => assert.ok(cardsWithScript(script).includes(id), `${id} should use ${script}`);
// Buildings whose abilities only fire when a creature dies, so they don't skew stats.
const BUILDING = 'Building_PuffyCastle';

test('ATKBonus: +val1 ATK to itself', () => {
  uses('Creature_Cornball', 'ATKBonus');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_Cornball'); // 2/5, val1 1, floop 2
  floop(g, 0, 0);
  assert.equal(s.atk, 3);
  assert.equal(g.magicPoints[0], 8);
  assert.equal(s.flooped, true);
});

test('ATKBonusAdjacentEmpty: +val1 per empty adjacent lane', () => {
  uses('Creature_CareCrow', 'ATKBonusAdjacentEmpty');
  const g = makeGame();
  const s = put(g, 0, 1, 'Creature_CareCrow'); // atk 5, val1 1
  floop(g, 0, 1);
  assert.equal(s.atk, 7);

  const g2 = makeGame();
  const edge = put(g2, 0, 0, 'Creature_CareCrow');
  floop(g2, 0, 0); // only one neighbour; the edge doesn't count
  assert.equal(edge.atk, 6);

  const g3 = makeGame();
  put(g3, 0, 0, 'Creature_Cornball');
  put(g3, 0, 1, 'Creature_CareCrow');
  put(g3, 0, 2, 'Creature_Cornball');
  assert.equal(canFloop(g3, 0, 1), false);
});

test('ATKBonusAll: every own creature gets +val1 ATK', () => {
  uses('Creature_TheMariachi', 'ATKBonusAll');
  const g = makeGame();
  const m = put(g, 0, 0, 'Creature_TheMariachi'); // atk 7, val1 4
  const c = put(g, 0, 2, 'Creature_Cornball');
  const enemy = put(g, 1, 0, 'Creature_Cornball');
  floop(g, 0, 0);
  assert.equal(m.atk, 11);
  assert.equal(c.atk, 6);
  assert.equal(enemy.atk, 2);
});

test('ATKBonusDamageSelf: takes val1 damage, gains val2 ATK; needs health > val1', () => {
  uses('Creature_CornWall', 'ATKBonusDamageSelf');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_CornWall'); // 0/18, val1 2, val2 2
  floop(g, 0, 0);
  assert.equal(s.damage, 2);
  assert.equal(s.atk, 2);
  s.flooped = false;
  s.damage = 16; // health 2, not > 2
  assert.equal(canFloop(g, 0, 0), false);
});

test('ATKBonusFloopCount: +1, then +2, ...', () => {
  uses('Creature_XMAS_SnowBall', 'ATKBonusFloopCount');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_XMAS_SnowBall'); // atk 5
  floop(g, 0, 0);
  assert.equal(s.atk, 6);
  s.flooped = false;
  floop(g, 0, 0);
  assert.equal(s.atk, 8);
});

test('ATKBonusFloopTurn: +val1 for each other floop this turn', () => {
  uses('Creature_BL_LogKnight', 'ATKBonusFloopTurn');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_BL_LogKnight'); // atk 10, val1 4
  put(g, 0, 1, 'Creature_Cornball');
  put(g, 0, 2, 'Creature_Cornball');
  assert.equal(canFloop(g, 0, 0), false);
  floop(g, 0, 1);
  floop(g, 0, 2);
  floop(g, 0, 0); // 3 floops this turn, 2 others
  assert.equal(s.atk, 18);
});

test('ATKBonusForBuilding: chosen own creature gets val1 ATK per building', () => {
  uses('Creature_BL_SunKing', 'ATKBonusForBuilding');
  const g = makeGame();
  put(g, 0, 0, 'Creature_BL_SunKing'); // val1 4
  const c = put(g, 0, 1, 'Creature_Cornball');
  assert.equal(canFloop(g, 0, 0), false);
  put(g, 0, 2, BUILDING);
  put(g, 0, 3, BUILDING);
  put(g, 1, 0, 'Creature_Cornball');
  floop(g, 0, 0);
  assert.equal(g.pending.side, 0);
  assert.deepEqual(g.pending.lanes, [0, 1]);
  target(g, 0, 1);
  assert.equal(c.atk, 2 + 8);
  assert.equal(g.pending, null);
});

test('ATKDEFBonus: +val1 ATK and +val2 DEF', () => {
  uses('Creature_BeachMum', 'ATKDEFBonus');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_BeachMum'); // 9/11, val1 2, val2 3
  floop(g, 0, 0);
  assert.equal(s.atk, 11);
  assert.equal(s.def, 14);
});

test('ATKHealBonus: +val1 ATK and heals val2', () => {
  uses('Creature_PapercutTiger', 'ATKHealBonus');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_PapercutTiger'); // 10/6, val1 2, val2 2
  s.damage = 3;
  floop(g, 0, 0);
  assert.equal(s.atk, 12);
  assert.equal(s.damage, 1);
});

test('ATKPenaltyCreatures: opposing creature loses val1 ATK per enemy creature', () => {
  uses('Creature_GreenSnakey', 'ATKPenaltyCreatures');
  const g = makeGame();
  put(g, 0, 0, 'Creature_GreenSnakey'); // val1 2
  assert.equal(canFloop(g, 0, 0), false);
  const facing = put(g, 1, 3, 'Creature_SandShark'); // atk 28
  const other = put(g, 1, 1, 'Creature_Cornball');
  floop(g, 0, 0);
  assert.equal(facing.atk, 24);
  assert.equal(other.atk, 2);
});

test('ATKPenaltyFaction: enemy creatures of faction baseVal1 lose val2 ATK', () => {
  uses('Creature_Pig', 'ATKPenaltyFaction'); // baseVal1 0 = Corn, val2 1
  const g = makeGame();
  put(g, 0, 0, 'Creature_Pig');
  const mine = put(g, 0, 1, 'Creature_Cornball');
  const shark = put(g, 1, 0, 'Creature_SandShark');
  assert.equal(canFloop(g, 0, 0), false);
  const corn1 = put(g, 1, 1, 'Creature_Cornball');
  const corn2 = put(g, 1, 2, 'Creature_HW_GhostSludger');
  floop(g, 0, 0);
  assert.equal(corn1.atk, 1);
  assert.equal(corn2.atk, 0);
  assert.equal(shark.atk, 28);
  assert.equal(mine.atk, 2);
});

test('ATKPenaltySacrifice: opposing creature loses val1 ATK and this creature is destroyed', () => {
  uses('Creature_BurningBush', 'ATKPenaltySacrifice');
  const g = makeGame();
  put(g, 0, 0, 'Creature_BurningBush'); // val1 3
  assert.equal(canFloop(g, 0, 0), false);
  const shark = put(g, 1, 3, 'Creature_SandShark');
  floop(g, 0, 0);
  assert.equal(shark.atk, 25);
  assert.equal(g.laneHasCreature(0, 0), false);
  assert.equal(g.discardPiles[0][0].form.id, 'Creature_BurningBush');
});

test('AdjacentATKBonus: adjacent creatures get +val1 ATK', () => {
  uses('Creature_Earl', 'AdjacentATKBonus');
  const g = makeGame();
  const earl = put(g, 0, 1, 'Creature_Earl'); // atk 10, val1 3
  assert.equal(canFloop(g, 0, 1), false);
  const a = put(g, 0, 0, 'Creature_Cornball');
  const b = put(g, 0, 2, 'Creature_Cornball');
  const far = put(g, 0, 3, 'Creature_Cornball');
  floop(g, 0, 1);
  assert.equal(a.atk, 5);
  assert.equal(b.atk, 5);
  assert.equal(far.atk, 2);
  assert.equal(earl.atk, 10);
});

test('AdjacentDEFBonus: adjacent creatures get +val1 DEF', () => {
  uses('Creature_IceKnight', 'AdjacentDEFBonus');
  const g = makeGame();
  const knight = put(g, 0, 3, 'Creature_IceKnight'); // def 12, val1 5
  assert.equal(canFloop(g, 0, 3), false);
  const a = put(g, 0, 2, 'Creature_Cornball');
  const far = put(g, 0, 1, 'Creature_Cornball');
  floop(g, 0, 3);
  assert.equal(a.def, 10);
  assert.equal(far.def, 5);
  assert.equal(knight.def, 12);
});

test("BlockFloop: opposing creature can't floop on its owner's next turn", () => {
  uses('Creature_CoolDog', 'BlockFloop');
  const g = makeGame();
  put(g, 0, 0, 'Creature_CoolDog');
  assert.equal(canFloop(g, 0, 0), false);
  const enemy = put(g, 1, 3, 'Creature_Cornball');
  floop(g, 0, 0);
  assert.equal(enemy.floopBlocked, true);
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.activePlayer, 1);
  assert.equal(g.apply(1, { type: 'floop', lane: 3 }).ok, false);
  act(g, 1, { type: 'endTurn' });
  assert.equal(enemy.floopBlocked, false);
  assert.equal(canFloop(g, 0, 0), true);
  // An already blocked creature can't be targeted again.
  creature(g, 1, 3).floopBlocked = true;
  assert.equal(canFloop(g, 0, 0), false);
});

test('BlockFloopTarget: owner picks an unblocked enemy creature to block', () => {
  uses('Creature_EmbarrassingBard', 'BlockFloopTarget');
  const g = makeGame();
  put(g, 0, 0, 'Creature_EmbarrassingBard');
  assert.equal(canFloop(g, 0, 0), false);
  const a = put(g, 1, 0, 'Creature_Cornball');
  const b = put(g, 1, 2, 'Creature_Cornball');
  b.floopBlocked = true;
  assert.equal(canFloop(g, 0, 0), true);
  floop(g, 0, 0);
  assert.equal(g.pending.side, 1);
  assert.deepEqual(g.pending.lanes, [0]);
  target(g, 0, 0);
  assert.equal(a.floopBlocked, true);
  put(g, 0, 1, 'Creature_EmbarrassingBard');
  assert.equal(canFloop(g, 0, 1), false); // every enemy creature already blocked
});

test('BlockSummon: nothing can be summoned in the opposing lane next turn', () => {
  uses('Creature_ElfChief', 'BlockSummon');
  const corn = ['Corn', 'Corn', 'Corn', 'Corn'];
  const g = makeGame({ landscapes: [corn, corn] });
  put(g, 0, 0, 'Creature_ElfChief'); // faces p1 lane 3
  put(g, 1, 3, 'Creature_HW_GhostSludger'); // survives ElfChief's attack
  floop(g, 0, 0);
  assert.equal(g.getLane(1, 3).disabled, true);
  assert.equal(canFloop(g, 0, 0), false);
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.getLane(1, 3).disabled, true);
  const c = give(g, 1, 'Creature_Cornball');
  assert.equal(g.apply(1, { type: 'play', uid: c.uid, lane: 3 }).ok, false);
  const b = give(g, 1, BUILDING);
  assert.equal(g.apply(1, { type: 'play', uid: b.uid, lane: 3 }).ok, false);
  act(g, 1, { type: 'play', uid: c.uid, lane: 2 });
  act(g, 1, { type: 'endTurn' });
  assert.equal(g.getLane(1, 3).disabled, false);
});

test('BonusATKTarget: chosen own creature gets +val1 ATK', () => {
  uses('Creature_CornLord', 'BonusATKTarget');
  const g = makeGame();
  put(g, 0, 0, 'Creature_CornLord'); // val1 6
  const c = put(g, 0, 3, 'Creature_Cornball');
  put(g, 1, 1, 'Creature_Cornball');
  floop(g, 0, 0);
  assert.equal(g.pending.side, 0);
  assert.deepEqual(g.pending.lanes, [0, 3]);
  target(g, 0, 3);
  assert.equal(c.atk, 8);
});

test('BonusDEFTarget: chosen own creature gets +val1 DEF', () => {
  uses('Creature_AngelOfSand', 'BonusDEFTarget');
  const g = makeGame();
  const s = put(g, 0, 1, 'Creature_AngelOfSand'); // def 6, val1 2
  const c = put(g, 0, 2, 'Creature_Cornball');
  floop(g, 0, 1);
  assert.equal(g.pending.side, 0);
  assert.deepEqual(g.pending.lanes, [1, 2]);
  target(g, 0, 1);
  assert.equal(s.def, 8);
  assert.equal(c.def, 5);
});

test('CardsATKBonus: +val1 ATK per card in hand', () => {
  uses('Creature_CornRonin', 'CardsATKBonus');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_CornRonin'); // atk 18, val1 3
  assert.equal(canFloop(g, 0, 0), false);
  give(g, 0, 'Creature_Cornball');
  give(g, 0, 'Creature_Cornball');
  floop(g, 0, 0);
  assert.equal(s.atk, 24);
});

test("ConvertOpponentAttToHP: heals by the opposing creature's ATK", () => {
  uses('Creature_HateBird', 'ConvertOpponentAttToHP');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_HateBird');
  assert.equal(canFloop(g, 0, 0), false);
  const enemy = put(g, 1, 3, 'Creature_Cornball');
  enemy.atkMod = 3; // atk 5
  s.damage = 12;
  floop(g, 0, 0);
  assert.equal(s.damage, 7);
});

test('CreatureDEFBonus: +val1 DEF per own creature', () => {
  uses('Creature_SandFoot', 'CreatureDEFBonus');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_SandFoot'); // def 17, val1 4
  put(g, 0, 1, 'Creature_Cornball');
  put(g, 0, 2, 'Creature_Cornball');
  put(g, 1, 0, 'Creature_Cornball');
  floop(g, 0, 0);
  assert.equal(s.def, 29);
});

test('DEFBonus: +val1 DEF', () => {
  uses('Creature_CactusBall', 'DEFBonus');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_CactusBall'); // def 3, val1 2
  floop(g, 0, 0);
  assert.equal(s.def, 5);
});

test('DEFBonusBuildings: every own creature gets val1 DEF per building', () => {
  uses('Creature_LadyScarab', 'DEFBonusBuildings');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_LadyScarab'); // def 20, val1 2
  const c = put(g, 0, 1, 'Creature_Cornball');
  const enemy = put(g, 1, 0, 'Creature_Cornball');
  assert.equal(canFloop(g, 0, 0), false);
  put(g, 0, 2, BUILDING);
  put(g, 0, 3, BUILDING);
  floop(g, 0, 0);
  assert.equal(s.def, 24);
  assert.equal(c.def, 9);
  assert.equal(enemy.def, 5);
});

test('DEFBonusCreatures: every own creature gets +val1 DEF', () => {
  uses('Creature_SandKnight', 'DEFBonusCreatures');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_SandKnight'); // def 15, val1 4
  const c = put(g, 0, 3, 'Creature_Cornball');
  const enemy = put(g, 1, 0, 'Creature_Cornball');
  floop(g, 0, 0);
  assert.equal(s.def, 19);
  assert.equal(c.def, 9);
  assert.equal(enemy.def, 5);
});

test('DEFBonusRandom: one random creature on either side gets +val1 DEF', () => {
  uses('Creature_Sandwitch', 'DEFBonusRandom');
  const seen = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const g = makeGame({ seed });
    const all = [
      put(g, 0, 0, 'Creature_Sandwitch'), // val1 9
      put(g, 0, 1, 'Creature_Cornball'),
      put(g, 1, 0, 'Creature_Cornball'),
      put(g, 1, 2, 'Creature_Cornball'),
    ];
    floop(g, 0, 0);
    const boosted = all.filter((c) => c.defMod === 9);
    assert.equal(boosted.length, 1);
    assert.equal(all.reduce((n, c) => n + c.defMod, 0), 9);
    seen.add(boosted[0].owner);
  }
  assert.deepEqual([...seen].sort(), [0, 1]); // can land on either side
});

test('DEFPenaltyATKBonusAdjacent: adjacent creatures lose val1 DEF and gain val2 ATK', () => {
  uses('Creature_Sludger', 'DEFPenaltyATKBonusAdjacent');
  const g = makeGame();
  const s = put(g, 0, 1, 'Creature_Sludger'); // val1 2, val2 4
  const a = put(g, 0, 0, 'Creature_Cornball');
  const b = put(g, 0, 2, 'Creature_Cornball');
  a.damage = 3; // health 2, not > val1
  b.damage = 3;
  assert.equal(canFloop(g, 0, 1), false);
  b.damage = 0;
  floop(g, 0, 1);
  assert.equal(b.def, 3);
  assert.equal(b.atk, 6);
  // Every adjacent creature is hit, even the one that didn't enable the floop.
  assert.equal(g.laneHasCreature(0, 0), false);
  assert.equal(s.def, 15);
});

test('DEFPenaltyDamageSelf: takes val1 damage, opposing creature loses val2 DEF', () => {
  uses('Creature_PorcelainGuardian', 'DEFPenaltyDamageSelf');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_PorcelainGuardian'); // val1 2, val2 10
  assert.equal(canFloop(g, 0, 0), false);
  const shark = put(g, 1, 3, 'Creature_SandShark'); // def 14
  floop(g, 0, 0);
  assert.equal(s.damage, 2);
  assert.equal(shark.def, 4);
});

test('DamageAll: val1 damage to every enemy creature', () => {
  uses('Creature_DarkAngel', 'DamageAll');
  const g = makeGame();
  put(g, 0, 0, 'Creature_DarkAngel'); // val1 5
  const mine = put(g, 0, 1, 'Creature_Cornball');
  assert.equal(canFloop(g, 0, 0), false);
  put(g, 1, 0, 'Creature_Cornball'); // def 5: dies
  const big = put(g, 1, 2, 'Creature_HW_GhostSludger');
  floop(g, 0, 0);
  assert.equal(g.laneHasCreature(1, 0), false);
  assert.equal(g.discardPiles[1][0].form.id, 'Creature_Cornball');
  assert.equal(big.damage, 5);
  assert.equal(mine.damage, 0);
});

test('DamageAllDamageOne: val1 damage to every enemy creature, val2 to itself', () => {
  uses('Creature_XMAS_CowPurple', 'DamageAllDamageOne');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_XMAS_CowPurple'); // def 20, val1 5, val2 5
  assert.equal(canFloop(g, 0, 0), false);
  const a = put(g, 1, 1, 'Creature_HW_GhostSludger');
  const b = put(g, 1, 3, 'Creature_SandShark');
  floop(g, 0, 0);
  assert.equal(a.damage, 5);
  assert.equal(b.damage, 5);
  assert.equal(s.damage, 5);
});

test('DamageAllHealAll: heals own creatures val2, damages enemies val1', () => {
  uses('Creature_TreeEvil', 'DamageAllHealAll');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_TreeEvil'); // val1 2, val2 4
  const mine = put(g, 0, 2, 'Creature_Cornball');
  s.damage = 6;
  mine.damage = 3;
  const enemy = put(g, 1, 1, 'Creature_HW_GhostSludger');
  floop(g, 0, 0);
  assert.equal(s.damage, 2);
  assert.equal(mine.damage, 0);
  assert.equal(enemy.damage, 2);

  const g2 = makeGame();
  put(g2, 1, 0, 'Creature_Cornball');
  put(g2, 0, 0, 'Creature_TreeEvil');
  assert.equal(canFloop(g2, 0, 0), true);
});

test('DamageAndDiscard: val1 damage to the opposing creature, then this creature is discarded', () => {
  uses('Creature_OrangeSlimey', 'DamageAndDiscard');
  const g = makeGame();
  put(g, 0, 2, 'Creature_OrangeSlimey'); // val1 4, faces p1 lane 1
  assert.equal(canFloop(g, 0, 2), false);
  const shark = put(g, 1, 1, 'Creature_SandShark');
  floop(g, 0, 2);
  assert.equal(shark.damage, 4);
  assert.equal(g.laneHasCreature(0, 2), false);
  assert.equal(g.discardPiles[0][0].form.id, 'Creature_OrangeSlimey');
});

test("DamageAndTakeCard: a creature killed by the hit goes to the attacker's hand", () => {
  uses('Creature_VampGhost', 'DamageAndTakeCard');
  const g = makeGame();
  put(g, 0, 0, 'Creature_VampGhost'); // val1 4
  assert.equal(canFloop(g, 0, 0), false);
  const victim = put(g, 1, 3, 'Creature_Cornball');
  victim.damage = 1; // health 4
  floop(g, 0, 0);
  assert.equal(g.laneHasCreature(1, 3), false);
  assert.ok(g.hands[0].includes(victim.data));
  assert.ok(!g.discardPiles[1].includes(victim.data));

  const g2 = makeGame();
  put(g2, 0, 0, 'Creature_VampGhost');
  const big = put(g2, 1, 3, 'Creature_HW_GhostSludger');
  floop(g2, 0, 0);
  assert.equal(big.damage, 4);
  assert.equal(g2.hands[0].length, 0);

  const g3 = makeGame();
  put(g3, 0, 0, 'Creature_VampGhost');
  put(g3, 1, 3, 'Creature_Cornball');
  for (let i = 0; i < 7; i++) give(g3, 0, 'Creature_Cornball');
  assert.equal(canFloop(g3, 0, 0), false);
});

test('DamageHero: val1 damage to the opposing hero', () => {
  uses('Creature_TeethLeaf', 'DamageHero');
  const g = makeGame();
  put(g, 0, 0, 'Creature_TeethLeaf'); // val1 2
  put(g, 1, 3, 'Creature_Cornball');
  const hp = g.health[1];
  floop(g, 0, 0);
  assert.equal(g.health[1], hp - 2);
  assert.equal(g.health[0], g.maxHealth[0]);
});

test('DamageHeroCards: val1 hero damage per card in hand', () => {
  uses('Creature_ChestBurster', 'DamageHeroCards');
  const g = makeGame();
  put(g, 0, 0, 'Creature_ChestBurster'); // val1 2
  for (let i = 0; i < 3; i++) give(g, 0, 'Creature_Cornball');
  const hp = g.health[1];
  floop(g, 0, 0);
  assert.equal(g.health[1], hp - 6);
});

test('DamageHeroFloop: val1 hero damage per other floop this turn', () => {
  uses('Creature_BL_EyeGuy', 'DamageHeroFloop');
  const g = makeGame();
  put(g, 0, 0, 'Creature_BL_EyeGuy'); // val1 3, floop 3
  put(g, 0, 1, 'Creature_Cornball');
  put(g, 0, 2, 'Creature_Cornball');
  assert.equal(canFloop(g, 0, 0), false);
  floop(g, 0, 1);
  floop(g, 0, 2);
  const hp = g.health[1];
  g.magicPoints[0] = 10;
  floop(g, 0, 0);
  assert.equal(g.health[1], hp - 6);
});

test('DamageOneHealAll: heals other own creatures val1, takes val2 itself', () => {
  uses('Creature_XMAS_WallOfChocolate', 'DamageOneHealAll');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_XMAS_WallOfChocolate'); // val1 4, val2 2
  const mine = put(g, 0, 1, 'Creature_HW_GhostSludger');
  mine.damage = 10;
  s.damage = 1;
  const enemy = put(g, 1, 0, 'Creature_HW_GhostSludger');
  enemy.damage = 10;
  floop(g, 0, 0);
  assert.equal(mine.damage, 6);
  assert.equal(s.damage, 3);
  assert.equal(enemy.damage, 10);
});

test('DamageOpponent: val1 damage to the opposing creature', () => {
  uses('Creature_Ninja', 'DamageOpponent');
  const g = makeGame();
  put(g, 0, 1, 'Creature_Ninja'); // val1 3, faces p1 lane 2
  assert.equal(canFloop(g, 0, 1), false);
  const enemy = put(g, 1, 2, 'Creature_HW_GhostSludger');
  const other = put(g, 1, 1, 'Creature_HW_GhostSludger');
  floop(g, 0, 1);
  assert.equal(enemy.damage, 3);
  assert.equal(other.damage, 0);
});

test('DamageOpponentAdjacents: val1 damage to the opposing creature and its neighbours', () => {
  uses('Creature_GiantFoot', 'DamageOpponentAdjacents');
  const g = makeGame();
  put(g, 0, 1, 'Creature_GiantFoot'); // val1 4, faces p1 lane 2
  assert.equal(canFloop(g, 0, 1), false);
  const e = [0, 1, 2, 3].map((i) => put(g, 1, i, 'Creature_HW_GhostSludger'));
  floop(g, 0, 1);
  assert.deepEqual(e.map((c) => c.damage), [0, 4, 4, 4]);
});

test('DamageOpponentAndHero: val1 to the opposing creature and hero, or just the hero', () => {
  uses('Creature_PirateBear', 'DamageOpponentAndHero');
  const g = makeGame();
  put(g, 0, 0, 'Creature_PirateBear'); // val1 5
  const hp = g.health[1];
  floop(g, 0, 0);
  assert.equal(g.health[1], hp - 5);

  const g2 = makeGame();
  put(g2, 0, 0, 'Creature_PirateBear');
  const enemy = put(g2, 1, 3, 'Creature_HW_GhostSludger');
  floop(g2, 0, 0);
  assert.equal(enemy.damage, 5);
  assert.equal(g2.health[1], hp - 5);
});

test('DamageOpponentAndSelf: val1 to the opposing creature, val2 to itself', () => {
  uses('Creature_XMAS_Paladim', 'DamageOpponentAndSelf');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_XMAS_Paladim'); // val1 8, val2 1
  assert.equal(canFloop(g, 0, 0), false);
  const enemy = put(g, 1, 3, 'Creature_HW_GhostSludger');
  floop(g, 0, 0);
  assert.equal(enemy.damage, 8);
  assert.equal(s.damage, 1);
});

test('DamageOpponentCards: val1 damage per card in hand to the opposing creature', () => {
  uses('Creature_Herculeye', 'DamageOpponentCards');
  const g = makeGame();
  put(g, 0, 0, 'Creature_Herculeye'); // val1 2
  assert.equal(canFloop(g, 0, 0), false);
  const enemy = put(g, 1, 3, 'Creature_HW_GhostSludger');
  for (let i = 0; i < 3; i++) give(g, 0, 'Creature_Cornball');
  floop(g, 0, 0);
  assert.equal(enemy.damage, 6);
});

test("DamageOpponentDEF: damage equal to this creature's DEF", () => {
  uses('Creature_CactusThug', 'DamageOpponentDEF');
  const g = makeGame();
  const s = put(g, 0, 0, 'Creature_CactusThug'); // def 18
  assert.equal(canFloop(g, 0, 0), false);
  const enemy = put(g, 1, 3, 'Creature_HW_GhostSludger'); // def 37
  s.defMod = 2;
  floop(g, 0, 0);
  assert.equal(enemy.damage, 20);
});
