// Creature floop abilities, batch B: DamageOpponent* through HealTargetAll.
import { registerScripts } from '../registry.js';
import { CreatureScript, toInt } from './base.js';
import { CardType, FACTIONS, other } from '../consts.js';

// ---- damage the opposing creature ------------------------------------------

/** Deals the damage this creature has taken to the opposing creature. */
class DamageOpponentDamage extends CreatureScript {
  canFloop() {
    if (this.currentLane.opponentLane.hasCreature()) return true;
    return false;
  }

  floop() {
    const creature = this.currentLane.opponentLane.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, this.damage);
    return true;
  }
}

class DamageOpponentDiscardPile extends CreatureScript {
  canFloop() {
    const count = this.game.getDiscardPile(this.owner).length;
    if (count >= this.data.form.baseVal2 && this.currentLane.opponentLane.hasCreature()) return true;
    return false;
  }

  floop() {
    const creature = this.currentLane.opponentLane.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    const num = Math.trunc(this.game.getDiscardPile(this.owner).length / this.data.form.baseVal2);
    target.takeDamage(this, this.data.val1 * num);
    return true;
  }
}

class DamageOpponentDiscardedCreatures extends CreatureScript {
  canFloop() {
    if (this.currentLane.opponentLane.hasCreature()
      && this.game.discardPileContains(other(this.owner), CardType.Creature)) return true;
    return false;
  }

  floop() {
    const creature = this.currentLane.opponentLane.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    const num = this.game.discardCount(other(this.owner), CardType.Creature);
    target.takeDamage(this, this.data.val1 * num);
    return true;
  }
}

/** Val1 damage for every other creature flooped this turn (the count includes this floop). */
class DamageOpponentFloop extends CreatureScript {
  canFloop() {
    const floopCountTurn = this.game.getFloopCountTurn(this.owner);
    if (this.currentLane.opponentLane.hasCreature() && floopCountTurn > 0) return true;
    return false;
  }

  floop() {
    const creature = this.currentLane.opponentLane.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    const num = this.game.getFloopCountTurn(this.owner) - 1;
    target.takeDamage(this, this.data.val1 * num);
    return true;
  }
}

class DamageOpponentHealSelf extends CreatureScript {
  canFloop() {
    if (this.currentLane.opponentLane.hasCreature() || this.damage > 0) return true;
    return false;
  }

  floop() {
    if (this.currentLane.opponentLane.hasCreature()) {
      const creature = this.currentLane.opponentLane.getCreature();
      this.targetList.push(creature);
    }
    if (this.damage > 0) this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    if (target === this) target.heal(this.data.val2);
    else target.takeDamage(this, this.data.val1);
    return true;
  }
}

/** Deals Val1 percent of the damage this creature took last turn to the opposing creature. */
class DamageOpponentIfDamagedLastTurn extends CreatureScript {
  canFloop() {
    return this.damageLastTurn > 0 && this.game.laneHasCreature(other(this.owner), this.currentLane.opponentLane.index);
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, this.getDamageToDeal());
    return true;
  }

  getDamageToDeal() {
    // C# float maths.
    const num = Math.fround(this.data.val1 / 100);
    const num2 = Math.fround(this.damageLastTurn * num);
    return toInt(num2);
  }
}

class DamageOpponentLandscapeVariety extends CreatureScript {
  canFloop() {
    const num = this.game.landscapeTypeCount(this.owner);
    if (num >= 0 && this.currentLane.opponentLane.hasCreature()) return true;
    return false;
  }

  floop() {
    const creature = this.currentLane.opponentLane.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    const num = this.game.landscapeTypeCount(this.owner);
    target.takeDamage(this, this.data.val1 * num);
    return true;
  }
}

class DamageOpponentLowerATK extends CreatureScript {
  canFloop() {
    if (this.currentLane.opponentLane.hasCreature()) return true;
    return false;
  }

  floop() {
    const creature = this.currentLane.opponentLane.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, this.data.val1);
    target.atkMod -= this.data.val2;
    return true;
  }
}

class DamageOpponentMyBuildings extends CreatureScript {
  canFloop() {
    const num = this.game.buildingCount(this.owner);
    if (this.currentLane.opponentLane.hasCreature() && num > 0) return true;
    return false;
  }

  floop() {
    const creature = this.currentLane.opponentLane.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    const num = this.game.buildingCount(this.owner);
    target.takeDamage(this, this.data.val1 * num);
    return true;
  }
}

class DamageOpponentRarity extends CreatureScript {
  canFloop() {
    if (this.currentLane.opponentLane.hasCreature()) return true;
    return false;
  }

  floop() {
    const creature = this.currentLane.opponentLane.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    const rarity = target.data.form.rarity;
    target.takeDamage(this, this.data.val1 * rarity);
    return true;
  }
}

class DamageOpponentTheirBuildings extends CreatureScript {
  canFloop() {
    const num = this.game.buildingCount(other(this.owner));
    if (this.currentLane.opponentLane.hasCreature() && num > 0) return true;
    return false;
  }

  floop() {
    const creature = this.currentLane.opponentLane.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    const num = this.game.buildingCount(other(this.owner));
    target.takeDamage(this, this.data.val1 * num);
    return true;
  }
}

/** Val1 damage to a random creature on either side (needs an enemy creature to floop). */
class DamageRandom extends CreatureScript {
  canFloop() {
    if (this.game.hasCreaturesInPlay(other(this.owner))) return true;
    return false;
  }

  floop() {
    const list = [];
    for (const item of this.game.getLanes(other(this.owner))) {
      if (item.hasCreature()) list.push(item.getCreature());
    }
    for (const item of this.game.getLanes(this.owner)) {
      if (item.hasCreature()) list.push(item.getCreature());
    }
    this.targetList.push(this.game.rng.pick(list));
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, this.data.val1);
    return true;
  }
}

// ---- damage a chosen creature ------------------------------------------------

class DamageTarget extends CreatureScript {
  canFloop() {
    for (const item of this.game.getLanes(other(this.owner))) {
      if (item.hasCreature()) return true;
    }
    return false;
  }

  selectionFilter(candidate) {
    if (candidate.hasCreature()) return true;
    return false;
  }

  doDamage(target) {
    const creature = target.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, this.data.val1);
    return true;
  }

  onTargetSelected(target) {
    this.doDamage(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(other(this.owner), 'Creature', 'Tap a creature to attack!');
  }
}

/** Val1 damage to an opposing creature of the faction numbered BaseVal2. */
class DamageTargetFaction extends CreatureScript {
  canFloop() {
    for (const item of this.game.getLanes(other(this.owner))) {
      if (item.hasCreature() && item.getCreature().data.form.faction === FACTIONS[this.data.form.baseVal2]) return true;
    }
    return false;
  }

  selectionFilter(candidate) {
    if (candidate.hasCreature() && candidate.getCreature().data.form.faction === FACTIONS[this.data.form.baseVal2]) return true;
    return false;
  }

  doDamage(target) {
    const creature = target.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, this.data.val1);
    return true;
  }

  onTargetSelected(target) {
    this.doDamage(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(other(this.owner), 'Creature', 'Tap a creature to attack!');
  }
}

/** Damages a chosen enemy and heals itself; with no enemies it only heals itself. */
class DamageTargetHealSelf extends CreatureScript {
  canFloop() {
    if (this.game.hasCreaturesInPlay(other(this.owner)) || this.damage > 0) return true;
    return false;
  }

  selectionFilter(candidate) {
    if (candidate.hasCreature()) return true;
    return false;
  }

  doDamage(target) {
    const creature = target.getCreature();
    this.targetList.push(creature);
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    if (target === this) target.heal(this.data.val2);
    else target.takeDamage(this, this.data.val1);
    return true;
  }

  onTargetSelected(target) {
    this.doDamage(target);
    this.endTargetSelection();
  }

  floop() {
    if (this.game.hasCreaturesInPlay(other(this.owner))) {
      this.startTargetSelection(other(this.owner), 'Creature', 'Tap a creature to attack!');
    } else {
      this.targetList.push(this);
      this.doEffect();
    }
  }
}

class DestroyOpponentBuilding extends CreatureScript {
  canFloop() {
    if (this.currentLane.opponentLane.hasBuilding()) return true;
    return false;
  }

  floop() {
    const building = this.currentLane.opponentLane.getBuilding();
    this.targetList.push(building);
    this.doEffect();
  }

  doResult(target) {
    this.game.removeCardFromPlay(target.owner, target.currentLane.index, target.data.form.type);
    this.game.discardCard(target.owner, target.data);
    return true;
  }
}

// ---- stat drains ---------------------------------------------------------------

/** Adjacent creatures lose Val1 DEF; this creature gains Val2 ATK. */
class DrainAdjacentDEFAddATKBonus extends CreatureScript {
  canFloop() {
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) return true;
    }
    return false;
  }

  floop() {
    this.targetList.push(this);
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) {
        const creature = lane.getCreature();
        this.targetList.push(creature);
      }
    }
    this.doEffect();
  }

  doResult(target) {
    if (target === this) target.atkMod += this.data.val2;
    else target.defMod -= this.data.val1;
    return true;
  }
}

/** Halves the opposing creature's ATK; this creature gains that much ATK and loses that much DEF. */
class DrainOpponentATKLowerSelfDEF extends CreatureScript {
  canFloop() {
    if (this.currentLane.opponentLane.hasCreature() && this.enemy.atk > 0) return true;
    return false;
  }

  floop() {
    this.targetList.push(this);
    const creature = this.currentLane.opponentLane.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    if (target === this) {
      if (this.enemy.atk === 1) {
        target.atkMod++;
        target.defMod--;
      } else {
        target.atkMod += Math.trunc(this.enemy.atk / 2);
        target.defMod -= Math.trunc(this.enemy.atk / 2);
      }
    } else if (this.enemy.atk === 1) {
      target.atkMod--;
    } else {
      target.atkMod -= Math.trunc(this.enemy.atk / 2);
    }
    return true;
  }
}

// ---- cards ------------------------------------------------------------------------

/** Draws BaseVal1 cards (the raw value, not scaled by level). */
class DrawCards extends CreatureScript {
  canFloop() {
    if (this.game.getCardsInHand(this.owner) < 7 && this.game.getDeck(this.owner).cardCount() > 0) return true;
    return false;
  }

  floop() {
    const baseVal = this.data.form.baseVal1;
    for (let i = 0; i < baseVal; i++) this.game.drawCard(this.owner);
    this.doEffect();
  }
}

/** Draws BaseVal1 cards, then sends this creature to the discard pile. */
class DrawCardsSacrifice extends CreatureScript {
  canFloop() {
    if (this.game.getCardsInHand(this.owner) < 7 && this.game.getDeck(this.owner).cardCount() > 0) return true;
    return false;
  }

  floop() {
    const baseVal = this.data.form.baseVal1;
    for (let i = 0; i < baseVal; i++) this.game.drawCard(this.owner);
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    this.game.removeCardFromPlay(target.owner, target.currentLane.index, CardType.Creature);
    this.game.discardCard(target.owner, target.data);
    return true;
  }
}

/** Returns this creature to its owner's hand, then draws BaseVal1 cards. */
class DrawCardsTake extends CreatureScript {
  canFloop() {
    if (this.game.getCardsInHand(this.owner) < 7 && this.game.getDeck(this.owner).cardCount() > 0) return true;
    return false;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    this.game.removeCardFromPlay(target.owner, target.currentLane.index, CardType.Creature);
    this.game.placeCardInHand(target.owner, target.data);
    const baseVal = this.data.form.baseVal1;
    for (let i = 0; i < baseVal; i++) this.game.drawCard(this.owner);
    return true;
  }
}

/** Sets the opposing creature's ATKMod so its base ATK plus the mod equals this creature's ATK. */
class EqualizeATK extends CreatureScript {
  canFloop() {
    if (this.currentLane.opponentLane.hasCreature()) return true;
    return false;
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    // Uses the form's BaseATK, not the level-scaled ATK, as the C# does.
    const baseATK = target.data.form.baseATK;
    const aTKMod = this.atk - baseATK;
    target.atkMod = aTKMod;
    return true;
  }
}

/**
 * Runs an adjacent creature's floop ability (not another FloopAdjacent).
 * The neighbour's Floop() is called directly: it is not marked flooped and
 * pays nothing, as in the original.
 */
class FloopAdjacent extends CreatureScript {
  canFloop() {
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) {
        const creature = lane.getCreature();
        if (!(creature instanceof FloopAdjacent) && creature.canFloop()) return true;
      }
    }
    return false;
  }

  selectionFilter(candidate) {
    if ((this.currentLane.adjacentLanes[0] === candidate || this.currentLane.adjacentLanes[1] === candidate)
      && candidate.hasCreature()) {
      const creature = candidate.getCreature();
      if (!(creature instanceof FloopAdjacent) && creature.canFloop()) return true;
    }
    return false;
  }

  doDamage(target) {
    const creature = target.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    if (target.canFloop()) {
      target.floop();
      return false;
    }
    return true;
  }

  onTargetSelected(target) {
    this.doDamage(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(this.owner, 'Creature', 'Tap a creature to use its floop ability!');
  }
}

/** BaseVal1 extra magic points next turn. */
class GainActionPoints extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(_target) {
    this.game.addBonusPoints(this.owner, this.data.form.baseVal1);
    return true;
  }
}

// ---- healing ---------------------------------------------------------------------

class HealAdjacent extends CreatureScript {
  canFloop() {
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) {
        const creature = lane.getCreature();
        if (creature.damage > 0) return true;
      }
    }
    return false;
  }

  floop() {
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) {
        const creature = lane.getCreature();
        this.targetList.push(creature);
      }
    }
    this.doEffect();
  }

  doResult(target) {
    target.heal(this.data.val1);
    return true;
  }
}

/** Heals adjacent creatures by this creature's current DEF, then discards this creature. */
class HealAdjacentDEFAndDiscard extends CreatureScript {
  canFloop() {
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) {
        const creature = lane.getCreature();
        if (creature.damage > 0) return true;
      }
    }
    return false;
  }

  floop() {
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) {
        const creature = lane.getCreature();
        this.targetList.push(creature);
      }
    }
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    if (target === this) {
      this.game.removeCardFromPlay(target.owner, target.currentLane.index, CardType.Creature);
      this.game.discardCard(target.owner, target.data);
    } else {
      target.heal(this.def);
    }
    return true;
  }
}

/** Heals adjacent creatures by the damage on this creature. */
class HealAdjacentDamage extends CreatureScript {
  canFloop() {
    if (this.damage > 0) return true;
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) {
        const creature = lane.getCreature();
        if (creature.damage > 0) return true;
      }
    }
    return false;
  }

  floop() {
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) {
        const creature = lane.getCreature();
        this.targetList.push(creature);
      }
    }
    this.doEffect();
  }

  doResult(target) {
    target.heal(this.damage);
    return true;
  }
}

class HealAll extends CreatureScript {
  canFloop() {
    for (const item of this.game.getLanes(this.owner)) {
      if (item.hasCreature()) {
        const creature = item.getCreature();
        if (creature.damage > 0) return true;
      }
    }
    return false;
  }

  floop() {
    for (const item of this.game.getLanes(this.owner)) {
      if (item.hasCreature()) {
        const creature = item.getCreature();
        this.targetList.push(creature);
      }
    }
    this.doEffect();
  }

  doResult(target) {
    target.heal(this.data.val1);
    return true;
  }
}

/** Fully heals the owner's other creatures, then discards this creature. */
class HealAllSacrifice extends CreatureScript {
  canFloop() {
    for (const item of this.game.getLanes(this.owner)) {
      if (item.hasCreature()) {
        const creature = item.getCreature();
        if (creature !== this && creature.damage > 0) return true;
      }
    }
    return false;
  }

  floop() {
    for (const item of this.game.getLanes(this.owner)) {
      if (item.hasCreature()) {
        const creature = item.getCreature();
        if (creature !== this) this.targetList.push(creature);
      }
    }
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    if (target !== this) {
      target.heal(target.damage);
    } else {
      this.game.removeCardFromPlay(target.owner, target.currentLane.index, CardType.Creature);
      this.game.discardCard(target.owner, target.data);
    }
    return true;
  }
}

class HealHero extends CreatureScript {
  canFloop() {
    if (this.game.getHealth(this.owner) < this.game.getMaxHealth(this.owner)) return true;
    return false;
  }

  floop() {
    this.doEffectPlayer(this.owner);
  }

  doResult(_target) {
    this.game.dealDamage(this.owner, -this.data.val1);
    return true;
  }
}

/** Heals the owner's hero by this creature's ATK. */
class HealHeroATK extends CreatureScript {
  canFloop() {
    if (this.game.getHealth(this.owner) < this.game.getMaxHealth(this.owner)) return true;
    return false;
  }

  floop() {
    this.doEffectPlayer(this.owner);
  }

  doResult(_target) {
    this.game.dealDamage(this.owner, -this.atk);
    return true;
  }
}

/** Heals the hero Val1 for every other creature flooped this turn (the count includes this floop). */
class HealHeroFloop extends CreatureScript {
  canFloop() {
    const floopCountTurn = this.game.getFloopCountTurn(this.owner);
    if (this.game.getHealth(this.owner) < this.game.getMaxHealth(this.owner) && floopCountTurn > 0) return true;
    return false;
  }

  floop() {
    this.doEffectPlayer(this.owner);
  }

  doResult(_target) {
    const num = this.game.getFloopCountTurn(this.owner) - 1;
    this.game.dealDamage(this.owner, -this.data.val1 * num);
    return true;
  }
}

/** Heals Val1 on a random damaged creature of the owner's (the card text says either side; the code does not). */
class HealRandom extends CreatureScript {
  canFloop() {
    for (const item of this.game.getLanes(this.owner)) {
      if (item.hasCreature()) {
        const creature = item.getCreature();
        if (creature.damage > 0) return true;
      }
    }
    return false;
  }

  floop() {
    const list = [];
    for (const item of this.game.getLanes(this.owner)) {
      if (item.hasCreature()) {
        const creature = item.getCreature();
        if (creature.damage > 0) list.push(creature);
      }
    }
    this.targetList.push(this.game.rng.pick(list));
    this.doEffect();
  }

  doResult(target) {
    target.heal(this.data.val1);
    return true;
  }
}

class HealSelf extends CreatureScript {
  canFloop() {
    if (this.damage > 0) return true;
    return false;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    target.heal(target.damage);
    return true;
  }
}

class HealSelfAndAdjacent extends CreatureScript {
  canFloop() {
    if (this.damage > 0) return true;
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) {
        const creature = lane.getCreature();
        if (creature.damage > 0) return true;
      }
    }
    return false;
  }

  floop() {
    this.targetList.push(this);
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) {
        const creature = lane.getCreature();
        this.targetList.push(creature);
      }
    }
    this.doEffect();
  }

  doResult(target) {
    target.heal(this.data.val1);
    return true;
  }
}

// ---- heal a chosen creature --------------------------------------------------------

class HealTarget extends CreatureScript {
  canFloop() {
    for (const item of this.game.getLanes(this.owner)) {
      if (item.hasCreature()) {
        const creature = item.getCreature();
        if (creature.damage > 0) return true;
      }
    }
    return false;
  }

  selectionFilter(candidate) {
    if (candidate.hasCreature()) {
      const creature = candidate.getCreature();
      if (creature.damage > 0) return true;
    }
    return false;
  }

  doHealing(target) {
    const creature = target.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    target.heal(this.data.val1);
    return true;
  }

  onTargetSelected(target) {
    this.doHealing(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(this.owner, 'Creature', 'Tap a creature to heal it!');
  }
}

/**
 * Heals the chosen lane's creature and its damaged neighbours by Val1. Any
 * lane next to a damaged creature can be picked, even an empty one.
 */
class HealTargetAdjacent extends CreatureScript {
  canFloop() {
    for (const item of this.game.getLanes(this.owner)) {
      if (item.hasCreature()) {
        const creature = item.getCreature();
        if (creature.damage > 0) return true;
      }
    }
    return false;
  }

  selectionFilter(candidate) {
    if (candidate.hasCreature()) {
      const creature = candidate.getCreature();
      if (creature.damage > 0) return true;
    }
    for (const lane of candidate.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) {
        const creature2 = lane.getCreature();
        if (creature2.damage > 0) return true;
      }
    }
    return false;
  }

  doHealing(target) {
    let creature = target.getCreature();
    // C# put a null target first for an empty lane and the effect threw
    // before healing anyone, so picking an empty lane heals nothing.
    if (creature === null) return;
    this.targetList.push(creature);
    for (const lane of target.adjacentLanes) {
      if (lane !== null && lane.hasCreature()) {
        creature = lane.getCreature();
        if (creature.damage > 0) this.targetList.push(creature);
      }
    }
    this.doEffect();
  }

  doResult(target) {
    target.heal(this.data.val1);
    return true;
  }

  onTargetSelected(target) {
    this.doHealing(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(this.owner, 'Creature', 'Tap a creature to heal it!');
  }
}

/** Heals all damage from a chosen creature of the owner's. */
class HealTargetAll extends CreatureScript {
  canFloop() {
    for (const item of this.game.getLanes(this.owner)) {
      if (item.hasCreature()) {
        const creature = item.getCreature();
        if (creature.damage > 0) return true;
      }
    }
    return false;
  }

  selectionFilter(candidate) {
    if (candidate.hasCreature()) {
      const creature = candidate.getCreature();
      if (creature.damage > 0) return true;
    }
    return false;
  }

  doHealing(target) {
    const creature = target.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  doResult(target) {
    target.heal(target.damage);
    return true;
  }

  onTargetSelected(target) {
    this.doHealing(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(this.owner, 'Creature', 'Tap a creature to heal it!');
  }
}

registerScripts({
  DamageOpponentDamage,
  DamageOpponentDiscardPile,
  DamageOpponentDiscardedCreatures,
  DamageOpponentFloop,
  DamageOpponentHealSelf,
  DamageOpponentIfDamagedLastTurn,
  DamageOpponentLandscapeVariety,
  DamageOpponentLowerATK,
  DamageOpponentMyBuildings,
  DamageOpponentRarity,
  DamageOpponentTheirBuildings,
  DamageRandom,
  DamageTarget,
  DamageTargetFaction,
  DamageTargetHealSelf,
  DestroyOpponentBuilding,
  DrainAdjacentDEFAddATKBonus,
  DrainOpponentATKLowerSelfDEF,
  DrawCards,
  DrawCardsSacrifice,
  DrawCardsTake,
  EqualizeATK,
  FloopAdjacent,
  GainActionPoints,
  HealAdjacent,
  HealAdjacentDEFAndDiscard,
  HealAdjacentDamage,
  HealAll,
  HealAllSacrifice,
  HealHero,
  HealHeroATK,
  HealHeroFloop,
  HealRandom,
  HealSelf,
  HealSelfAndAdjacent,
  HealTarget,
  HealTargetAdjacent,
  HealTargetAll,
});
