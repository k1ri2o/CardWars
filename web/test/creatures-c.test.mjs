import test from 'node:test';
import { makeGame, put, give, discard, floop, target, act, creature, building, cardsWithScript, assert } from './helpers.mjs';
import '../js/engine/scripts/creatures-c.js';
import { CardForm, CardItem } from '../js/engine/cards.js';
import { CardType } from '../js/engine/consts.js';

/**
 * Summons a scriptless test card (no ability of its own) so the boards stay
 * the same whatever other batches get registered.
 */
function plain(g, player, lane, { type = CardType.Creature, atk = 10, def = 20 } = {}) {
  const form = new CardForm({ id: 'Test_Plain', name: 'Plain', type, atk, def, faction: 'Universal' });
  const item = new CardItem(form, 1);
  g.hands[player].push(item);
  const mp = g.magicPoints[player];
  g.magicPoints[player] = 99;
  g.summon(player, lane, item);
  g.magicPoints[player] = mp;
  g.settle();
  return g.getScript(player, lane, type);
}

function cannotFloop(g, player, lane) {
  assert.equal(g.apply(player, { type: 'floop', lane }).ok, false);
}

function uses(id, script) {
  assert.ok(cardsWithScript(script).includes(id), `${id} should use ${script}`);
  return id;
}

/** p0 lane i faces p1 lane 3 - i. */
const facing = (i) => 3 - i;

// ---------------------------------------------------------------------------

test('HealTargetBuildings heals a chosen creature Val1 per building', () => {
  const g = makeGame();
  const tom = put(g, 0, 0, uses('Creature_FarmerTom', 'HealTargetBuildings'));
  const hurt = plain(g, 0, 1, { def: 30 });
  hurt.damage = 12;
  cannotFloop(g, 0, 0); // no buildings yet
  plain(g, 0, 2, { type: CardType.Building });
  plain(g, 0, 3, { type: CardType.Building });
  floop(g, 0, 0);
  assert.deepEqual(g.pending.lanes, [1]);
  assert.equal(g.pending.side, 0);
  target(g, 0, 1);
  assert.equal(hurt.damage, 12 - tom.data.val1 * 2);
  assert.equal(tom.flooping, false);
});

test('HealTargetCards heals Val1 per card in hand', () => {
  const g = makeGame();
  const bat = put(g, 0, 0, uses('Creature_CottonEyeBat', 'HealTargetCards'));
  const hurt = plain(g, 0, 2);
  hurt.damage = 15;
  cannotFloop(g, 0, 0); // empty hand
  give(g, 0, 'Creature_Cornball');
  give(g, 0, 'Creature_Cornball');
  floop(g, 0, 0);
  target(g, 0, 2);
  assert.equal(hurt.damage, 15 - bat.data.val1 * 2);
});

test('HealTargetFloop needs an earlier floop and heals Val1 per other floop', () => {
  const g = makeGame();
  const fat = put(g, 0, 0, uses('Creature_BL_Fatapillar', 'HealTargetFloop'));
  put(g, 0, 1, 'Creature_BL_TimmyMagicEyes'); // LowerFloopCost: always floopable
  const hurt = plain(g, 0, 2, { def: 30 });
  hurt.damage = 20;
  cannotFloop(g, 0, 0); // nothing flooped yet this turn
  floop(g, 0, 1);
  floop(g, 0, 0);
  target(g, 0, 2);
  assert.equal(hurt.damage, 20 - fat.data.val1 * 1);
});

test('HealTargetLandscapes heals Val1 per different landscape', () => {
  const g = makeGame({ landscapes: [['Corn', 'Plains', 'Swamp', 'Corn'], ['Plains', 'Plains', 'Plains', 'Plains']] });
  const eye = put(g, 0, 0, uses('Creature_SoftEyeling', 'HealTargetLandscapes'));
  cannotFloop(g, 0, 0); // nobody hurt
  const hurt = plain(g, 0, 3);
  hurt.damage = 10;
  floop(g, 0, 0);
  assert.deepEqual(g.pending.lanes, [3]);
  target(g, 0, 3);
  assert.equal(hurt.damage, 10 - eye.data.val1 * 3);
});

test('HelplessOpponent: the attack into the helpless creature hits the hero', () => {
  const g = makeGame();
  const elf = put(g, 0, 0, uses('Creature_ManowarElf', 'HelplessOpponent'));
  cannotFloop(g, 0, 0);
  const enemy = plain(g, 1, facing(0), { atk: 1, def: 20 });
  floop(g, 0, 0);
  assert.equal(enemy.helpless, true);
  const hp = g.health[1];
  act(g, 0, { type: 'endTurn' });
  assert.equal(enemy.damage, 0);
  assert.equal(g.health[1], hp - elf.atk);
});

test('IncreaseCritArea sets the owner crit modifier until the end of their battle', () => {
  const g = makeGame();
  const v = put(g, 0, 0, uses('Creature_VampCorn', 'IncreaseCritArea'));
  floop(g, 0, 0);
  assert.equal(g.getCritAreaModifier(0), v.data.val1 / 100);
  assert.equal(g.getCritAreaModifier(1), 0);
  v.flooped = false;
  assert.equal(v.canFloop(), false); // (int)2.0 != 0
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.getCritAreaModifier(0), 0);
});

test('IncreaseCritArea: (int) of a fractional modifier is 0, so it stays floopable', () => {
  const g = makeGame();
  const v = put(g, 0, 0, 'Creature_VampCorn');
  g.setCritAreaModifier(0, 0.5);
  assert.equal(v.canFloop(), true);
});

test('IncreaseDefenseArea sets the owner defense modifier for the opponent attack', () => {
  const g = makeGame();
  const v = put(g, 0, 0, uses('Creature_VampCactus', 'IncreaseDefenseArea'));
  floop(g, 0, 0);
  assert.equal(g.getDefenseAreaModifier(0), v.data.val1 / 100);
  v.flooped = false;
  assert.equal(v.canFloop(), false);
  act(g, 0, { type: 'endTurn' });
  // Survives the owner's own battle, cleared after the opponent's.
  assert.equal(g.getDefenseAreaModifier(0), v.data.val1 / 100);
  act(g, 1, { type: 'endTurn' });
  assert.equal(g.getDefenseAreaModifier(0), 0);
});

test('IncreaseDefenseCritArea sets the owner defense crit modifier', () => {
  const g = makeGame();
  const v = put(g, 0, 0, uses('Creature_VampMarshmallow', 'IncreaseDefenseCritArea'));
  floop(g, 0, 0);
  assert.equal(g.getDefenseAreaCritModifier(0), v.data.val1 / 100);
  assert.equal(g.getDefenseAreaCritModifier(1), 0);
  v.flooped = false;
  assert.equal(v.canFloop(), false);
});

test("IncreaseFloopCost raises the owner's floop cost mod (as the C# does)", () => {
  const g = makeGame();
  const fig = put(g, 0, 0, uses('Creature_BL_InfiniteFigure', 'IncreaseFloopCost'));
  const other = put(g, 0, 1, 'Creature_Cornball');
  const before = other.determineFloopCost();
  floop(g, 0, 0);
  assert.equal(g.getFloopCostMod(0), fig.data.form.baseVal1);
  assert.equal(other.determineFloopCost(), before + fig.data.form.baseVal1);
  assert.equal(g.getFloopCostMod(1), 0);
});

test('LandscapeATKBonus gains Val1 ATK per unflipped Corn landscape', () => {
  const g = makeGame({ landscapes: [['Corn', 'Corn', 'Plains', 'Corn'], ['Plains', 'Plains', 'Plains', 'Plains']] });
  const dog = put(g, 0, 0, uses('Creature_CornDog', 'LandscapeATKBonus'));
  g.flipLandscape(0, 3, true);
  const base = dog.atk;
  floop(g, 0, 0);
  assert.equal(dog.atk, base + dog.data.val1 * 2);
});

test('LandscapeATKBonus cannot floop without Corn landscapes', () => {
  const g = makeGame({ landscapes: [['Plains', 'Plains', 'Plains', 'Plains'], ['Corn', 'Corn', 'Corn', 'Corn']] });
  put(g, 0, 0, 'Creature_CornDog');
  cannotFloop(g, 0, 0);
});

test('LowerATKAll lowers every opposing creature ATK by Val1', () => {
  const g = makeGame();
  const reaper = put(g, 0, 0, uses('Creature_FieldReaper', 'LowerATKAll'));
  cannotFloop(g, 0, 0);
  const a = plain(g, 1, 0, { atk: 10 });
  const b = plain(g, 1, 2, { atk: 2 });
  const mine = plain(g, 0, 1, { atk: 10 });
  floop(g, 0, 0);
  assert.equal(a.atk, 10 - reaper.data.val1);
  assert.equal(b.atk, 0);
  assert.equal(mine.atk, 10);
});

test('LowerATKBonusATK lowers the opposing ATK by Val1 and raises its own by Val2', () => {
  const g = makeGame();
  const gnome = put(g, 0, 1, uses('Creature_BL_PointyYellowGnome', 'LowerATKBonusATK'));
  cannotFloop(g, 0, 1);
  const enemy = plain(g, 1, facing(1), { atk: 10 });
  const own = gnome.atk;
  floop(g, 0, 1);
  assert.equal(enemy.atk, 10 - gnome.data.val1);
  assert.equal(gnome.atk, own + gnome.data.val2);
});

test("LowerATKByATK lowers the opposing ATK by this creature's ATK", () => {
  const g = makeGame();
  const bat = put(g, 0, 2, uses('Creature_CornEyeBat', 'LowerATKByATK'));
  cannotFloop(g, 0, 2);
  const enemy = plain(g, 1, facing(2), { atk: 10 });
  floop(g, 0, 2);
  assert.equal(enemy.atk, 10 - bat.atk);
});

test('LowerATKOpponent lowers the opposing ATK by Val1', () => {
  const g = makeGame();
  const worm = put(g, 0, 3, uses('Creature_CornWorm', 'LowerATKOpponent'));
  cannotFloop(g, 0, 3);
  const enemy = plain(g, 1, facing(3), { atk: 10 });
  floop(g, 0, 3);
  assert.equal(enemy.atk, 10 - worm.data.val1);
});

test("LowerATKOpponentCards lowers the opposing ATK by Val1 per card in the opponent's hand", () => {
  const g = makeGame();
  const taco = put(g, 0, 0, uses('Creature_CaptainTaco', 'LowerATKOpponentCards'));
  const enemy = plain(g, 1, facing(0), { atk: 10 });
  give(g, 1, 'Creature_Cornball');
  give(g, 1, 'Creature_Cornball');
  give(g, 1, 'Creature_Cornball');
  give(g, 0, 'Creature_Cornball');
  floop(g, 0, 0);
  assert.equal(enemy.atk, 10 - taco.data.val1 * 3);
});

test('LowerATKTarget lowers a chosen opposing creature ATK by Val1', () => {
  const g = makeGame();
  const dan = put(g, 0, 0, uses('Creature_ArcherDan', 'LowerATKTarget'));
  cannotFloop(g, 0, 0);
  plain(g, 1, 1, { atk: 10 });
  const b = plain(g, 1, 2, { atk: 10 });
  floop(g, 0, 0);
  assert.equal(g.pending.side, 1);
  assert.deepEqual(g.pending.lanes, [1, 2]);
  target(g, 0, 2);
  assert.equal(b.atk, 10 - dan.data.val1);
  assert.equal(creature(g, 1, 1).atk, 10);
});

test('LowerAllATKSacrifice lowers all opposing ATK by Val1 and destroys itself', () => {
  const g = makeGame();
  const gooey = put(g, 0, 1, uses('Creature_GL_BrainGooey', 'LowerAllATKSacrifice'));
  cannotFloop(g, 0, 1);
  const a = plain(g, 1, 0, { atk: 20 });
  const b = plain(g, 1, 3, { atk: 15 });
  floop(g, 0, 1);
  assert.equal(a.atk, 20 - gooey.data.val1);
  assert.equal(b.atk, 15 - gooey.data.val1);
  assert.equal(g.laneHasCreature(0, 1), false);
  assert.equal(g.getDiscardPile(0)[0], gooey.data);
});

test('LowerDEFAll lowers every opposing creature DEF by Val1 (and kills at 0)', () => {
  const g = makeGame();
  const pickler = put(g, 0, 0, uses('Creature_Pickler', 'LowerDEFAll'));
  cannotFloop(g, 0, 0);
  const a = plain(g, 1, 0, { def: 20 });
  const weak = plain(g, 1, 1, { def: pickler.data.val1 });
  floop(g, 0, 0);
  assert.equal(a.def, 20 - pickler.data.val1);
  assert.equal(g.laneHasCreature(1, 1), false);
  assert.equal(g.getDiscardPile(1)[0], weak.data);
});

test("LowerDEFByATK lowers the opposing DEF by this creature's ATK", () => {
  const g = makeGame();
  const jackal = put(g, 0, 0, uses('Creature_SandJackal', 'LowerDEFByATK'));
  cannotFloop(g, 0, 0);
  const enemy = plain(g, 1, facing(0), { def: 30 });
  floop(g, 0, 0);
  assert.equal(enemy.def, 30 - jackal.atk);
});

test('LowerDEFFloop lowers a chosen enemy DEF by Val1 per other floop this turn', () => {
  const g = makeGame();
  const rex = put(g, 0, 0, uses('Creature_BL_SandasaurusRex', 'LowerDEFFloop'));
  put(g, 0, 1, 'Creature_BL_TimmyMagicEyes');
  put(g, 0, 2, 'Creature_BL_InfiniteFigure');
  const enemy = plain(g, 1, 2, { def: 40 });
  cannotFloop(g, 0, 0); // no floop yet
  floop(g, 0, 1);
  floop(g, 0, 2);
  floop(g, 0, 0);
  assert.equal(g.pending.side, 1);
  target(g, 0, 2);
  assert.equal(enemy.def, 40 - rex.data.val1 * 2);
});

test('LowerDEFOpponent lowers the opposing DEF by Val1', () => {
  const g = makeGame();
  const snake = put(g, 0, 1, uses('Creature_SandSnake', 'LowerDEFOpponent'));
  cannotFloop(g, 0, 1);
  const enemy = plain(g, 1, facing(1), { def: 20 });
  floop(g, 0, 1);
  assert.equal(enemy.def, 20 - snake.data.val1);
});

test('LowerDEFTarget lowers a chosen opposing creature DEF by Val1', () => {
  const g = makeGame();
  const angel = put(g, 0, 0, uses('Creature_MudAngel', 'LowerDEFTarget'));
  cannotFloop(g, 0, 0);
  const enemy = plain(g, 1, 3, { def: 20 });
  floop(g, 0, 0);
  assert.deepEqual(g.pending.lanes, [3]);
  target(g, 0, 3);
  assert.equal(enemy.def, 20 - angel.data.val1);
});

test('LowerFloopCost lowers the owner floop costs by BaseVal1 this turn', () => {
  const g = makeGame();
  const timmy = put(g, 0, 0, uses('Creature_BL_TimmyMagicEyes', 'LowerFloopCost'));
  const other = put(g, 0, 1, 'Creature_Cornball');
  const before = other.determineFloopCost();
  floop(g, 0, 0);
  assert.equal(g.getFloopCostMod(0), -timmy.data.form.baseVal1);
  assert.equal(other.determineFloopCost(), before - timmy.data.form.baseVal1);
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.getFloopCostMod(0), 0);
});

test("LowerMP lowers the opponent's magic by BaseVal1 for their next turn", () => {
  const g = makeGame();
  const cam = put(g, 0, 0, uses('Creature_BL_CameraDude', 'LowerMP'));
  const mp1 = g.getMagicPoints(1);
  const mp0 = g.getMagicPoints(0);
  floop(g, 0, 0);
  assert.equal(g.getMagicPoints(1), mp1 - cam.data.form.baseVal1);
  assert.equal(g.getMagicPoints(0), mp0 - cam.determineFloopCost());
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.activePlayer, 1);
  assert.equal(g.getMagicPoints(1), mp1 - cam.data.form.baseVal1);
});

test('Protection: the opposing creature cannot attack in its next battle', () => {
  const g = makeGame();
  const ghost = put(g, 0, 0, uses('Creature_Ghost', 'Protection'));
  cannotFloop(g, 0, 0);
  const enemy = plain(g, 1, facing(0), { atk: 5, def: 40 });
  floop(g, 0, 0);
  assert.equal(enemy.cantAttack, true);
  ghost.flooped = false;
  assert.equal(ghost.canFloop(), false);
  ghost.flooped = true;
  act(g, 0, { type: 'endTurn' });
  act(g, 1, { type: 'endTurn' });
  assert.equal(ghost.damage, 0);
  assert.equal(enemy.cantAttack, false);
});

test('RaiseDEFFloop raises a chosen friendly DEF by Val1 per other floop this turn', () => {
  const g = makeGame();
  const ogre = put(g, 0, 0, uses('Creature_BL_GreenPartyOgre', 'RaiseDEFFloop'));
  put(g, 0, 1, 'Creature_BL_TimmyMagicEyes');
  const friend = plain(g, 0, 3, { def: 10 });
  cannotFloop(g, 0, 0);
  floop(g, 0, 1);
  floop(g, 0, 0);
  assert.equal(g.pending.side, 0);
  assert.deepEqual(g.pending.lanes, [0, 1, 3]);
  target(g, 0, 3);
  assert.equal(friend.def, 10 + ogre.data.val1 * 1);
});

test('RandomDiscardCard moves a random discard pile card to hand', () => {
  const g = makeGame();
  put(g, 0, 0, uses('Creature_GL_FisherFish', 'RandomDiscardCard'));
  cannotFloop(g, 0, 0); // empty pile
  const a = discard(g, 0, 'Creature_Cornball');
  const b = discard(g, 0, 'Creature_CornDog');
  floop(g, 0, 0);
  const hand = g.getHand(0);
  assert.equal(hand.length, 1);
  assert.ok(hand[0] === a || hand[0] === b);
  assert.equal(g.getDiscardPile(0).length, 1);
  assert.ok(!g.getDiscardPile(0).includes(hand[0]));
});

test('RandomDiscardCard cannot floop with a full hand', () => {
  const g = makeGame();
  put(g, 0, 0, 'Creature_GL_FisherFish');
  discard(g, 0, 'Creature_Cornball');
  for (let i = 0; i < 7; i++) give(g, 0, 'Creature_Cornball');
  cannotFloop(g, 0, 0);
});

test('ResetSelf clears damage and ATK/DEF modifiers on itself', () => {
  const g = makeGame();
  const cow = put(g, 0, 0, uses('Creature_CowGhost', 'ResetSelf'));
  cannotFloop(g, 0, 0);
  cow.damage = 5;
  cow.atkMod = -3;
  cow.defMod = 4;
  floop(g, 0, 0);
  assert.equal(cow.damage, 0);
  assert.equal(cow.atkMod, 0);
  assert.equal(cow.defMod, 0);
  assert.equal(cow.atk, cow.data.atk);
});

test('ResetTarget clears damage and modifiers on a chosen friendly creature', () => {
  const g = makeGame();
  put(g, 0, 0, uses('Creature_GhostHag', 'ResetTarget'));
  const friend = plain(g, 0, 2);
  plain(g, 0, 3);
  cannotFloop(g, 0, 0);
  friend.damage = 4;
  friend.atkMod = 2;
  friend.defMod = -5;
  floop(g, 0, 0);
  assert.deepEqual(g.pending.lanes, [2]);
  target(g, 0, 2);
  assert.equal(friend.damage, 0);
  assert.equal(friend.atkMod, 0);
  assert.equal(friend.defMod, 0);
});

test('ReturnDiscardCard returns a chosen card of type BaseVal1 to hand', () => {
  const g = makeGame();
  const scholar = put(g, 0, 0, uses('Creature_AncientScholar', 'ReturnDiscardCard'));
  assert.equal(scholar.data.form.baseVal1, CardType.Creature);
  const spell = discard(g, 0, 'Spell_BubblegumButt');
  cannotFloop(g, 0, 0); // no creature in the pile
  const c = discard(g, 0, 'Creature_Cornball');
  floop(g, 0, 0);
  assert.equal(g.pending.kind, 'discard');
  assert.deepEqual(g.pending.cards, [c.uid]);
  act(g, 0, { type: 'discard', uid: c.uid });
  assert.deepEqual(g.getHand(0), [c]);
  assert.deepEqual(g.getDiscardPile(0), [spell]);
  assert.equal(scholar.cardSelected, true);
  assert.equal(scholar.flooping, false);
});

test('ReturnDiscardCard with BaseVal1 = building', () => {
  const g = makeGame();
  const claw = put(g, 0, 0, uses('Creature_DragonClaw', 'ReturnDiscardCard'));
  assert.equal(claw.data.form.baseVal1, CardType.Building);
  discard(g, 0, 'Creature_Cornball');
  const b = discard(g, 0, 'Building_BlueCastle');
  floop(g, 0, 0);
  assert.deepEqual(g.pending.cards, [b.uid]);
  act(g, 0, { type: 'discard', uid: b.uid });
  assert.deepEqual(g.getHand(0), [b]);
});

test('ReturnHandsDrawCardsAddMP: hand into deck, draw BaseVal1, BaseVal2 magic next turn', () => {
  const g = makeGame();
  const rose = put(g, 0, 0, uses('Creature_BadRose', 'ReturnHandsDrawCardsAddMP'));
  const { baseVal1, baseVal2 } = rose.data.form;
  give(g, 0, 'Creature_CornDog');
  give(g, 0, 'Creature_CornDog');
  give(g, 0, 'Creature_CornDog');
  const deck = g.getDeck(0).cardCount();
  floop(g, 0, 0);
  assert.equal(g.getHand(0).length, baseVal1);
  assert.equal(g.getDeck(0).cardCount(), deck + 3 - baseVal1);
  assert.equal(g.extraMagicPoints[0], baseVal2);
  rose.flooped = false;
  assert.equal(rose.canFloop(), false);
  rose.flooped = true;
  act(g, 0, { type: 'endTurn' });
  assert.equal(g.extraMagicPoints[0], baseVal2); // the opponent's turn start does nothing
  act(g, 1, { type: 'endTurn' });
  assert.equal(g.activePlayer, 0);
  assert.equal(g.getMagicPoints(0), g.currentMagicPoints + baseVal2);
  assert.equal(g.extraMagicPoints[0], 0);
});

test('ReturnOppnentToHand sends the opposing building back to hand', () => {
  const g = makeGame();
  const axey = put(g, 0, 1, uses('Creature_Axey', 'ReturnOppnentToHand'));
  assert.equal(axey.data.form.baseVal1, CardType.Building);
  plain(g, 1, facing(1), { atk: 5 }); // a creature alone is not enough
  cannotFloop(g, 0, 1);
  const b = plain(g, 1, facing(1), { type: CardType.Building });
  floop(g, 0, 1);
  assert.equal(g.laneHasBuilding(1, facing(1)), false);
  assert.equal(g.laneHasCreature(1, facing(1)), true);
  assert.deepEqual(g.getHand(1), [b.data]);
});

test('ReturnOppnentToHand discards the creature when the opponent hand is full', () => {
  const g = makeGame();
  put(g, 0, 0, uses('Creature_StruzanJinn', 'ReturnOppnentToHand'));
  const enemy = plain(g, 1, facing(0));
  for (let i = 0; i < 7; i++) give(g, 1, 'Creature_Cornball');
  floop(g, 0, 0);
  assert.equal(g.laneHasCreature(1, facing(0)), false);
  assert.equal(g.getHand(1).length, 7);
  assert.equal(g.getDiscardPile(1)[0], enemy.data);
});

test('ReturnTargetToHand sends a chosen opposing building back to hand', () => {
  const g = makeGame();
  const elf = put(g, 0, 0, uses('Creature_ElfMarauder', 'ReturnTargetToHand'));
  assert.equal(elf.data.form.baseVal1, CardType.Building);
  plain(g, 1, 0); // creature only
  cannotFloop(g, 0, 0);
  plain(g, 1, 1, { type: CardType.Building });
  const b = plain(g, 1, 2, { type: CardType.Building });
  floop(g, 0, 0);
  assert.equal(g.pending.side, 1);
  assert.equal(g.pending.selectionType, 'Building');
  assert.deepEqual(g.pending.lanes, [1, 2]);
  target(g, 0, 2);
  assert.equal(g.laneHasBuilding(1, 2), false);
  assert.ok(building(g, 1, 1));
  assert.deepEqual(g.getHand(1), [b.data]);
});

test('SacrificeForMP destroys itself and gains BaseVal1 magic', () => {
  const g = makeGame();
  const dan = put(g, 0, 2, uses('Creature_DiamondDan', 'SacrificeForMP'));
  const mp = g.getMagicPoints(0);
  const cost = dan.determineFloopCost();
  floop(g, 0, 2);
  assert.equal(g.getMagicPoints(0), mp - cost + dan.data.form.baseVal1);
  assert.equal(g.laneHasCreature(0, 2), false);
  assert.equal(g.getDiscardPile(0)[0], dan.data);
});

test('SelfAndAdjacentATKBonus gives itself and adjacent creatures +Val1 ATK', () => {
  const g = makeGame();
  const taur = put(g, 0, 1, uses('Creature_Cornataur', 'SelfAndAdjacentATKBonus'));
  const left = plain(g, 0, 0, { atk: 3 });
  const right = plain(g, 0, 2, { atk: 3 });
  const far = plain(g, 0, 3, { atk: 3 });
  const own = taur.atk;
  floop(g, 0, 1);
  assert.equal(taur.atk, own + taur.data.val1);
  assert.equal(left.atk, 3 + taur.data.val1);
  assert.equal(right.atk, 3 + taur.data.val1);
  assert.equal(far.atk, 3);
});

test('SelfAndAdjacentDEFBonus gives itself and adjacent creatures +Val1 DEF (edge lane)', () => {
  const g = makeGame();
  const fummy = put(g, 0, 0, uses('Creature_Fummy', 'SelfAndAdjacentDEFBonus'));
  const next = plain(g, 0, 1, { def: 7 });
  const far = plain(g, 0, 2, { def: 7 });
  const own = fummy.def;
  floop(g, 0, 0);
  assert.equal(fummy.def, own + fummy.data.val1);
  assert.equal(next.def, 7 + fummy.data.val1);
  assert.equal(far.def, 7);
});

test('ShuffleHand shuffles the hand into the deck and draws 5', () => {
  const g = makeGame();
  put(g, 0, 0, uses('Creature_HW_DjiniGhost', 'ShuffleHand'));
  const a = give(g, 0, 'Creature_CornDog');
  const b = give(g, 0, 'Creature_CornDog');
  const deck = g.getDeck(0).cardCount();
  floop(g, 0, 0);
  assert.equal(g.getHand(0).length, 5);
  assert.equal(g.getDeck(0).cardCount(), deck + 2 - 5);
  const all = [...g.getHand(0), ...g.getDeck(0).getCards()];
  assert.ok(all.includes(a) && all.includes(b));
});
