// Spells cast from hand, batch B: DoubleDamage ... BlockCardSpell.
import { registerScripts } from '../registry.js';
import { CardScript, SpellScript } from './base.js';
import { CardType, MAX_HAND, other } from '../consts.js';

class DoubleDamage extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      for (const item of game.getLanes(other(player))) {
        if (item.hasCreature() && item.getCreature().damage > 0) return true;
      }
      return false;
    }
    return flag;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature() && candidate.getCreature().damage > 0;
  }

  returnTarget(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  onTargetSelected(target) {
    this.returnTarget(target);
    this.endTargetSelection();
  }

  cast() {
    this.startTargetSelection(other(this.owner), 'Creature', 'Pick a damaged creature to double its damage');
  }

  doResult(target) {
    target.takeDamage(this, target.damage);
    return true;
  }
}

class DrainOpponentHealth extends SpellScript {
  doResult(_target) {
    this.game.dealDamage(this.owner, -this.data.val1);
    this.game.dealDamage(other(this.owner), this.data.val1);
    return true;
  }
}

class DrawCardsSpell extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) return game.getDeck(player).cardCount() > 0 && game.getCardsInHand(player) < MAX_HAND;
    return flag;
  }

  doResult(_target) {
    for (let i = 0; i < this.data.form.baseVal1; i++) this.game.drawCard(this.owner);
    return true;
  }
}

class EmptyLaneCards extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      return game.getCardsInHand(player) < MAX_HAND && game.getDeck(player).cardCount() > 0
        && game.emptyLaneCount(player) > 0;
    }
    return flag;
  }

  doResult(_target) {
    const num = this.game.emptyLaneCount(this.owner);
    for (let i = 0; i < num; i++) this.game.drawCard(this.owner);
    return true;
  }
}

class FlatFloopCost extends SpellScript {
  // The original also ran an AI-only HasLegalMove check here (for the
  // Opponent seat, guarded by a static Locked flag); dropped with the AI.
  static canPlay(game, player, lane, card) {
    return CardScript.canPlay(game, player, lane, card);
  }

  doResult(_target) {
    this.game.setFlatFloopCost(this.owner, this.data.form.baseVal1);
    return true;
  }
}

class HealCreature extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      for (const item of game.getLanes(player)) {
        if (item.hasCreature() && item.getCreature().damage > 0) return true;
      }
      return false;
    }
    return flag;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature() && candidate.getCreature().damage > 0;
  }

  healTarget(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  onTargetSelected(target) {
    this.healTarget(target);
    this.endTargetSelection();
  }

  cast() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick a damaged creature to heal');
  }

  doResult(target) {
    target.heal(target.damage);
    return true;
  }
}

class HealCreatures extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      for (const item of game.getLanes(player)) {
        if (item.hasCreature() && item.getCreature().damage > 0) return true;
      }
      return false;
    }
    return flag;
  }

  cast() {
    for (const item of this.game.getLanes(this.owner)) {
      if (item.hasCreature() && item.getCreature().damage > 0) this.targetList.push(item.getCreature());
    }
    for (const item of this.game.getLanes(other(this.owner))) {
      if (item.hasCreature() && item.getCreature().damage > 0) this.targetList.push(item.getCreature());
    }
    this.doEffect();
  }

  doResult(target) {
    target.heal(target.damage);
    return true;
  }
}

class HealSelfATK extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      for (const item of game.getLanes(player)) {
        if (item.hasCreature() && item.getCreature().damage > 0) return true;
      }
      return false;
    }
    return flag;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature() && candidate.getCreature().damage > 0;
  }

  returnTarget(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  onTargetSelected(target) {
    this.returnTarget(target);
    this.endTargetSelection();
  }

  cast() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick a damaged creature to heal');
  }

  doResult(target) {
    target.heal(target.atk);
    return true;
  }
}

class KillLoneOpponent extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      let num = 0;
      for (const item of game.getLanes(other(player))) if (item.hasCreature()) num++;
      return num === 1;
    }
    return flag;
  }

  cast() {
    for (const item of this.game.getLanes(other(this.owner))) {
      if (item.hasCreature()) this.targetList.push(item.getCreature());
    }
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, target.health);
    return true;
  }
}

/** Shared lane check of MoveBuildingOpponent/Self: some but not all of `side`'s lanes hold a building. */
function someButNotAllBuildings(game, side) {
  let none = true;
  let all = true;
  for (let i = 0; i < 4; i++) {
    if (game.laneHasBuilding(side, i)) none = false;
    else all = false;
  }
  return !(none || all);
}

class MoveBuildingOpponent extends SpellScript {
  constructor() {
    super();
    this.source = null;
    this.destination = null;
    this.selectingBuilding = false;
  }

  static canPlay(game, player, lane, card) {
    let flag = CardScript.canPlay(game, player, lane, card);
    if (flag && !someButNotAllBuildings(game, other(player))) flag = false;
    return flag;
  }

  selectionFilter(candidate) {
    if (this.selectingBuilding) {
      if (candidate.hasBuilding()) return true;
    } else if (!candidate.hasBuilding()) {
      return true;
    }
    return false;
  }

  onTargetSelected(target) {
    if (this.selectingBuilding) {
      this.source = target;
      this.targetList.push(target.getBuilding());
      this.endTargetSelection();
      this.selectingBuilding = false;
      this.startTargetSelection(other(this.owner), 'Landscape', 'Pick an empty lane');
    } else {
      this.destination = target;
      this.endTargetSelection();
      this.doEffect();
    }
  }

  doResult(_target) {
    this.game.moveCard(other(this.owner), this.source.index, this.destination.index, CardType.Building);
    return true;
  }

  cast() {
    this.selectingBuilding = true;
    this.startTargetSelection(other(this.owner), 'Building', 'Pick a building to move');
  }
}

class MoveBuildingSelf extends SpellScript {
  constructor() {
    super();
    this.source = null;
    this.destination = null;
    this.selectingBuilding = false;
  }

  static canPlay(game, player, lane, card) {
    let flag = CardScript.canPlay(game, player, lane, card);
    if (flag && !someButNotAllBuildings(game, player)) flag = false;
    return flag;
  }

  selectionFilter(candidate) {
    if (this.selectingBuilding) {
      if (candidate.hasBuilding()) return true;
    } else if (!candidate.hasBuilding()) {
      return true;
    }
    return false;
  }

  onTargetSelected(target) {
    if (this.selectingBuilding) {
      this.source = target;
      this.targetList.push(target.getBuilding());
      this.endTargetSelection();
      this.selectingBuilding = false;
      this.startTargetSelection(this.owner, 'Landscape', 'Pick an empty lane');
    } else {
      this.destination = target;
      this.endTargetSelection();
      this.doEffect();
    }
  }

  doResult(_target) {
    this.game.moveCard(this.owner, this.source.index, this.destination.index, CardType.Building);
    return true;
  }

  cast() {
    this.selectingBuilding = true;
    this.startTargetSelection(this.owner, 'Building', 'Pick a building to move');
  }
}

class RandomCard extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      for (const item of game.getDeck(player).getCards()) {
        if (item.form.type === card.baseVal1) return true;
      }
      return false;
    }
    return flag;
  }

  takeCard(item) {
    // C# bug kept: it removes the card from the discard pile, not the deck, so a copy stays in the deck.
    this.game.removeCardFromDiscardPile(this.owner, item);
    this.game.placeCardInHand(this.owner, item);
  }

  cardFilter(item) {
    return item.form.type === this.data.form.baseVal1;
  }

  doResult(_target) {
    const list = this.game.getDeck(this.owner).getCards().filter((c) => this.cardFilter(c));
    const item = this.game.rng.pick(list);
    this.takeCard(item);
    return true;
  }
}

class ReduceActionPoints extends SpellScript {
  cast() {
    this.doEffectPlayer(other(this.owner));
  }

  doResult(_target) {
    this.game.addMagicPoints(other(this.owner), -2);
    return true;
  }
}

class ReduceCost extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) return game.getCardsInHand(player) > 1;
    return flag;
  }

  doResult(_target) {
    this.game.setDiscount(this.owner, CardType.None, 1);
    return true;
  }
}

class ReduceDEF extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) return game.creatureCount(other(player)) > 0 || game.creatureCount(player) > 0;
    return flag;
  }

  cast() {
    for (const item of this.game.getLanes(this.owner)) {
      if (item.hasCreature()) this.targetList.push(item.getCreature());
      if (item.opponentLane.hasCreature()) this.targetList.push(item.opponentLane.getCreature());
    }
    this.doEffect();
  }

  doResult(target) {
    target.defFactor *= 0.5;
    return true;
  }
}

class ReturnCard extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      for (const item of game.getDiscardPile(player)) {
        if (item.form.type === card.baseVal1) return true;
      }
      return false;
    }
    return flag;
  }

  takeCard(item) {
    this.game.removeCardFromDiscardPile(this.owner, item);
    this.game.placeCardInHand(this.owner, item);
  }

  cardFilter(item) {
    return item.form.type === this.data.form.baseVal1;
  }

  cardSelection(item) {
    this.takeCard(item);
    this.closeDiscardPile();
  }

  doResult(_target) {
    this.openDiscardPile('Pick a card to return to your hand');
    return true;
  }
}

class ReturnCreature extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) return game.hasCreaturesInPlay(player);
    return flag;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature();
  }

  returnTargetToHand(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  onTargetSelected(target) {
    this.returnTargetToHand(target);
    this.endTargetSelection();
  }

  cast() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick a creature.');
  }

  doResult(target) {
    this.game.removeCardFromPlay(this.owner, target.currentLane.index, CardType.Creature);
    this.game.placeCardInHand(this.owner, target.data);
    return true;
  }
}

class ReturnCreatures extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) return game.creatureCount(player) > 0;
    return flag;
  }

  cast() {
    for (const item of this.game.getLanes(this.owner)) {
      if (item.hasCreature()) this.targetList.push(item.getCreature());
    }
    this.doEffect();
  }

  doResult(target) {
    this.game.removeCardFromPlay(this.owner, target.currentLane.index, CardType.Creature);
    if (this.game.getCardsInHand(this.owner) < MAX_HAND) this.game.placeCardInHand(this.owner, target.data);
    else this.game.discardCard(this.owner, target.data);
    return true;
  }
}

class ReturnOpponentCreature extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) return game.hasCreaturesInPlay(other(player));
    return flag;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature();
  }

  returnTarget(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  onTargetSelected(target) {
    this.returnTarget(target);
    this.endTargetSelection();
  }

  cast() {
    this.startTargetSelection(other(this.owner), 'Creature', 'Pick a creature to return to its owner\'s hand');
  }

  doResult(target) {
    const opp = other(this.owner);
    this.game.removeCardFromPlay(opp, target.currentLane.index, CardType.Creature);
    if (this.game.getCardsInHand(opp) < MAX_HAND) this.game.placeCardInHand(opp, target.data);
    else this.game.discardCard(opp, target.data);
    return true;
  }
}

class ShuffleAndDraw extends SpellScript {
  doResult(_target) {
    const hand = this.game.getHand(this.owner);
    const deck = this.game.getDeck(this.owner);
    while (hand.length > 0) {
      deck.addCard(hand[0]);
      hand.splice(0, 1);
    }
    deck.shuffle(this.game.rng);
    for (let i = 0; i < 5; i++) this.game.drawCard(this.owner);
    return true;
  }
}

class SwapATKDEFOpponent extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) return game.hasCreaturesInPlay(other(player));
    return flag;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature();
  }

  returnTarget(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  onTargetSelected(target) {
    this.returnTarget(target);
    this.endTargetSelection();
  }

  cast() {
    this.startTargetSelection(other(this.owner), 'Creature', 'Pick a creature to swap its Attack and Defense');
  }

  doResult(target) {
    const atk = target.data.atk;
    const def = target.data.def;
    const atk2 = target.atk;
    target.atkMod = target.def - atk;
    target.defMod = atk2 - def;
    return true;
  }
}

class SwapATKDEFSelf extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) return game.hasCreaturesInPlay(player);
    return flag;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature();
  }

  returnTarget(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  onTargetSelected(target) {
    this.returnTarget(target);
    this.endTargetSelection();
  }

  cast() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick a creature to swap its Attack and Defense');
  }

  doResult(target) {
    // C# uses the unlevelled Form.BaseATK/BaseDEF here (SwapATKDEFOpponent uses Data.ATK/DEF), so it is off above level 1.
    const baseATK = target.data.form.baseATK;
    const baseDEF = target.data.form.baseDEF;
    const atk = target.atk;
    target.atkMod = target.def - baseATK;
    target.defMod = atk - baseDEF;
    return true;
  }
}

/** Stops the opponent from playing cards of type Form.BaseVal1 on their next turn. */
class BlockCardType extends SpellScript {
  static canPlay(game, player, lane, card) {
    return CardScript.canPlay(game, player, lane, card) && game.isCastingEnabled(other(player), card.baseVal1);
  }

  cast() {
    this.doEffectPlayer(other(this.owner));
  }

  doResult(_target) {
    this.game.enableCasting(other(this.owner), this.data.form.baseVal1, false);
    return true;
  }
}

class BlockCardBuilding extends BlockCardType {}
class BlockCardCreature extends BlockCardType {}
class BlockCardSpell extends BlockCardType {}

registerScripts({
  DoubleDamage,
  DrainOpponentHealth,
  DrawCardsSpell,
  EmptyLaneCards,
  FlatFloopCost,
  HealCreature,
  HealCreatures,
  HealSelfATK,
  KillLoneOpponent,
  MoveBuildingOpponent,
  MoveBuildingSelf,
  RandomCard,
  ReduceActionPoints,
  ReduceCost,
  ReduceDEF,
  ReturnCard,
  ReturnCreature,
  ReturnCreatures,
  ReturnOpponentCreature,
  ShuffleAndDraw,
  SwapATKDEFOpponent,
  SwapATKDEFSelf,
  BlockCardType,
  BlockCardBuilding,
  BlockCardCreature,
  BlockCardSpell,
});
