// Creature floop abilities, batch C (targeted heals, ATK/DEF penalties, spinner
// area boosts, floop cost and magic tweaks, resets, returning cards to hand,
// hand shuffles). Ported from Assets/Scripts/Assembly-CSharp.
import { CreatureScript, toInt } from './base.js';
import { CardType, LANDSCAPES, other } from '../consts.js';
import { registerScripts } from '../registry.js';

/** (LandscapeType)n: the LandscapeType enum is the five landscapes then None. */
const LANDSCAPE_TYPES = [...LANDSCAPES, 'None'];
/** (SelectionType)n. */
const SELECTION_TYPES = ['Creature', 'Building', 'Landscape'];
const TYPE_NAMES = ['creature', 'building', 'spell'];

/** True when any of `player`'s creatures has taken damage. */
function hasDamagedCreature(game, player) {
  for (const lane of game.getLanes(player)) {
    if (lane.hasCreature() && lane.getCreature().damage > 0) return true;
  }
  return false;
}

function isDamagedCreatureLane(candidate) {
  return candidate.hasCreature() && candidate.getCreature().damage > 0;
}

/** True when the creature has damage or any ATK/DEF modifier. */
function hasMods(creature) {
  return creature.damage > 0 || creature.atkMod !== 0 || creature.defMod !== 0;
}

/** Hand goes back into the deck, the deck is shuffled, then `count` draws. */
function shuffleHandIntoDeck(game, player, count) {
  const hand = game.getHand(player);
  const deck = game.getDeck(player);
  while (hand.length > 0) {
    const newCard = hand[0];
    deck.addCard(newCard);
    hand.splice(0, 1);
  }
  deck.shuffle(game.rng);
  for (let i = 0; i < count; i++) game.drawCard(player);
}

export class HealTargetBuildings extends CreatureScript {
  canFloop() {
    if (this.game.buildingCount(this.owner) === 0) return false;
    return hasDamagedCreature(this.game, this.owner);
  }

  selectionFilter(candidate) {
    return isDamagedCreatureLane(candidate);
  }

  doHealing(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  doResult(target) {
    const num = this.game.buildingCount(this.owner);
    target.heal(this.data.val1 * num);
    return true;
  }

  onTargetSelected(target) {
    this.doHealing(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick one of your creatures to heal');
  }
}

export class HealTargetCards extends CreatureScript {
  canFloop() {
    if (this.game.getCardsInHand(this.owner) === 0) return false;
    return hasDamagedCreature(this.game, this.owner);
  }

  selectionFilter(candidate) {
    return isDamagedCreatureLane(candidate);
  }

  doHealing(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  doResult(target) {
    const cardsInHand = this.game.getCardsInHand(this.owner);
    target.heal(this.data.val1 * cardsInHand);
    return true;
  }

  onTargetSelected(target) {
    this.doHealing(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick one of your creatures to heal');
  }
}

/** Heals by Val1 for every other creature flooped this turn (this floop is already counted). */
export class HealTargetFloop extends CreatureScript {
  canFloop() {
    const floopCountTurn = this.game.getFloopCountTurn(this.owner);
    if (floopCountTurn <= 0) return false;
    return hasDamagedCreature(this.game, this.owner);
  }

  selectionFilter(candidate) {
    return isDamagedCreatureLane(candidate);
  }

  doHealing(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  doResult(target) {
    const num = this.game.getFloopCountTurn(this.owner) - 1;
    target.heal(this.data.val1 * num);
    return true;
  }

  onTargetSelected(target) {
    this.doHealing(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick one of your creatures to heal');
  }
}

export class HealTargetLandscapes extends CreatureScript {
  canFloop() {
    return hasDamagedCreature(this.game, this.owner);
  }

  selectionFilter(candidate) {
    return isDamagedCreatureLane(candidate);
  }

  doHealing(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  doResult(target) {
    const num = this.game.landscapeTypeCount(this.owner);
    target.heal(this.data.val1 * num);
    return true;
  }

  onTargetSelected(target) {
    this.doHealing(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick one of your creatures to heal');
  }
}

/** The opposing creature is Helpless: attacks into its lane hit the hero instead. */
export class HelplessOpponent extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.helpless = true;
    return true;
  }
}

export class IncreaseCritArea extends CreatureScript {
  canFloop() {
    return toInt(this.game.getCritAreaModifier(this.owner)) === 0;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(_target) {
    this.game.setCritAreaModifier(this.owner, this.data.val1 / 100);
    return true;
  }
}

export class IncreaseDefenseArea extends CreatureScript {
  canFloop() {
    return toInt(this.game.getDefenseAreaModifier(this.owner)) === 0;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(_target) {
    this.game.setDefenseAreaModifier(this.owner, this.data.val1 / 100);
    return true;
  }
}

export class IncreaseDefenseCritArea extends CreatureScript {
  canFloop() {
    return toInt(this.game.getDefenseAreaCritModifier(this.owner)) === 0;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(_target) {
    this.game.setDefenseAreaCritModifier(this.owner, this.data.val1 / 100);
    return true;
  }
}

export class IncreaseFloopCost extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(_target) {
    // The card text says "enemy's", but the C# raises the owner's own floop costs.
    this.game.addFloopCostMod(this.owner, this.data.form.baseVal1);
    return true;
  }
}

export class LandscapeATKBonus extends CreatureScript {
  canFloop() {
    const num = this.game.landscapeCount(this.owner, LANDSCAPE_TYPES[this.data.form.baseVal2]);
    return num > 0;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    const num = this.game.landscapeCount(this.owner, LANDSCAPE_TYPES[this.data.form.baseVal2]);
    target.atkMod += num * this.data.val1;
    return true;
  }
}

export class LowerATKAll extends CreatureScript {
  canFloop() {
    return this.game.hasCreaturesInPlay(other(this.owner));
  }

  floop() {
    for (const lane of this.game.getLanes(other(this.owner))) {
      if (lane.hasCreature()) this.targetList.push(lane.getCreature());
    }
    this.doEffect();
  }

  doResult(target) {
    target.atkMod -= this.data.val1;
    return true;
  }
}

export class LowerATKBonusATK extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    if (target === this) target.atkMod += this.data.val2;
    else target.atkMod -= this.data.val1;
    return true;
  }
}

export class LowerATKByATK extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.atkMod -= this.atk;
    return true;
  }
}

export class LowerATKOpponent extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.atkMod -= this.data.val1;
    return true;
  }
}

export class LowerATKOpponentCards extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    const cardsInHand = this.game.getCardsInHand(other(this.owner));
    target.atkMod -= this.data.val1 * cardsInHand;
    return true;
  }
}

export class LowerATKTarget extends CreatureScript {
  canFloop() {
    for (const lane of this.game.getLanes(other(this.owner))) {
      if (lane.hasCreature()) return true;
    }
    return false;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature();
  }

  doDamage(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.atkMod -= this.data.val1;
    return true;
  }

  onTargetSelected(target) {
    this.doDamage(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(other(this.owner), 'Creature', "Pick one of your opponent's creatures to lower its Attack");
  }
}

export class LowerAllATKSacrifice extends CreatureScript {
  canFloop() {
    return this.game.hasCreaturesInPlay(other(this.owner));
  }

  floop() {
    for (const lane of this.game.getLanes(other(this.owner))) {
      if (lane.hasCreature()) this.targetList.push(lane.getCreature());
    }
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    if (target === this) {
      this.game.removeCardFromPlay(target.owner, target.currentLane.index, CardType.Creature);
      this.game.discardCard(target.owner, target.data);
    } else {
      target.atkMod -= this.data.val1;
    }
    return true;
  }
}

export class LowerDEFAll extends CreatureScript {
  canFloop() {
    return this.game.hasCreaturesInPlay(other(this.owner));
  }

  floop() {
    for (const lane of this.game.getLanes(other(this.owner))) {
      if (lane.hasCreature()) this.targetList.push(lane.getCreature());
    }
    this.doEffect();
  }

  doResult(target) {
    target.defMod -= this.data.val1;
    return true;
  }
}

export class LowerDEFByATK extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.defMod -= this.atk;
    return true;
  }
}

/** Lowers DEF by Val1 for every other creature flooped this turn (this floop is already counted). */
export class LowerDEFFloop extends CreatureScript {
  canFloop() {
    const floopCountTurn = this.game.getFloopCountTurn(this.owner);
    return this.game.hasCreaturesInPlay(other(this.owner)) && floopCountTurn > 0;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature();
  }

  doDamage(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  doResult(target) {
    const num = this.game.getFloopCountTurn(this.owner) - 1;
    target.defMod -= this.data.val1 * num;
    return true;
  }

  onTargetSelected(target) {
    this.doDamage(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(other(this.owner), 'Creature', "Pick one of your opponent's creatures to lower its Defense");
  }
}

export class LowerDEFOpponent extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.defMod -= this.data.val1;
    return true;
  }
}

export class LowerDEFTarget extends CreatureScript {
  canFloop() {
    for (const lane of this.game.getLanes(other(this.owner))) {
      if (lane.hasCreature()) return true;
    }
    return false;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature();
  }

  doDamage(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.defMod -= this.data.val1;
    return true;
  }

  onTargetSelected(target) {
    this.doDamage(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(other(this.owner), 'Creature', "Pick one of your opponent's creatures to lower its Defense");
  }
}

export class LowerFloopCost extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(_target) {
    this.game.addFloopCostMod(this.owner, -this.data.form.baseVal1);
    return true;
  }
}

export class LowerMP extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(_target) {
    this.game.addMagicPoints(other(this.owner), -this.data.form.baseVal1);
    return true;
  }
}

/** The opposing creature can't attack in its next battle. */
export class Protection extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature() && !this.enemy.cantAttack;
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.cantAttack = true;
    return true;
  }
}

/** Raises DEF by Val1 for every other creature flooped this turn (this floop is already counted). */
export class RaiseDEFFloop extends CreatureScript {
  canFloop() {
    const floopCountTurn = this.game.getFloopCountTurn(this.owner);
    return this.game.hasCreaturesInPlay(this.owner) && floopCountTurn > 0;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature();
  }

  doDamage(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  doResult(target) {
    const num = this.game.getFloopCountTurn(this.owner) - 1;
    target.defMod += this.data.val1 * num;
    return true;
  }

  onTargetSelected(target) {
    this.doDamage(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick one of your creatures to raise its Defense');
  }
}

export class RandomDiscardCard extends CreatureScript {
  canFloop() {
    if (this.game.getCardsInHand(this.owner) >= 7) return false;
    return this.game.getDiscardPile(this.owner).length > 0;
  }

  takeCard(item) {
    this.game.removeCardFromDiscardPile(this.owner, item);
    this.game.placeCardInHand(this.owner, item);
    this.doEffect();
  }

  floop() {
    const discardPile = this.game.getDiscardPile(this.owner);
    const index = this.game.rng.range(0, discardPile.length);
    this.takeCard(discardPile[index]);
  }
}

export class ResetSelf extends CreatureScript {
  canFloop() {
    return hasMods(this);
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    target.heal(target.damage);
    target.atkMod = 0;
    target.defMod = 0;
    return true;
  }
}

export class ResetTarget extends CreatureScript {
  canFloop() {
    for (const lane of this.game.getLanes(this.owner)) {
      if (lane.hasCreature() && hasMods(lane.getCreature())) return true;
    }
    return false;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature() && hasMods(candidate.getCreature());
  }

  doDamage(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.heal(target.damage);
    target.atkMod = 0;
    target.defMod = 0;
    return true;
  }

  onTargetSelected(target) {
    this.doDamage(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick one of your creatures to reset');
  }
}

/** Return a card of type BaseVal1 (0 creature, 1 building, 2 spell) from the discard pile to hand. */
export class ReturnDiscardCard extends CreatureScript {
  canFloop() {
    if (this.game.getCardsInHand(this.owner) >= 7) return false;
    for (const item of this.game.getDiscardPile(this.owner)) {
      if (item.form.type === this.data.form.baseVal1) return true;
    }
    return false;
  }

  takeCard(item) {
    this.game.removeCardFromDiscardPile(this.owner, item);
    this.game.placeCardInHand(this.owner, item);
    this.doEffect();
  }

  cardFilter(item) {
    return item.form.type === this.data.form.baseVal1;
  }

  cardSelection(item) {
    this.takeCard(item);
    this.closeDiscardPile();
  }

  floop() {
    const kind = TYPE_NAMES[this.data.form.baseVal1] || 'card';
    this.openDiscardPile(`Pick a ${kind} from your discard pile to return to your hand`);
  }
}

/** Hand back into the deck, draw BaseVal1, and BaseVal2 extra magic at the owner's next turn start. */
export class ReturnHandsDrawCardsAddMP extends CreatureScript {
  startTurn() {
    if (this.game.extraMagicPoints[this.owner] > 0) {
      this.game.addMagicPoints(this.owner, this.game.extraMagicPoints[this.owner]);
      this.game.resetExtraMagicPoints(this.owner);
    }
  }

  canFloop() {
    return this.game.extraMagicPoints[this.owner] === 0;
  }

  floop() {
    this.game.extraMagicPoints[this.owner] = this.data.form.baseVal2;
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(_target) {
    shuffleHandIntoDeck(this.game, this.owner, this.data.form.baseVal1);
    return true;
  }
}

/** Sends the opposing card of type BaseVal1 (creature or building) back to its owner's hand. */
export class ReturnOppnentToHand extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCard(this.data.form.baseVal1);
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getScript(this.data.form.baseVal1));
    this.doEffect();
  }

  doResult(target) {
    this.game.removeCardFromPlay(target.owner, target.currentLane.index, target.data.form.type);
    if (this.game.getCardsInHand(target.owner) < 7) this.game.placeCardInHand(target.owner, target.data);
    else this.game.discardCard(target.owner, target.data);
    return true;
  }
}

/** Pick an opposing card of type BaseVal1 and send it back to its owner's hand. */
export class ReturnTargetToHand extends CreatureScript {
  canFloop() {
    return this.game.hasCardTypeInPlay(other(this.owner), this.data.form.baseVal1);
  }

  selectionFilter(candidate) {
    return candidate.hasCard(this.data.form.baseVal1);
  }

  returnToHand(target) {
    this.targetList.push(target.getScript(this.data.form.baseVal1));
    this.doEffect();
  }

  onTargetSelected(target) {
    this.returnToHand(target);
    this.endTargetSelection();
  }

  floop() {
    const selectionType = SELECTION_TYPES[this.data.form.baseVal1];
    const kind = selectionType === 'Building' ? 'buildings' : 'creatures';
    this.startTargetSelection(other(this.owner), selectionType, `Pick one of your opponent's ${kind} to return to their hand`);
  }

  doResult(target) {
    this.game.removeCardFromPlay(target.owner, target.currentLane.index, target.data.form.type);
    if (this.game.getCardsInHand(target.owner) < 7) this.game.placeCardInHand(target.owner, target.data);
    else this.game.discardCard(target.owner, target.data);
    return true;
  }
}

export class SacrificeForMP extends CreatureScript {
  canFloop() {
    // The C# Opponent-only branch (an AI check that the gained magic leaves a
    // legal move) is dropped; for a human owner CanFloop is always true.
    return true;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    this.game.addMagicPoints(this.owner, this.data.form.baseVal1);
    this.game.removeCardFromPlay(target.owner, target.currentLane.index, CardType.Creature);
    this.game.discardCard(target.owner, target.data);
    return true;
  }
}

export class SelfAndAdjacentATKBonus extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    this.targetList.push(this);
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) this.targetList.push(lane.getCreature());
    }
    this.doEffect();
  }

  doResult(target) {
    target.atkMod += this.data.val1;
    return true;
  }
}

export class SelfAndAdjacentDEFBonus extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    this.targetList.push(this);
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) this.targetList.push(lane.getCreature());
    }
    this.doEffect();
  }

  doResult(target) {
    target.defMod += this.data.val1;
    return true;
  }
}

export class ShuffleHand extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    this.doEffectPlayer(this.owner);
  }

  doResult(_target) {
    shuffleHandIntoDeck(this.game, this.owner, 5);
    return true;
  }
}

registerScripts({
  HealTargetBuildings,
  HealTargetCards,
  HealTargetFloop,
  HealTargetLandscapes,
  HelplessOpponent,
  IncreaseCritArea,
  IncreaseDefenseArea,
  IncreaseDefenseCritArea,
  IncreaseFloopCost,
  LandscapeATKBonus,
  LowerATKAll,
  LowerATKBonusATK,
  LowerATKByATK,
  LowerATKOpponent,
  LowerATKOpponentCards,
  LowerATKTarget,
  LowerAllATKSacrifice,
  LowerDEFAll,
  LowerDEFByATK,
  LowerDEFFloop,
  LowerDEFOpponent,
  LowerDEFTarget,
  LowerFloopCost,
  LowerMP,
  Protection,
  RaiseDEFFloop,
  RandomDiscardCard,
  ResetSelf,
  ResetTarget,
  ReturnDiscardCard,
  ReturnHandsDrawCardsAddMP,
  ReturnOppnentToHand,
  ReturnTargetToHand,
  SacrificeForMP,
  SelfAndAdjacentATKBonus,
  SelfAndAdjacentDEFBonus,
  ShuffleHand,
});
