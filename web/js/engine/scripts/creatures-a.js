// Creature floop abilities, batch A (ATK/DEF bonuses and penalties, floop
// blocking, direct damage). Ported from Assets/Scripts/Assembly-CSharp.
import { CreatureScript } from './base.js';
import { CardType, FACTIONS, other } from '../consts.js';
import { registerScripts } from '../registry.js';

/** Adjacent lanes of `lane` (skipping the edges) that hold a creature. */
function adjacentCreatureLanes(lane) {
  return lane.adjacentLanes.filter((l) => l !== null && l.hasCreature());
}

/** Every creature on `player`'s side, in lane order. */
function creaturesOf(game, player) {
  const out = [];
  for (const lane of game.getLanes(player)) {
    if (lane.hasCreature()) out.push(lane.getCreature());
  }
  return out;
}

export class ATKBonus extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    target.atkMod += this.data.val1;
    return true;
  }
}

export class ATKBonusAdjacentEmpty extends CreatureScript {
  canFloop() {
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && !lane.hasCreature()) return true;
    }
    return false;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    let n = 0;
    for (const lane of this.currentLane.adjacentLanes) {
      if (lane !== null && !lane.hasCreature()) n++;
    }
    target.atkMod += n * this.data.val1;
    return true;
  }
}

export class ATKBonusAll extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    for (const c of creaturesOf(this.game, this.owner)) this.targetList.push(c);
    this.doEffect();
  }

  doResult(target) {
    target.atkMod += this.data.val1;
    return true;
  }
}

export class ATKBonusDamageSelf extends CreatureScript {
  canFloop() {
    return this.health > this.data.val1;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, this.data.val1);
    target.atkMod += this.data.val2;
    return true;
  }
}

/** Each floop adds one more ATK than the last (+1, then +2, ...). */
export class ATKBonusFloopCount extends CreatureScript {
  constructor() {
    super();
    this.floopCount = 1;
  }

  canFloop() {
    return true;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(_target) {
    this.atkMod += this.floopCount;
    this.floopCount++;
    return true;
  }
}

/** +val1 ATK for every other floop made this turn (this floop is not counted). */
export class ATKBonusFloopTurn extends CreatureScript {
  canFloop() {
    return this.game.getFloopCountTurn(this.owner) > 0;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(_target) {
    const n = this.game.getFloopCountTurn(this.owner) - 1;
    this.atkMod += n * this.data.val1;
    return true;
  }
}

export class ATKBonusForBuilding extends CreatureScript {
  canFloop() {
    return this.game.buildingCount(this.owner) > 0;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature();
  }

  doDamage(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  doResult(target) {
    const n = this.game.buildingCount(this.owner);
    target.atkMod += this.data.val1 * n;
    return true;
  }

  onTargetSelected(target) {
    this.doDamage(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick one of your creatures to boost its Attack');
  }
}

export class ATKDEFBonus extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    target.atkMod += this.data.val1;
    target.defMod += this.data.val2;
    return true;
  }
}

export class ATKHealBonus extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    target.atkMod += this.data.val1;
    target.heal(this.data.val2);
    return true;
  }
}

export class ATKPenaltyCreatures extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    const n = this.game.creatureCount(other(this.owner));
    target.atkMod -= this.data.val1 * n;
    return true;
  }
}

/** Lowers ATK of every opposing creature of faction baseVal1 (a Faction enum index). */
export class ATKPenaltyFaction extends CreatureScript {
  targetFaction() {
    return FACTIONS[this.data.form.baseVal1];
  }

  canFloop() {
    return this.game.creatureFactionCount(other(this.owner), this.targetFaction()) > 0;
  }

  floop() {
    for (const c of creaturesOf(this.game, other(this.owner))) {
      if (c.data.form.faction === this.targetFaction()) this.targetList.push(c);
    }
    this.doEffect();
  }

  doResult(target) {
    target.atkMod -= this.data.val2;
    return true;
  }
}

export class ATKPenaltySacrifice extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
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

export class AdjacentATKBonus extends CreatureScript {
  canFloop() {
    return adjacentCreatureLanes(this.currentLane).length > 0;
  }

  floop() {
    for (const lane of adjacentCreatureLanes(this.currentLane)) this.targetList.push(lane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.atkMod += this.data.val1;
    return true;
  }
}

export class AdjacentDEFBonus extends CreatureScript {
  canFloop() {
    return adjacentCreatureLanes(this.currentLane).length > 0;
  }

  floop() {
    for (const lane of adjacentCreatureLanes(this.currentLane)) this.targetList.push(lane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.defMod += this.data.val1;
    return true;
  }
}

export class BlockFloop extends CreatureScript {
  canFloop() {
    if (this.currentLane.opponentLane.hasCreature()) {
      const c = this.currentLane.opponentLane.getCreature();
      if (!c.floopBlocked) return true;
    }
    return false;
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.floopBlocked = true;
    return true;
  }
}

export class BlockFloopTarget extends CreatureScript {
  canFloop() {
    // The User path of `Owner == User || creature.CanFloop()`: any unblocked creature.
    for (const lane of this.game.getLanes(other(this.owner))) {
      if (lane.hasCreature() && !lane.getCreature().floopBlocked) return true;
    }
    return false;
  }

  selectionFilter(candidate) {
    return candidate.hasCreature() && !candidate.getCreature().floopBlocked;
  }

  block(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.floopBlocked = true;
    return true;
  }

  onTargetSelected(target) {
    this.block(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(other(this.owner), 'Creature', "Pick one of your opponent's creatures to block its Floop");
  }
}

/** Disables the opposing lane until the end of the opponent's next turn. */
export class BlockSummon extends CreatureScript {
  canFloop() {
    return !this.currentLane.opponentLane.disabled;
  }

  floop() {
    this.currentLane.opponentLane.disabled = true;
    this.doEffectLane(this.currentLane.opponentLane.index);
    this.targetList.length = 0;
  }
}

export class BonusATKTarget extends CreatureScript {
  canFloop() {
    return this.game.getLanes(this.owner).some((l) => l.hasCreature());
  }

  selectionFilter(candidate) {
    return candidate.hasCreature();
  }

  doDamage(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.atkMod += this.data.val1;
    return true;
  }

  onTargetSelected(target) {
    this.doDamage(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick one of your creatures to boost its Attack');
  }
}

export class BonusDEFTarget extends CreatureScript {
  canFloop() {
    return this.game.getLanes(this.owner).some((l) => l.hasCreature());
  }

  selectionFilter(candidate) {
    return candidate.hasCreature();
  }

  doDamage(target) {
    this.targetList.push(target.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.defMod += this.data.val1;
    return true;
  }

  onTargetSelected(target) {
    this.doDamage(target);
    this.endTargetSelection();
  }

  floop() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick one of your creatures to boost its Defense');
  }
}

export class CardsATKBonus extends CreatureScript {
  canFloop() {
    return this.game.getCardsInHand(this.owner) > 0;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    const n = this.game.getCardsInHand(this.owner);
    target.atkMod += n * this.data.val1;
    return true;
  }
}

/** Heals itself by the opposing creature's ATK. */
export class ConvertOpponentAttToHP extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    target.heal(target.currentLane.opponentLane.getCreature().atk);
    return true;
  }
}

export class CreatureDEFBonus extends CreatureScript {
  canFloop() {
    return this.game.creatureCount(this.owner) > 0;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    const n = this.game.creatureCount(this.owner);
    target.defMod += n * this.data.val1;
    return true;
  }
}

export class DEFBonus extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    target.defMod += this.data.val1;
    return true;
  }
}

export class DEFBonusBuildings extends CreatureScript {
  canFloop() {
    return this.game.creatureCount(this.owner) > 0 && this.game.buildingCount(this.owner) > 0;
  }

  floop() {
    for (const c of creaturesOf(this.game, this.owner)) this.targetList.push(c);
    this.doEffect();
  }

  doResult(target) {
    const n = this.game.buildingCount(this.owner);
    target.defMod += this.data.val1 * n;
    return true;
  }
}

export class DEFBonusCreatures extends CreatureScript {
  canFloop() {
    return this.game.creatureCount(this.owner) > 0;
  }

  floop() {
    for (const c of creaturesOf(this.game, this.owner)) this.targetList.push(c);
    this.doEffect();
  }

  doResult(target) {
    target.defMod += this.data.val1;
    return true;
  }
}

/** +val1 DEF to one random creature on either side. */
export class DEFBonusRandom extends CreatureScript {
  canFloop() {
    return this.game.hasCreaturesInPlay(this.owner);
  }

  floop() {
    const list = [...creaturesOf(this.game, this.owner), ...creaturesOf(this.game, other(this.owner))];
    this.targetList.push(this.game.rng.pick(list));
    this.doEffect();
  }

  doResult(target) {
    target.defMod += this.data.val1;
    return true;
  }
}

export class DEFPenaltyATKBonusAdjacent extends CreatureScript {
  canFloop() {
    for (const lane of adjacentCreatureLanes(this.currentLane)) {
      if (lane.getCreature().health > this.data.val1) return true;
    }
    return false;
  }

  floop() {
    for (const lane of adjacentCreatureLanes(this.currentLane)) this.targetList.push(lane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.defMod -= this.data.val1;
    target.atkMod += this.data.val2;
    return true;
  }
}

export class DEFPenaltyDamageSelf extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this);
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    if (target === this) target.takeDamage(this, this.data.val1);
    else target.defMod -= this.data.val2;
    return true;
  }
}

export class DamageAll extends CreatureScript {
  canFloop() {
    return this.game.hasCreaturesInPlay(other(this.owner));
  }

  floop() {
    for (const c of creaturesOf(this.game, other(this.owner))) this.targetList.push(c);
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, this.data.val1);
    return true;
  }
}

export class DamageAllDamageOne extends CreatureScript {
  canFloop() {
    return this.game.creatureCount(other(this.owner)) > 0;
  }

  floop() {
    for (const c of creaturesOf(this.game, other(this.owner))) this.targetList.push(c);
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    if (target === this) target.takeDamage(this, this.data.val2);
    else target.takeDamage(this, this.data.val1);
    return true;
  }
}

export class DamageAllHealAll extends CreatureScript {
  canFloop() {
    return this.game.creatureCount(this.owner) > 0 || this.game.creatureCount(other(this.owner)) > 0;
  }

  floop() {
    for (const c of creaturesOf(this.game, this.owner)) this.targetList.push(c);
    for (const c of creaturesOf(this.game, other(this.owner))) this.targetList.push(c);
    this.doEffect();
  }

  doResult(target) {
    if (target.owner === this.owner) target.heal(this.data.val2);
    else target.takeDamage(this, this.data.val1);
    return true;
  }
}

export class DamageAndDiscard extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, this.data.val1);
    this.game.discardCard(this.owner, this.data);
    this.game.removeCardFromPlay(this.owner, this.currentLane.index, CardType.Creature);
    return true;
  }
}

/**
 * Damages the opposing creature; if that hit was enough to kill it, the dead
 * card goes to this creature's owner's hand instead of the discard pile.
 */
export class DamageAndTakeCard extends CreatureScript {
  constructor() {
    super();
    this.card = null;
  }

  canFloop() {
    return this.game.getCardsInHand(this.owner) < 7
      && this.game.laneHasCreature(other(this.owner), this.currentLane.opponentLane.index);
  }

  floop() {
    this.card = null;
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    if (target.health <= this.data.val1) this.card = target.data;
    target.takeDamage(this, this.data.val1);
    return true;
  }

  onCreatureDied(deadCard) {
    if (deadCard === this.card) {
      this.game.placeCardInHand(this.owner, deadCard);
      this.game.removeCardFromDiscardPile(other(this.owner), deadCard);
      this.card = null;
    }
  }
}

export class DamageHero extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    this.doEffectPlayer(other(this.owner));
  }

  doResult(_target) {
    this.game.dealDamage(other(this.owner), this.data.val1);
    return true;
  }
}

export class DamageHeroCards extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    this.doEffectPlayer(other(this.owner));
  }

  doResult(_target) {
    const n = this.game.getCardsInHand(this.owner);
    this.game.dealDamage(other(this.owner), this.data.val1 * n);
    return true;
  }
}

/** val1 damage to the enemy hero for every other floop made this turn. */
export class DamageHeroFloop extends CreatureScript {
  canFloop() {
    return this.game.getFloopCountTurn(this.owner) > 0;
  }

  floop() {
    this.doEffectPlayer(other(this.owner));
  }

  doResult(_target) {
    const n = this.game.getFloopCountTurn(this.owner) - 1;
    this.game.dealDamage(other(this.owner), this.data.val1 * n);
    return true;
  }
}

/** Heals your other creatures by val1 and deals val2 damage to itself. */
export class DamageOneHealAll extends CreatureScript {
  canFloop() {
    return this.game.creatureCount(this.owner) > 0;
  }

  floop() {
    for (const c of creaturesOf(this.game, this.owner)) this.targetList.push(c);
    this.doEffect();
  }

  doResult(target) {
    if (target !== this) target.heal(this.data.val1);
    else target.takeDamage(this, this.data.val2);
    return true;
  }
}

export class DamageOpponent extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, this.data.val1);
    return true;
  }
}

export class DamageOpponentAdjacents extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    for (const lane of adjacentCreatureLanes(this.currentLane.opponentLane)) this.targetList.push(lane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, this.data.val1);
    return true;
  }
}

/** val1 damage to the opposing creature (if any) and to the opposing hero. */
export class DamageOpponentAndHero extends CreatureScript {
  canFloop() {
    return true;
  }

  floop() {
    if (this.currentLane.opponentLane.hasCreature()) {
      this.targetList.push(this.currentLane.opponentLane.getCreature());
      this.doEffect();
    } else {
      this.doEffectPlayer(other(this.owner));
    }
  }

  doResult(target) {
    if (target !== null) target.takeDamage(this, this.data.val1);
    this.game.dealDamage(other(this.owner), this.data.val1);
    return true;
  }
}

export class DamageOpponentAndSelf extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    if (this.currentLane.opponentLane.hasCreature()) {
      this.targetList.push(this.currentLane.opponentLane.getCreature());
    }
    this.targetList.push(this);
    this.doEffect();
  }

  doResult(target) {
    if (target === this) target.takeDamage(this, this.data.val2);
    else target.takeDamage(this, this.data.val1);
    return true;
  }
}

export class DamageOpponentCards extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    const n = this.game.getCardsInHand(this.owner);
    target.takeDamage(this, this.data.val1 * n);
    return true;
  }
}

/** Damages the opposing creature by this creature's current DEF. */
export class DamageOpponentDEF extends CreatureScript {
  canFloop() {
    return this.currentLane.opponentLane.hasCreature();
  }

  floop() {
    this.targetList.push(this.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, this.def);
    return true;
  }
}

registerScripts({
  ATKBonus,
  ATKBonusAdjacentEmpty,
  ATKBonusAll,
  ATKBonusDamageSelf,
  ATKBonusFloopCount,
  ATKBonusFloopTurn,
  ATKBonusForBuilding,
  ATKDEFBonus,
  ATKHealBonus,
  ATKPenaltyCreatures,
  ATKPenaltyFaction,
  ATKPenaltySacrifice,
  AdjacentATKBonus,
  AdjacentDEFBonus,
  BlockFloop,
  BlockFloopTarget,
  BlockSummon,
  BonusATKTarget,
  BonusDEFTarget,
  CardsATKBonus,
  ConvertOpponentAttToHP,
  CreatureDEFBonus,
  DEFBonus,
  DEFBonusBuildings,
  DEFBonusCreatures,
  DEFBonusRandom,
  DEFPenaltyATKBonusAdjacent,
  DEFPenaltyDamageSelf,
  DamageAll,
  DamageAllDamageOne,
  DamageAllHealAll,
  DamageAndDiscard,
  DamageAndTakeCard,
  DamageHero,
  DamageHeroCards,
  DamageHeroFloop,
  DamageOneHealAll,
  DamageOpponent,
  DamageOpponentAdjacents,
  DamageOpponentAndHero,
  DamageOpponentAndSelf,
  DamageOpponentCards,
  DamageOpponentDEF,
});
