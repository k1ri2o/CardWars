import test from 'node:test';
import { makeGame, put, give, discard, floop, play, target, act, creature, building, cardsWithScript, heroesWithScript, assert, db } from './helpers.mjs';
import '../js/engine/scripts/buildings-leaders.js';
import { CardType } from '../js/engine/consts.js';

// ---- local helpers ---------------------------------------------------------

/** The one card id using `script` (first match). */
const card = (script) => {
  const ids = cardsWithScript(script);
  assert.ok(ids.length > 0, `no card uses ${script}`);
  return ids[0];
};

/** A game where player 0 plays `hero` (a specific id, or the first one using the script). */
function heroGame(heroOrScript, opts = {}) {
  const hero = heroOrScript.startsWith('Leader_') ? heroOrScript : heroesWithScript(heroOrScript)[0];
  assert.ok(hero, `no hero uses ${heroOrScript}`);
  return makeGame({ heroes: [hero, 'Leader_Jake'], ...opts });
}

/** Makes a creature floopable for free of side effects, whatever its real script. */
function floopable(c) {
  c.canFloop = () => true;
  c.floop = () => {};
  return c;
}

const leader = (g) => act(g, 0, { type: 'leader' });
const leaderFails = (g) => assert.equal(g.apply(0, { type: 'leader' }).ok, false);
const removeBuilding = (g, p, lane) => g.removeCardFromPlay(p, lane, CardType.Building);
const removeCreature = (g, p, lane) => g.removeCardFromPlay(p, lane, CardType.Creature);

// ---- buildings -------------------------------------------------------------

test('ATKBonusBuilding: +Val1 ATK to the lane creature, either order, removed on leave', () => {
  const g = makeGame();
  const id = card('ATKBonusBuilding'); // Red Dome, +3
  const a = put(g, 0, 0, 'Creature_Cornball'); // 2/5
  put(g, 0, 0, id);
  assert.equal(a.atk, 5);
  put(g, 0, 1, id);
  const b = put(g, 0, 1, 'Creature_Cornball');
  assert.equal(b.atk, 5);
  removeBuilding(g, 0, 0);
  assert.equal(a.atk, 2);
});

test('ATKBonusCards: +Val1 ATK per card in the opponent hand, follows the hand size', () => {
  const g = makeGame();
  for (let i = 0; i < 3; i++) give(g, 1, 'Creature_Cornball');
  const c = put(g, 0, 0, 'Creature_Cornball');
  put(g, 0, 0, card('ATKBonusCards')); // Silo of Truth, +2 each
  assert.equal(c.atk, 2 + 6);
  give(g, 1, 'Creature_Cornball');
  g.settle();
  assert.equal(c.atk, 2 + 8);
  g.hands[1].length = 1;
  g.settle();
  assert.equal(c.atk, 2 + 2);
  removeBuilding(g, 0, 0);
  assert.equal(c.atk, 2);
});

test('ATKBonusCreatures: +Val1 ATK per own creature, tracks creatures entering and leaving', () => {
  const g = makeGame();
  const c = put(g, 0, 0, 'Creature_Cornball');
  put(g, 0, 1, 'Creature_Cornball');
  put(g, 0, 0, card('ATKBonusCreatures')); // Red Castle, +2 each
  assert.equal(c.atk, 2 + 4);
  put(g, 0, 2, 'Creature_Cornball');
  assert.equal(c.atk, 2 + 6);
  removeCreature(g, 0, 2);
  assert.equal(c.atk, 2 + 4);
  removeBuilding(g, 0, 0);
  assert.equal(c.atk, 2);
});

test('ATKBonusLandscapes: +Val1 ATK per distinct own landscape type', () => {
  const g = makeGame({ landscapes: [['Corn', 'Plains', 'Swamp', 'Corn'], ['Plains', 'Plains', 'Plains', 'Plains']] });
  const c = put(g, 0, 0, 'Creature_Cornball');
  put(g, 0, 0, card('ATKBonusLandscapes')); // Red Parthenon, +2 each
  assert.equal(c.atk, 2 + 6);
  removeBuilding(g, 0, 0);
  assert.equal(c.atk, 2);
});

test('ATKDEFBonusBuilding: +Val1 ATK and +Val2 DEF', () => {
  const g = makeGame();
  const c = put(g, 0, 0, 'Creature_Cornball');
  put(g, 0, 0, 'Building_SandCastle'); // +4/+4
  assert.equal(c.atk, 6);
  assert.equal(c.def, 9);
  removeBuilding(g, 0, 0);
  assert.equal(c.atk, 2);
  assert.equal(c.def, 5);
});

test('ATKDEFBonusEmptyLanes: +Val per empty lane; leaving uses the creature count', () => {
  const g = makeGame();
  const c = put(g, 0, 0, 'Creature_Cornball');
  put(g, 0, 0, card('ATKDEFBonusEmptyLanes')); // Cave of Solitude, +5/+5 each
  assert.equal(c.atk, 2 + 15);
  assert.equal(c.def, 5 + 15);
  put(g, 0, 1, 'Creature_Cornball');
  assert.equal(c.atk, 2 + 10);
  assert.equal(c.def, 5 + 10);
  removeCreature(g, 0, 1);
  assert.equal(c.atk, 2 + 15);
  // As in the original: the removal subtracts Val * CreatureCount (1), not * EmptyLaneCount (3).
  removeBuilding(g, 0, 0);
  assert.equal(c.atk, 2 + 10);
  assert.equal(c.def, 5 + 10);
});

test('ATKOnFloop: the lane creature gains Val1 ATK each floop', () => {
  const g = makeGame();
  const c = floopable(put(g, 0, 0, 'Creature_Cornball'));
  put(g, 0, 0, card('ATKOnFloop')); // Sun Pyramid, +4
  assert.equal(c.atk, 2);
  floop(g, 0, 0);
  assert.equal(c.atk, 6);
});

test('ActionOnFloop: owner gains BaseVal1 magic when the lane creature floops', () => {
  const g = makeGame();
  floopable(put(g, 0, 0, 'Creature_Cornball')); // floop cost 2
  put(g, 0, 0, card('ActionOnFloop')); // Haunted Windmill, +1
  floop(g, 0, 0);
  assert.equal(g.getMagicPoints(0), 10 - 2 + 1);
});

test('CreatureDamageOnEntry: a creature entering the lane deals Val1 to the opposing creature', () => {
  const g = makeGame();
  const enemy = put(g, 1, 3, 'Creature_HW_GhostSludger'); // faces p0 lane 0
  put(g, 0, 0, card('CreatureDamageOnEntry')); // Palace of Bone, 5
  assert.equal(enemy.damage, 0);
  put(g, 0, 0, 'Creature_Cornball');
  assert.equal(enemy.damage, 5);
  put(g, 0, 1, 'Creature_Cornball'); // other lane: nothing
  assert.equal(enemy.damage, 5);
});

test('DEFBonusBuilding: +Val1 DEF', () => {
  const g = makeGame();
  const c = put(g, 0, 0, 'Creature_Cornball');
  put(g, 0, 0, 'Building_BlueCastle'); // +4
  assert.equal(c.def, 9);
  removeBuilding(g, 0, 0);
  assert.equal(c.def, 5);
});

test('DEFBonusCards: +Val1 DEF per card in the owner hand, follows the hand size', () => {
  const g = makeGame();
  give(g, 0, 'Creature_Cornball');
  give(g, 0, 'Creature_Cornball');
  const c = put(g, 0, 0, 'Creature_Cornball');
  put(g, 0, 0, card('DEFBonusCards')); // Pyramidia, +2 each
  assert.equal(c.def, 5 + 4);
  give(g, 0, 'Creature_Cornball');
  g.settle();
  assert.equal(c.def, 5 + 6);
  play(g, 0, g.hands[0][0], 1); // hand down to 2
  assert.equal(c.def, 5 + 4);
  removeBuilding(g, 0, 0);
  assert.equal(c.def, 5);
});

test('DEFBonusCards: a creature played from hand into the lane gets Val1 * (hand - 1), as in the original', () => {
  const g = makeGame();
  for (let i = 0; i < 3; i++) give(g, 0, 'Creature_Cornball');
  put(g, 0, 2, card('DEFBonusCards'));
  // The original's Update ran during the summon animation (hand 3 -> 2: -2 on
  // the creature already in the lane) before FinishSummoning added 2 * 2.
  play(g, 0, g.hands[0][0], 2);
  const c = creature(g, 0, 2);
  assert.equal(c.def, 5 + 4 - 2);
  give(g, 0, 'Creature_Cornball');
  g.settle();
  assert.equal(c.def, 5 + 6 - 2);
});

test('DEFBonusCreaturesBuilding: +Val1 DEF per own creature', () => {
  const g = makeGame();
  const c = put(g, 0, 0, 'Creature_Cornball');
  put(g, 0, 0, card('DEFBonusCreaturesBuilding')); // Elf TeePee, +3 each
  assert.equal(c.def, 5 + 3);
  put(g, 0, 3, 'Creature_Cornball');
  assert.equal(c.def, 5 + 6);
  removeCreature(g, 0, 3);
  assert.equal(c.def, 5 + 3);
  removeBuilding(g, 0, 0);
  assert.equal(c.def, 5);
});

test('DEFOnFloop: the lane creature gains Val1 DEF each floop', () => {
  const g = makeGame();
  const c = floopable(put(g, 0, 0, 'Creature_Cornball'));
  put(g, 0, 0, card('DEFOnFloop')); // School House, +5
  floop(g, 0, 0);
  assert.equal(c.def, 10);
});

test('DamageHeroOnDeath: Val1 damage to the opposing hero when the lane creature dies', () => {
  const g = makeGame();
  const c = put(g, 0, 0, 'Creature_Cornball');
  put(g, 0, 0, 'Building_Obelisx'); // 4
  const hp = g.getHealth(1);
  c.damage = 99;
  g.settle();
  assert.equal(g.laneHasCreature(0, 0), false);
  assert.equal(g.getHealth(1), hp - 4);
});

test('DamageReduction: the lane creature takes Val1 less damage', () => {
  const g = makeGame();
  const c = put(g, 0, 0, 'Creature_HW_GhostSludger');
  put(g, 0, 0, card('DamageReduction')); // Sphinx, 5
  assert.equal(c.damageReduction, 5);
  c.takeDamage(null, 7);
  assert.equal(c.damage, 2);
  removeBuilding(g, 0, 0);
  assert.equal(c.damageReduction, 0);
  const late = put(g, 0, 1, card('DamageReduction'));
  assert.ok(late);
  const d = put(g, 0, 1, 'Creature_Cornball');
  assert.equal(d.damageReduction, 5);
});

test('FloopCostMod: floops in this lane cost BaseVal1 less', () => {
  const g = makeGame();
  const c = floopable(put(g, 0, 0, 'Creature_Cornball')); // floop cost 2
  put(g, 0, 0, card('FloopCostMod')); // Stonehenge, 1
  assert.equal(g.getLane(0, 0).floopMod, -1);
  assert.equal(c.determineFloopCost(), 1);
  floop(g, 0, 0);
  assert.equal(g.getMagicPoints(0), 9);
  removeBuilding(g, 0, 0);
  assert.equal(g.getLane(0, 0).floopMod, 0);
});

test('HealHeroOnDeath: owner hero heals Val1 when the lane creature dies', () => {
  const g = makeGame();
  const c = put(g, 0, 0, 'Creature_Cornball');
  put(g, 0, 0, card('HealHeroOnDeath')); // Puffy Castle, 5
  g.health[0] = g.maxHealth[0] - 10;
  c.damage = 99;
  g.settle();
  assert.equal(g.getHealth(0), g.maxHealth[0] - 5);
});

test('HealOnVictory: the lane creature heals Val1 when it destroys a creature', () => {
  const g = makeGame();
  const c = put(g, 0, 0, 'Creature_Cornball'); // 2/5
  put(g, 0, 0, card('HealOnVictory')); // Sand Pyramid, 5
  c.damage = 3;
  const enemy = put(g, 1, 3, 'Creature_Cornball');
  enemy.damage = 4;
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.laneHasCreature(1, 3), false);
  assert.equal(c.damage, 0);
});

test('HeroDamageOnEntry: Val1 damage to the opposing hero when a creature enters the lane', () => {
  const g = makeGame();
  const hp = g.getHealth(1);
  put(g, 0, 0, card('HeroDamageOnEntry')); // Spirit Tower, 5
  assert.equal(g.getHealth(1), hp);
  put(g, 0, 0, 'Creature_Cornball');
  assert.equal(g.getHealth(1), hp - 5);
});

test('RarityGate: the opposing lane only accepts rarity BaseVal1 or lower', () => {
  const g = makeGame();
  put(g, 0, 0, card('RarityGate')); // Shadow Pyramid, 3
  assert.equal(g.getLane(1, 3).rarityGate, 3);
  const big = db.form('Creature_DragonFoot'); // Plains, rarity 4
  assert.equal(big.canPlay(g, 1, 3), false);
  assert.equal(big.canPlay(g, 1, 2), true);
  assert.equal(db.form('Creature_AngelEye').canPlay(g, 1, 3), true);
  removeBuilding(g, 0, 0);
  assert.equal(big.canPlay(g, 1, 3), true);
});

test('ReturnToHandSacrifice: dead creature returns to hand, building is discarded', () => {
  const g = makeGame();
  const c = put(g, 0, 0, 'Creature_Cornball');
  const b = put(g, 0, 0, card('ReturnToHandSacrifice')); // Mausoleum
  c.damage = 99;
  g.settle();
  assert.equal(g.laneHasCreature(0, 0), false);
  assert.equal(g.laneHasBuilding(0, 0), false);
  assert.deepEqual(g.hands[0].map((i) => i.uid), [c.data.uid]);
  assert.equal(g.discardPiles[0].includes(c.data), false);
  assert.equal(g.discardPiles[0][0], b.data);
});

test('StartTurnHealCreature: the lane creature heals Val1 at the start of its owner turn', () => {
  const g = makeGame();
  const c = put(g, 0, 0, 'Creature_HW_GhostSludger');
  put(g, 0, 0, card('StartTurnHealCreature')); // Nicelands Tower, 5
  c.damage = 12;
  act(g, 0, { type: 'endTurn' });
  assert.equal(c.damage, 12); // opponent's turn: nothing yet
  act(g, 1, { type: 'endTurn' });
  assert.equal(g.activePlayer, 0);
  assert.equal(c.damage, 7);
});

test('StartTurnHealCreatures: heals Val1 per own creature at the start of the turn', () => {
  const g = makeGame();
  const c = put(g, 0, 0, 'Creature_HW_GhostSludger');
  put(g, 0, 1, 'Creature_HW_GhostSludger');
  put(g, 0, 2, 'Creature_HW_GhostSludger');
  put(g, 0, 0, card('StartTurnHealCreatures')); // Comfy Cave, 2 each
  c.damage = 10;
  act(g, 0, { type: 'endTurn' });
  act(g, 1, { type: 'endTurn' });
  assert.equal(c.damage, 10 - 6);
});

test('SwapATKDEFBuilding: swaps ATK and DEF; leaving uses the building base stats', () => {
  const g = makeGame();
  const c = put(g, 0, 0, 'Creature_Cornball'); // 2/5
  put(g, 0, 0, card('SwapATKDEFBuilding'));
  assert.equal(c.atk, 5);
  assert.equal(c.def, 2);
  put(g, 0, 1, card('SwapATKDEFBuilding'));
  const d = put(g, 0, 1, 'Creature_Cornball');
  assert.equal(d.atk, 5);
  assert.equal(d.def, 2);
  // As in the original: on leaving it subtracts the building's BaseATK/DEF (0),
  // so the creature ends up with ATK 2+2 and DEF 5+5.
  removeBuilding(g, 0, 0);
  assert.equal(c.atk, 4);
  assert.equal(c.def, 10);
});

// ---- hero powers -----------------------------------------------------------

test('ATKBonusAllCreaturesLeader: every own creature gains BaseVal1 ATK', () => {
  const g = heroGame('Leader_Marceline'); // +2, cooldown 3
  leaderFails(g); // no creatures
  const a = put(g, 0, 0, 'Creature_Cornball');
  const b = put(g, 0, 2, 'Creature_DevilEye');
  const e = put(g, 1, 0, 'Creature_Cornball');
  leader(g);
  assert.equal(a.atk, 4);
  assert.equal(b.atk, 7);
  assert.equal(e.atk, 2);
  assert.equal(g.getLeaderCooldown(0), 3);
  leaderFails(g);
});

test('ATKBonusFactionCreaturesLeader: only creatures of forFaction gain BaseVal1 ATK', () => {
  const g = heroGame('Leader_Jake'); // Corn +3
  const u = put(g, 0, 1, 'Creature_DevilEye'); // Universal
  leaderFails(g);
  const corn = put(g, 0, 0, 'Creature_Cornball');
  leader(g);
  assert.equal(corn.atk, 5);
  assert.equal(u.atk, 5);
});

test('ATKDEFBonusFactionCreaturesLeader: forFaction creatures gain BaseVal1 ATK and BaseVal2 DEF', () => {
  const g = heroGame('ATKDEFBonusFactionCreaturesLeader'); // Cotton +1/+2
  const corn = put(g, 0, 0, 'Creature_Cornball');
  leaderFails(g);
  const cotton = put(g, 0, 1, 'Creature_AngelHeart'); // 1/6
  leader(g);
  assert.equal(cotton.atk, 2);
  assert.equal(cotton.def, 8);
  assert.equal(corn.atk, 2);
  assert.equal(corn.def, 5);
});

test('BlockCardTypeDestroyBuildingsLeader: discards enemy buildings and blocks their spells for a round', () => {
  const g = heroGame('BlockCardTypeDestroyBuildingsLeader'); // spells
  leaderFails(g); // no enemy spells in hand, no enemy buildings
  const c = put(g, 1, 0, 'Creature_Cornball');
  const dome = put(g, 1, 0, 'Building_RedDome');
  put(g, 1, 2, 'Building_BlueCastle');
  const spell = give(g, 1, 'Spell_BoneWand');
  assert.equal(c.atk, 5);
  leader(g);
  assert.equal(g.laneHasBuilding(1, 0), false);
  assert.equal(g.laneHasBuilding(1, 2), false);
  assert.equal(g.discardPiles[1].includes(dome.data), true);
  assert.equal(g.discardPiles[1].length, 2);
  assert.equal(c.atk, 2);
  assert.equal(g.isCastingEnabled(1, CardType.Spell), false);
  assert.equal(g.isCastingEnabled(1, CardType.Creature), true);
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.activePlayer, 1);
  assert.equal(g.apply(1, { type: 'play', uid: spell.uid, lane: -1 }).ok, false);
  act(g, 1, { type: 'endTurn' });
  assert.equal(g.isCastingEnabled(1, CardType.Spell), true);
});

test('BlockCardTypeDestroyBuildingsLeader: usable with only a spell in the enemy hand', () => {
  const g = heroGame('BlockCardTypeDestroyBuildingsLeader');
  give(g, 1, 'Spell_BoneWand');
  leader(g);
  assert.equal(g.isCastingEnabled(1, CardType.Spell), false);
});

test('DEFBonusAllCreaturesLeader: every own creature gains BaseVal1 DEF', () => {
  const g = heroGame('Leader_BananaGuard'); // +3
  leaderFails(g);
  const a = put(g, 0, 0, 'Creature_Cornball');
  const b = put(g, 0, 3, 'Creature_AngelHeart');
  leader(g);
  assert.equal(a.def, 8);
  assert.equal(b.def, 9);
});

test('DEFBonusFactionCreaturesLeader: forFaction creatures gain BaseVal1 DEF', () => {
  const g = heroGame('Leader_FinnPajama'); // Universal +5
  const corn = put(g, 0, 0, 'Creature_Cornball');
  leaderFails(g);
  const u = put(g, 0, 1, 'Creature_DevilEye'); // 5/5
  leader(g);
  assert.equal(u.def, 10);
  assert.equal(corn.def, 5);
});

test('DrawCardsLeader: draws BaseVal1 cards', () => {
  const g = heroGame('Leader_FlamePrincess'); // 2
  const deck = g.getDeck(0).cardCount();
  leader(g);
  assert.equal(g.hands[0].length, 2);
  assert.equal(g.getDeck(0).cardCount(), deck - 2);
  const g2 = heroGame('Leader_FlamePrincess');
  for (let i = 0; i < 7; i++) give(g2, 0, 'Creature_Cornball');
  leaderFails(g2);
});

test('GainActionPointsLeader: gains BaseVal1 magic', () => {
  const g = heroGame('Leader_Finn'); // 2, cooldown 5
  leader(g);
  assert.equal(g.getMagicPoints(0), 12);
  assert.equal(g.getLeaderCooldown(0), 5);
});

test('HealAllCreaturesLeader: fully heals every damaged own creature', () => {
  const g = heroGame('Leader_PrincessBubblegum');
  const a = put(g, 0, 0, 'Creature_Cornball');
  const b = put(g, 0, 1, 'Creature_HW_GhostSludger');
  const e = put(g, 1, 0, 'Creature_HW_GhostSludger');
  leaderFails(g);
  a.damage = 3;
  b.damage = 20;
  e.damage = 5;
  leader(g);
  assert.equal(a.damage, 0);
  assert.equal(b.damage, 0);
  assert.equal(e.damage, 5);
});

test('HealAllFactionCreaturesLeader: fully heals damaged creatures of forFaction only', () => {
  const g = heroGame('Leader_Lumpy'); // Plains
  const plains = put(g, 0, 0, 'Creature_AngelEye'); // 1/7
  const corn = put(g, 0, 1, 'Creature_Cornball');
  corn.damage = 2;
  leaderFails(g); // only a Corn creature is damaged
  plains.damage = 3;
  leader(g);
  assert.equal(plains.damage, 0);
  assert.equal(corn.damage, 2);
});

test('HealCreatureLeader: fully heals the picked damaged creature', () => {
  const g = heroGame('HealCreatureLeader');
  const a = put(g, 0, 0, 'Creature_Cornball');
  const b = put(g, 0, 2, 'Creature_HW_GhostSludger');
  leaderFails(g);
  a.damage = 1;
  b.damage = 30;
  leader(g);
  assert.deepEqual(g.pending.lanes, [0, 2]);
  assert.equal(g.pending.side, 0);
  target(g, 0, 2);
  assert.equal(b.damage, 0);
  assert.equal(a.damage, 1);
  assert.equal(g.pending, null);
});

test('ReduceCostLeader: every card costs 1 less this turn', () => {
  const g = heroGame('Leader_Hunson');
  give(g, 0, 'Creature_DevilEye');
  leaderFails(g); // needs more than one card in hand
  give(g, 0, 'Spell_BlackholePendant');
  leader(g);
  assert.equal(db.form('Creature_DevilEye').determineCost(g, 0), 1);
  assert.equal(db.form('Spell_BlackholePendant').determineCost(g, 0), 3);
  assert.equal(db.form('Building_RedDome').determineCost(g, 0), 0);
  assert.equal(db.form('Creature_DevilEye').determineCost(g, 1), 2);
});

test('ReduceFactionCreatureCostLeader: forFaction cards cost BaseVal1 less, others BaseVal2 less', () => {
  const g = heroGame('ReduceFactionCreatureCostLeader'); // Cotton creatures -2, other creatures -1
  give(g, 0, 'Spell_BlackholePendant');
  leaderFails(g); // no creature in hand
  give(g, 0, 'Creature_Cornball');
  leader(g);
  assert.equal(db.form('Creature_CottonEyeBat').determineCost(g, 0), 0); // 2 - 2
  assert.equal(db.form('Creature_Cow').determineCost(g, 0), 1); // 3 - 2
  assert.equal(db.form('Creature_DevilEye').determineCost(g, 0), 1); // Universal: 2 - 1
  assert.equal(db.form('Creature_DragonFoot').determineCost(g, 0), 3); // Plains: 4 - 1
  assert.equal(db.form('Spell_BlackholePendant').determineCost(g, 0), 4);
});

test('ReduceTypeCostLeader: forCardType cards cost BaseVal1 less', () => {
  const g = heroGame('Leader_Earl'); // creatures -1
  give(g, 0, 'Spell_BlackholePendant');
  leaderFails(g);
  give(g, 0, 'Creature_DevilEye');
  leader(g);
  assert.equal(db.form('Creature_DevilEye').determineCost(g, 0), 1);
  assert.equal(db.form('Spell_BlackholePendant').determineCost(g, 0), 4);
  const g2 = heroGame('Leader_JakeSweater'); // spells -2
  give(g2, 0, 'Spell_BlackholePendant');
  leader(g2);
  assert.equal(db.form('Spell_BlackholePendant').determineCost(g2, 0), 2);
});

test('ReturnBuildingsLeader: enemy buildings go back to hand (discarded when the hand is full)', () => {
  const g = heroGame('Leader_IceKing');
  leaderFails(g);
  const c = put(g, 1, 1, 'Creature_Cornball');
  const dome = put(g, 1, 1, 'Building_RedDome');
  const castle = put(g, 1, 3, 'Building_BlueCastle');
  put(g, 0, 0, 'Building_SandCastle'); // own building stays
  assert.equal(c.atk, 5);
  for (let i = 0; i < 6; i++) give(g, 1, 'Creature_Cornball');
  leader(g);
  assert.equal(g.laneHasBuilding(1, 1), false);
  assert.equal(g.laneHasBuilding(1, 3), false);
  assert.equal(g.laneHasBuilding(0, 0), true);
  assert.equal(c.atk, 2);
  assert.equal(g.hands[1].length, 7);
  assert.equal(g.hands[1].includes(dome.data), true);
  assert.equal(g.discardPiles[1][0], castle.data);
});

test('ReturnCardLeader: returns the picked card from the discard pile to hand', () => {
  const g = heroGame('Leader_Ash');
  leaderFails(g); // empty pile
  const a = discard(g, 0, 'Creature_Cornball');
  const s = discard(g, 0, 'Spell_BlackholePendant');
  leader(g);
  assert.equal(g.pending.kind, 'discard');
  assert.deepEqual(g.pending.cards.slice().sort(), [a.uid, s.uid].sort());
  act(g, 0, { type: 'discard', uid: a.uid });
  assert.deepEqual(g.hands[0], [a]);
  assert.deepEqual(g.discardPiles[0], [s]);
  assert.equal(g.pending, null);
  const g2 = heroGame('Leader_Ash');
  discard(g2, 0, 'Creature_Cornball');
  for (let i = 0; i < 7; i++) give(g2, 0, 'Creature_Cornball');
  leaderFails(g2); // full hand
});

test('ReturnCardTypeLeader: only cards of forCardType can be returned', () => {
  const g = heroGame('Leader_Gunter'); // spells
  discard(g, 0, 'Creature_Cornball');
  leaderFails(g);
  const s = discard(g, 0, 'Spell_BlackholePendant');
  leader(g);
  assert.deepEqual(g.pending.cards, [s.uid]);
  act(g, 0, { type: 'discard', uid: s.uid });
  assert.deepEqual(g.hands[0], [s]);
  assert.equal(g.discardPiles[0].length, 1);
});

test('every script in the batch is used by a real card or hero', () => {
  for (const s of ['ATKBonusBuilding', 'ATKBonusCards', 'ATKBonusCreatures', 'ATKBonusLandscapes', 'ATKDEFBonusBuilding',
    'ATKDEFBonusEmptyLanes', 'ATKOnFloop', 'ActionOnFloop', 'CreatureDamageOnEntry', 'DEFBonusBuilding', 'DEFBonusCards',
    'DEFBonusCreaturesBuilding', 'DEFOnFloop', 'DamageHeroOnDeath', 'DamageReduction', 'FloopCostMod', 'HealHeroOnDeath',
    'HealOnVictory', 'HeroDamageOnEntry', 'RarityGate', 'ReturnToHandSacrifice', 'StartTurnHealCreature',
    'StartTurnHealCreatures', 'SwapATKDEFBuilding']) {
    assert.ok(cardsWithScript(s).length > 0, s);
    assert.equal(building(makeGameWith(s), 0, 0).constructor.name, s);
  }
});

function makeGameWith(script) {
  const g = makeGame();
  put(g, 0, 0, card(script));
  return g;
}
