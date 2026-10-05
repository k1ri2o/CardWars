// Building abilities (BuildingScript subclasses) and hero powers
// (LeaderScript subclasses). Ported from Assets/Scripts/Assembly-CSharp.
//
// Building auras follow the original model: they add to the creature's
// ATKMod/DEFMod in onCardEnterPlay and take it back in onCardLeftPlay.
import { BuildingScript, LeaderScript } from './base.js';
import { CardType, FACTIONS, other } from '../consts.js';
import { registerScripts } from '../registry.js';

// ===========================================================================
// Buildings
// ===========================================================================

export class ATKBonusBuilding extends BuildingScript {
  onCardEnterPlay(script) {
    if (script === this) {
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyATK(creature, this.data.val1);
        this.triggerEffects();
      }
    } else if (script.data.form.type === CardType.Creature && script.currentLane === this.currentLane && script.owner === this.owner) {
      this.modifyATK(script, this.data.val1);
      this.triggerEffects();
    }
  }

  onCardLeftPlay(script) {
    if (script === this && this.currentLane.hasCreature()) {
      const creature = this.currentLane.getCreature();
      this.modifyATK(creature, -this.data.val1);
    }
  }
}

/**
 * +Val1 ATK per card in the opponent's hand, tracked every update.
 * The original's per-frame Update always ran between a hand change and the
 * next summon finishing or card leaving (animations sat in between); here
 * those happen in the same action, so the hooks catch up with update() first.
 */
export class ATKBonusCards extends BuildingScript {
  constructor() {
    super();
    this.prevCount = 0;
    this.initialized = false;
  }

  onCardEnterPlay(script) {
    this.update(); // see the class comment
    const cardsInHand = this.game.getCardsInHand(other(this.owner));
    if (script === this) {
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyATK(creature, this.data.val1 * cardsInHand);
        this.triggerEffects();
      }
      this.initialized = true;
    } else if (script.data.form.type === CardType.Creature && script.currentLane === this.currentLane) {
      this.modifyATK(script, this.data.val1 * cardsInHand);
      this.triggerEffects();
    }
    this.prevCount = cardsInHand;
  }

  update() {
    super.update();
    if (!this.initialized) return;
    const cardsInHand = this.game.getCardsInHand(other(this.owner));
    if (cardsInHand !== this.prevCount) {
      const num = cardsInHand - this.prevCount;
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyATK(creature, this.data.val1 * num);
        this.triggerEffects();
      }
      this.prevCount = cardsInHand;
    }
  }

  onCardLeftPlay(script) {
    this.update(); // see the class comment
    const cardsInHand = this.game.getCardsInHand(other(this.owner));
    if (script === this && this.currentLane.hasCreature()) {
      const creature = this.currentLane.getCreature();
      this.modifyATK(creature, -this.data.val1 * cardsInHand);
    }
  }
}

/** +Val1 ATK per creature the owner has in play. */
export class ATKBonusCreatures extends BuildingScript {
  onCardEnterPlay(script) {
    const num = this.game.creatureCount(this.owner);
    if (script === this) {
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyATK(creature, this.data.val1 * num);
        this.triggerEffects();
      }
    } else if (script.data.form.type === CardType.Creature) {
      if (script.currentLane === this.currentLane) {
        this.modifyATK(script, this.data.val1 * num);
        this.triggerEffects();
      } else if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyATK(creature, this.data.val1);
        this.triggerEffects();
      }
    }
  }

  onCardLeftPlay(script) {
    const num = this.game.creatureCount(this.owner);
    if (script === this) {
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyATK(creature, -this.data.val1 * num);
      }
    } else if (script.data.form.type === CardType.Creature && script.currentLane !== this.currentLane && this.currentLane.hasCreature()) {
      const creature = this.currentLane.getCreature();
      this.modifyATK(creature, -this.data.val1);
      this.triggerEffects();
    }
  }
}

/** +Val1 ATK per distinct landscape type on the owner's side. */
export class ATKBonusLandscapes extends BuildingScript {
  onCardEnterPlay(script) {
    const num = this.game.landscapeTypeCount(this.owner);
    if (script === this) {
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyATK(creature, this.data.val1 * num);
        this.triggerEffects();
      }
    } else if (script.data.form.type === CardType.Creature && script.currentLane === this.currentLane) {
      this.modifyATK(script, this.data.val1 * num);
      this.triggerEffects();
    }
  }

  onCardLeftPlay(script) {
    const num = this.game.landscapeTypeCount(this.owner);
    if (script === this && this.currentLane.hasCreature()) {
      const creature = this.currentLane.getCreature();
      this.modifyATK(creature, -this.data.val1 * num);
    }
  }
}

export class ATKDEFBonusBuilding extends BuildingScript {
  onCardEnterPlay(script) {
    if (script === this) {
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyATK(creature, this.data.val1);
        this.modifyDEF(creature, this.data.val2);
        this.triggerEffects();
      }
    } else if (script.data.form.type === CardType.Creature && script.currentLane === this.currentLane) {
      this.modifyATK(script, this.data.val1);
      this.modifyDEF(script, this.data.val2);
      this.triggerEffects();
    }
  }

  onCardLeftPlay(script) {
    if (script === this && this.currentLane.hasCreature()) {
      const creature = this.currentLane.getCreature();
      this.modifyATK(creature, -this.data.val1);
      this.modifyDEF(creature, -this.data.val2);
    }
  }
}

/** +Val1 ATK / +Val2 DEF per empty lane on the owner's side. */
export class ATKDEFBonusEmptyLanes extends BuildingScript {
  onCardEnterPlay(script) {
    const num = this.game.emptyLaneCount(this.owner);
    if (script === this) {
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyATK(creature, this.data.val1 * num);
        this.modifyDEF(creature, this.data.val2 * num);
        this.triggerEffects();
      }
    } else if (script.data.form.type === CardType.Creature) {
      if (script.currentLane === this.currentLane) {
        const creature = this.currentLane.getCreature();
        this.modifyATK(creature, this.data.val1 * num);
        this.modifyDEF(creature, this.data.val2 * num);
        this.triggerEffects();
      } else if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyATK(creature, -this.data.val1);
        this.modifyDEF(creature, -this.data.val2);
        this.triggerEffects();
      }
    }
  }

  onCardLeftPlay(script) {
    // The original removes the bonus using CreatureCount, not EmptyLaneCount.
    const num = this.game.creatureCount(this.owner);
    if (script === this) {
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyATK(creature, -this.data.val1 * num);
        this.modifyDEF(creature, -this.data.val2 * num);
      }
    } else if (script.data.form.type === CardType.Creature && script.currentLane !== this.currentLane && this.currentLane.hasCreature()) {
      const creature = this.currentLane.getCreature();
      this.modifyATK(creature, this.data.val1);
      this.modifyDEF(creature, this.data.val2);
      this.triggerEffects();
    }
  }
}

export class ATKOnFloop extends BuildingScript {
  onCreatureFlooped() {
    const creature = this.currentLane.getCreature();
    this.modifyATK(creature, this.data.val1);
    this.triggerEffects();
  }
}

export class ActionOnFloop extends BuildingScript {
  onCreatureFlooped() {
    this.game.addMagicPoints(this.owner, this.data.form.baseVal1);
    this.triggerEffects();
  }
}

export class CreatureDamageOnEntry extends BuildingScript {
  onCardEnterPlay(script) {
    if (script.data.form.type === CardType.Creature && script.currentLane === this.currentLane && this.currentLane.opponentLane.hasCreature()) {
      const creature = this.currentLane.opponentLane.getCreature();
      creature.takeDamage(this, this.data.val1);
      this.triggerEffects();
    }
  }
}

export class DEFBonusBuilding extends BuildingScript {
  onCardEnterPlay(script) {
    if (script === this) {
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyDEF(creature, this.data.val1);
        this.triggerEffects();
      }
    } else if (script.data.form.type === CardType.Creature && script.currentLane === this.currentLane) {
      this.modifyDEF(script, this.data.val1);
      this.triggerEffects();
    }
  }

  onCardLeftPlay(script) {
    if (script === this && this.currentLane.hasCreature()) {
      const creature = this.currentLane.getCreature();
      this.modifyDEF(creature, -this.data.val1);
    }
  }
}

/**
 * +Val1 DEF per card in the owner's hand, tracked every update. The hooks
 * catch up with update() first, as in ATKBonusCards.
 */
export class DEFBonusCards extends BuildingScript {
  constructor() {
    super();
    this.prevCount = 0;
    this.initialized = false;
  }

  onCardEnterPlay(script) {
    this.update(); // see the class comment
    const cardsInHand = this.game.getCardsInHand(this.owner);
    if (script === this) {
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyDEF(creature, this.data.val1 * cardsInHand);
        this.triggerEffects();
      }
      this.initialized = true;
    } else if (script.data.form.type === CardType.Creature && script.currentLane === this.currentLane) {
      this.modifyDEF(script, this.data.val1 * cardsInHand);
      this.triggerEffects();
    }
    this.prevCount = cardsInHand;
  }

  update() {
    super.update();
    if (!this.initialized) return;
    const cardsInHand = this.game.getCardsInHand(this.owner);
    if (cardsInHand !== this.prevCount) {
      const num = cardsInHand - this.prevCount;
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyDEF(creature, this.data.val1 * num);
        this.triggerEffects();
      }
      this.prevCount = cardsInHand;
    }
  }

  onCardLeftPlay(script) {
    this.update(); // see the class comment
    const cardsInHand = this.game.getCardsInHand(this.owner);
    if (script === this && this.currentLane.hasCreature()) {
      const creature = this.currentLane.getCreature();
      this.modifyDEF(creature, -this.data.val1 * cardsInHand);
    }
  }
}

/** +Val1 DEF per creature the owner has in play. */
export class DEFBonusCreaturesBuilding extends BuildingScript {
  onCardEnterPlay(script) {
    const num = this.game.creatureCount(this.owner);
    if (script === this) {
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyDEF(creature, this.data.val1 * num);
        this.triggerEffects();
      }
    } else if (script.data.form.type === CardType.Creature) {
      if (script.currentLane === this.currentLane) {
        this.modifyDEF(script, this.data.val1 * num);
        this.triggerEffects();
      } else if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyDEF(creature, this.data.val1);
        this.triggerEffects();
      }
    }
  }

  onCardLeftPlay(script) {
    const num = this.game.creatureCount(this.owner);
    if (script === this) {
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        this.modifyDEF(creature, -this.data.val1 * num);
      }
    } else if (script.data.form.type === CardType.Creature && script.currentLane !== this.currentLane && this.currentLane.hasCreature()) {
      const creature = this.currentLane.getCreature();
      this.modifyDEF(creature, -this.data.val1);
      this.triggerEffects();
    }
  }
}

export class DEFOnFloop extends BuildingScript {
  onCreatureFlooped() {
    const creature = this.currentLane.getCreature();
    this.modifyDEF(creature, this.data.val1);
    this.triggerEffects();
  }
}

export class DamageHeroOnDeath extends BuildingScript {
  onCreatureDied(_creature) {
    this.game.dealDamage(other(this.owner), this.data.val1);
    this.triggerEffects();
  }
}

export class DamageReduction extends BuildingScript {
  onCardEnterPlay(script) {
    if (script === this) {
      if (this.currentLane.hasCreature()) {
        this.currentLane.getCreature().damageReduction += this.data.val1;
        this.triggerEffects();
      }
    } else if (script.data.form.type === CardType.Creature && script.currentLane === this.currentLane) {
      script.damageReduction += this.data.val1;
      this.triggerEffects();
    }
  }

  onCardLeftPlay(script) {
    if (script === this && this.currentLane.hasCreature()) {
      this.currentLane.getCreature().damageReduction -= this.data.val1;
    }
  }
}

export class FloopCostMod extends BuildingScript {
  onCardEnterPlay(script) {
    if (script === this) {
      this.currentLane.floopMod -= this.data.form.baseVal1;
    }
  }

  onCreatureFlooped() {
    this.triggerEffects();
  }

  onCardLeftPlay(script) {
    if (script === this) {
      this.currentLane.floopMod += this.data.form.baseVal1;
    }
  }
}

export class HealHeroOnDeath extends BuildingScript {
  onCreatureDied(_creature) {
    this.game.dealDamage(this.owner, -this.data.val1);
    this.triggerEffects();
  }
}

export class HealOnVictory extends BuildingScript {
  onCreatureWon() {
    if (this.currentLane.hasCreature()) {
      const creature = this.currentLane.getCreature();
      creature.heal(this.data.val1);
      this.triggerEffects();
    }
  }
}

export class HeroDamageOnEntry extends BuildingScript {
  onCardEnterPlay(script) {
    if (script.data.form.type === CardType.Creature && script.currentLane === this.currentLane) {
      this.game.dealDamage(other(this.owner), this.data.val1);
      this.triggerEffects();
    }
  }
}

/** The opposing lane only accepts cards of rarity BaseVal1 or lower. */
export class RarityGate extends BuildingScript {
  onCardEnterPlay(script) {
    if (script === this) {
      this.currentLane.opponentLane.rarityGate = this.data.form.baseVal1;
      this.triggerEffects();
    }
  }

  onCardLeftPlay(script) {
    if (script === this) {
      // int.MaxValue in the original; the same "no gate" value Lane starts with.
      this.currentLane.opponentLane.rarityGate = Number.MAX_SAFE_INTEGER;
    }
  }
}

/** When the lane's creature dies it goes back to hand and this building is discarded. */
export class ReturnToHandSacrifice extends BuildingScript {
  onCreatureDied(creature) {
    this.game.placeCardInHand(this.owner, creature);
    this.game.removeCardFromDiscardPile(this.owner, creature);
    this.triggerEffects();
    this.game.discardCard(this.owner, this.data);
    this.game.removeCardFromPlay(this.owner, this.currentLane.index, CardType.Building);
  }
}

export class StartTurnHealCreature extends BuildingScript {
  startTurn() {
    if (this.currentLane.hasCreature()) {
      const creature = this.currentLane.getCreature();
      creature.heal(this.data.val1);
      this.triggerEffects();
    }
  }
}

export class StartTurnHealCreatures extends BuildingScript {
  startTurn() {
    const num = this.game.creatureCount(this.owner);
    if (this.currentLane.hasCreature()) {
      const creature = this.currentLane.getCreature();
      creature.heal(this.data.val1 * num);
      this.triggerEffects();
    }
  }
}

/** Swaps the ATK and DEF of the creature in this lane. */
export class SwapATKDEFBuilding extends BuildingScript {
  onCardEnterPlay(script) {
    if (script === this) {
      if (this.currentLane.hasCreature()) {
        const creature = this.currentLane.getCreature();
        swapATKDEF(creature, creature.data.form.baseATK, creature.data.form.baseDEF);
        this.triggerEffects();
      }
    } else if (script.data.form.type === CardType.Creature && script.currentLane === this.currentLane && script.owner === this.owner) {
      const creature = this.currentLane.getCreature();
      swapATKDEF(creature, creature.data.form.baseATK, creature.data.form.baseDEF);
      this.triggerEffects();
    }
  }

  onCardLeftPlay(script) {
    if (script === this && this.currentLane.hasCreature()) {
      const creature = this.currentLane.getCreature();
      // The original reads the building's own BaseATK/BaseDEF (script == this)
      // here, not the creature's, so the creature keeps both totals added on.
      swapATKDEF(creature, script.data.form.baseATK, script.data.form.baseDEF);
    }
  }
}

function swapATKDEF(creature, baseATK, baseDEF) {
  const atk = creature.atk;
  creature.atkMod = creature.def - baseATK;
  creature.defMod = atk - baseDEF;
}

// ===========================================================================
// Hero powers
// ===========================================================================

export class ATKBonusAllCreaturesLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      return game.hasCreaturesInPlay(player);
    }
    return flag;
  }

  cast() {
    for (const lane of this.game.getLanes(this.owner)) {
      if (lane.hasCreature()) this.targetList.push(lane.getCreature());
    }
    this.doEffect();
  }

  doResult(target) {
    target.atkMod += this.leader.form.baseVal1;
    return true;
  }
}

export class ATKBonusFactionCreaturesLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      const form = game.getLeader(player).form;
      return game.creatureFactionCount(player, form.forFaction) > 0;
    }
    return flag;
  }

  cast() {
    for (const lane of this.game.getLanes(this.owner)) {
      if (lane.hasCreature() && lane.getCreature().data.form.faction === this.leader.form.forFaction) {
        this.targetList.push(lane.getCreature());
      }
    }
    this.doEffect();
  }

  doResult(target) {
    target.atkMod += this.leader.form.baseVal1;
    return true;
  }
}

export class ATKDEFBonusFactionCreaturesLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      const form = game.getLeader(player).form;
      return game.creatureFactionCount(player, form.forFaction) > 0;
    }
    return flag;
  }

  cast() {
    for (const lane of this.game.getLanes(this.owner)) {
      if (lane.hasCreature() && lane.getCreature().data.form.faction === this.leader.form.forFaction) {
        this.targetList.push(lane.getCreature());
      }
    }
    this.doEffect();
  }

  doResult(target) {
    target.atkMod += this.leader.form.baseVal1;
    target.defMod += this.leader.form.baseVal2;
    return true;
  }
}

/**
 * Discards every opposing building and stops the opponent casting cards of
 * forCardType until their next turn ends.
 */
export class BlockCardTypeDestroyBuildingsLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    const leader = game.getLeader(player);
    if (flag) {
      let num = 0;
      for (const item of game.getHand(other(player))) {
        if (item.form.type === leader.form.forCardType) num++;
      }
      if (num > 0) return true;
      if (game.hasCardTypeInPlay(other(player), CardType.Building)) return true;
      return false;
    }
    return flag;
  }

  cast() {
    let num = 0;
    for (const lane of this.game.getLanes(other(this.owner))) {
      if (lane.hasBuilding()) {
        num++;
        this.targetList.push(lane.getBuilding());
      }
    }
    const form = this.game.getLeader(this.owner).form;
    let num2 = 0;
    for (const item of this.game.getHand(other(this.owner))) {
      if (item.form.type === form.forCardType) num2++;
    }
    if (num2 > 0) {
      // The original also pushed a null onto TargetList here; its building
      // sequence threw on it after handling every building, so it changed nothing.
      this.doEffectPlayer(other(this.owner));
    }
    if (num > 0) {
      this.doEffect();
    }
  }

  doResult(target) {
    if (target !== null) {
      this.game.discardCard(target.owner, target.data);
      this.game.removeCardFromPlay(target.owner, target.currentLane.index, CardType.Building);
    }
    this.game.enableCasting(other(this.owner), this.leader.form.forCardType, false);
    return true;
  }
}

export class DEFBonusAllCreaturesLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      return game.hasCreaturesInPlay(player);
    }
    return flag;
  }

  cast() {
    for (const lane of this.game.getLanes(this.owner)) {
      if (lane.hasCreature()) this.targetList.push(lane.getCreature());
    }
    this.doEffect();
  }

  doResult(target) {
    target.defMod += this.leader.form.baseVal1;
    return true;
  }
}

export class DEFBonusFactionCreaturesLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      const form = game.getLeader(player).form;
      return game.creatureFactionCount(player, form.forFaction) > 0;
    }
    return flag;
  }

  cast() {
    for (const lane of this.game.getLanes(this.owner)) {
      if (lane.hasCreature() && lane.getCreature().data.form.faction === this.leader.form.forFaction) {
        this.targetList.push(lane.getCreature());
      }
    }
    this.doEffect();
  }

  doResult(target) {
    target.defMod += this.leader.form.baseVal1;
    return true;
  }
}

export class DrawCardsLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      return game.getDeck(player).cardCount() > 0 && game.getCardsInHand(player) < 7;
    }
    return flag;
  }

  cast() {
    this.doEffectPlayer(this.owner);
  }

  doResult(_target) {
    for (let i = 0; i < this.leader.form.baseVal1; i++) {
      this.game.drawCard(this.owner);
    }
    return true;
  }
}

// The original's extra CanPlay check (only use it if the extra magic gives a
// legal move) applied to the AI opponent alone, so it is dropped.
export class GainActionPointsLeader extends LeaderScript {
  cast() {
    this.doEffectPlayer(this.owner);
  }

  doResult(_target) {
    this.game.addMagicPoints(this.owner, this.leader.form.baseVal1);
    return true;
  }
}

export class HealAllCreaturesLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      for (const l of game.getLanes(player)) {
        if (l.hasCreature() && l.getCreature().damage > 0) return true;
      }
      return false;
    }
    return flag;
  }

  cast() {
    for (const lane of this.game.getLanes(this.owner)) {
      if (lane.hasCreature()) {
        const creature = lane.getCreature();
        if (creature.damage > 0) this.targetList.push(creature);
      }
    }
    this.doEffect();
  }

  doResult(target) {
    target.heal(target.damage);
    return true;
  }
}

export class HealAllFactionCreaturesLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      const form = game.getLeader(player).form;
      for (const l of game.getLanes(player)) {
        if (l.hasCreature() && l.getCreature().data.form.faction === form.forFaction) {
          if (l.getCreature().damage > 0) return true;
        }
      }
      return false;
    }
    return flag;
  }

  cast() {
    for (const lane of this.game.getLanes(this.owner)) {
      if (lane.hasCreature() && lane.getCreature().data.form.faction === this.leader.form.forFaction) {
        const creature = lane.getCreature();
        if (creature.damage > 0) this.targetList.push(creature);
      }
    }
    this.doEffect();
  }

  doResult(target) {
    target.heal(target.damage);
    return true;
  }
}

export class HealCreatureLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      for (const l of game.getLanes(player)) {
        if (l.hasCreature() && l.getCreature().damage > 0) return true;
      }
      return false;
    }
    return flag;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature() && candidate.getCreature().damage > 0;
  }

  healTarget(target) {
    const creature = target.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  onTargetSelected(target) {
    this.healTarget(target);
    this.endTargetSelection();
  }

  cast() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick one of your creatures to fully heal');
  }

  doResult(target) {
    target.heal(target.damage);
    return true;
  }
}

export class ReduceCostLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      return game.getCardsInHand(player) > 1;
    }
    return flag;
  }

  cast() {
    this.doEffectPlayer(this.owner);
  }

  doResult(_target) {
    this.game.setDiscount(this.owner, CardType.None, 1);
    return true;
  }
}

/** forCardType cards of forFaction cost Val1 less, every other faction Val2 less. */
export class ReduceFactionCreatureCostLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      const form = game.getLeader(player).form;
      for (const item of game.getHand(player)) {
        if (item.form.type === form.forCardType) return true;
      }
      return false;
    }
    return flag;
  }

  cast() {
    this.doEffectPlayer(this.owner);
  }

  doResult(_target) {
    // Enum.GetValues(typeof(Faction)): Corn, Plains, Swamp, Cotton, Sand, Universal.
    for (const value of FACTIONS) {
      if (value === this.leader.form.forFaction) {
        this.game.setDiscount(this.owner, this.leader.form.forCardType, this.leader.form.baseVal1, true, value);
      } else {
        this.game.setDiscount(this.owner, this.leader.form.forCardType, this.leader.form.baseVal2, true, value);
      }
    }
    return true;
  }
}

export class ReduceTypeCostLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      const form = game.getLeader(player).form;
      for (const item of game.getHand(player)) {
        if (item.form.type === form.forCardType) return true;
      }
      return false;
    }
    return flag;
  }

  cast() {
    this.doEffectPlayer(this.owner);
  }

  doResult(_target) {
    this.game.setDiscount(this.owner, this.leader.form.forCardType, this.leader.form.baseVal1);
    return true;
  }
}

/** Every opposing building goes back to its owner's hand (discarded if the hand is full). */
export class ReturnBuildingsLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      return game.hasCardTypeInPlay(other(player), CardType.Building);
    }
    return flag;
  }

  cast() {
    for (const lane of this.game.getLanes(other(this.owner))) {
      if (lane.hasBuilding()) this.targetList.push(lane.getBuilding());
    }
    this.doEffect();
  }

  doResult(target) {
    this.game.removeCardFromPlay(target.owner, target.currentLane.index, CardType.Building);
    if (this.game.getCardsInHand(target.owner) < 7) {
      this.game.placeCardInHand(target.owner, target.data);
    } else {
      this.game.discardCard(target.owner, target.data);
    }
    return true;
  }
}

export class ReturnCardLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      if (game.getCardsInHand(player) >= 7) return false;
      return game.getDiscardPile(player).length > 0;
    }
    return flag;
  }

  takeCard(item) {
    this.game.removeCardFromDiscardPile(this.owner, item);
    this.game.placeCardInHand(this.owner, item);
  }

  cardFilter(_item) {
    return true;
  }

  cardSelection(item) {
    this.takeCard(item);
    this.closeDiscardPile();
  }

  cast() {
    this.doEffectPlayer(this.owner);
  }

  doResult(_target) {
    this.openDiscardPile('Pick a card to return to your hand');
    return true;
  }
}

export class ReturnCardTypeLeader extends LeaderScript {
  static canPlay(game, player, lane, card) {
    const flag = LeaderScript.canPlay(game, player, lane, card);
    if (flag) {
      if (game.getCardsInHand(player) >= 7) return false;
      const form = game.getLeader(player).form;
      for (const item of game.getDiscardPile(player)) {
        if (item.form.type === form.forCardType) return true;
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
    return item.form.type === this.leader.form.forCardType;
  }

  cardSelection(item) {
    this.takeCard(item);
    this.closeDiscardPile();
  }

  cast() {
    this.doEffectPlayer(this.owner);
  }

  doResult(_target) {
    this.openDiscardPile('Pick a card to return to your hand');
    return true;
  }
}

registerScripts({
  ATKBonusBuilding,
  ATKBonusCards,
  ATKBonusCreatures,
  ATKBonusLandscapes,
  ATKDEFBonusBuilding,
  ATKDEFBonusEmptyLanes,
  ATKOnFloop,
  ActionOnFloop,
  CreatureDamageOnEntry,
  DEFBonusBuilding,
  DEFBonusCards,
  DEFBonusCreaturesBuilding,
  DEFOnFloop,
  DamageHeroOnDeath,
  DamageReduction,
  FloopCostMod,
  HealHeroOnDeath,
  HealOnVictory,
  HeroDamageOnEntry,
  RarityGate,
  ReturnToHandSacrifice,
  StartTurnHealCreature,
  StartTurnHealCreatures,
  SwapATKDEFBuilding,
  ATKBonusAllCreaturesLeader,
  ATKBonusFactionCreaturesLeader,
  ATKDEFBonusFactionCreaturesLeader,
  BlockCardTypeDestroyBuildingsLeader,
  DEFBonusAllCreaturesLeader,
  DEFBonusFactionCreaturesLeader,
  DrawCardsLeader,
  GainActionPointsLeader,
  HealAllCreaturesLeader,
  HealAllFactionCreaturesLeader,
  HealCreatureLeader,
  ReduceCostLeader,
  ReduceFactionCreatureCostLeader,
  ReduceTypeCostLeader,
  ReturnBuildingsLeader,
  ReturnCardLeader,
  ReturnCardTypeLeader,
});
