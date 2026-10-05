// Spells, batch A: ActionPointCreatures ... DiscardForPoints.
import { registerScripts } from '../registry.js';
import { CardScript, SpellScript } from './base.js';
import { FACTIONS, other } from '../consts.js';

// (SelectionType)n: Creature, Building, Landscape.
const SELECTION_TYPES = ['Creature', 'Building', 'Landscape'];

// The original's AI-only check (add the points, HasLegalMove, take them back,
// guarded by a static Locked flag) is dropped from these canPlay overrides.
class ActionPointCreatures extends SpellScript {
  static canPlay(game, player, lane, card) {
    let flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      const num = game.creatureCount(player);
      if (num <= 0) flag = false;
    }
    return flag;
  }

  cast() {
    this.doEffectPlayer(this.owner);
  }

  doResult(_target) {
    const points = this.game.creatureCount(this.owner);
    this.game.addMagicPoints(this.owner, points);
    return true;
  }
}

/** Gains a magic point per distinct landscape type on both boards. */
class ActionPointLandscapes extends SpellScript {
  static canPlay(game, player, lane, card) {
    return CardScript.canPlay(game, player, lane, card);
  }

  cast() {
    this.doEffectPlayer(this.owner);
  }

  doResult(_target) {
    const points = this.game.landscapeTypeCount();
    this.game.addMagicPoints(this.owner, points);
    return true;
  }
}

/**
 * Shared body of AttackCreatureCorn/Plains/Swamp/Cotton/Sand (identical in the
 * C# apart from the damage source in Sand): one of your creatures of faction
 * (Faction)BaseVal1 hits the creature facing it for its ATK.
 */
class AttackCreatureFaction extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      const lanes = game.getLanes(player);
      for (const item of lanes) {
        if (item.hasCreature() && item.getCreature().data.form.faction === FACTIONS[card.baseVal1]
          && item.opponentLane.hasCreature()) return true;
      }
      return false;
    }
    return flag;
  }

  selectionFilter(candidate) {
    if (candidate.hasCreature() && candidate.getCreature().data.form.faction === FACTIONS[this.data.form.baseVal1]
      && candidate.opponentLane.hasCreature()) return true;
    return false;
  }

  // Named HealTarget in the C#.
  healTarget(target) {
    const creature = target.getCreature();
    this.targetList.push(creature.currentLane.opponentLane.getCreature());
    this.doEffect();
  }

  onTargetSelected(target) {
    this.healTarget(target);
    this.endTargetSelection();
  }

  cast() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick one of your creatures to attack');
  }

  doResult(target) {
    const creature = target.currentLane.opponentLane.getCreature();
    target.takeDamage(creature, creature.atk);
    return true;
  }
}

class AttackCreatureCorn extends AttackCreatureFaction {}
class AttackCreatureCotton extends AttackCreatureFaction {}
class AttackCreaturePlains extends AttackCreatureFaction {}
class AttackCreatureSwamp extends AttackCreatureFaction {}

class AttackCreatureSand extends AttackCreatureFaction {
  doResult(target) {
    const creature = target.currentLane.opponentLane.getCreature();
    // The C# passes the spell, not the attacking creature, as the damage
    // source here, so a building in the attacker's lane never hears of a kill.
    target.takeDamage(this, creature.atk);
    return true;
  }
}

/** An enemy creature takes damage equal to its own ATK. */
class AttackSelf extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      if (game.hasCreaturesInPlay(other(player))) return true;
      return false;
    }
    return flag;
  }

  selectionFilter(candidate) {
    if (candidate.hasCreature()) return true;
    return false;
  }

  returnTarget(target) {
    const creature = target.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  onTargetSelected(target) {
    this.returnTarget(target);
    this.endTargetSelection();
  }

  cast() {
    this.startTargetSelection(other(this.owner), 'Creature', "Pick one of your opponent's creatures");
  }

  doResult(target) {
    target.takeDamage(this, target.atk);
    return true;
  }
}

class BlockTargetFloop extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      const lanes = game.getLanes(other(player));
      for (const item of lanes) {
        if (item.hasCreature()) {
          const creature = item.getCreature();
          // The C# also required creature.CanFloop() when the AI cast it.
          if (!creature.floopBlocked) return true;
        }
      }
      return false;
    }
    return flag;
  }

  selectionFilter(candidate) {
    if (candidate.hasCreature()) {
      const creature = candidate.getCreature();
      if (!creature.floopBlocked) return true;
    }
    return false;
  }

  returnTargetToHand(target) {
    const creature = target.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  onTargetSelected(target) {
    this.returnTargetToHand(target);
    this.endTargetSelection();
  }

  cast() {
    this.startTargetSelection(other(this.owner), 'Creature', "Pick one of your opponent's creatures");
  }

  doResult(target) {
    target.floopBlocked = true;
    return true;
  }
}

/** One of your damaged creatures gets ATK equal to its damage. */
class DamageToATK extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      const lanes = game.getLanes(player);
      for (const item of lanes) {
        if (item.hasCreature()) {
          const creature = item.getCreature();
          if (creature.damage > 0) return true;
        }
      }
      return false;
    }
    return flag;
  }

  selectionFilter(candidate) {
    if (candidate.hasCreature() && candidate.getCreature().damage > 0) return true;
    return false;
  }

  returnTarget(target) {
    const creature = target.getCreature();
    this.targetList.push(creature);
    this.doEffect();
  }

  onTargetSelected(target) {
    this.returnTarget(target);
    this.endTargetSelection();
  }

  cast() {
    this.startTargetSelection(this.owner, 'Creature', 'Pick one of your damaged creatures');
  }

  doResult(target) {
    // The C# subtracts Form.BaseATK (the level-1 value), not Data.ATK, so a
    // creature above level 1 ends up with more ATK than its damage.
    const atkMod = target.damage - target.data.form.baseATK;
    target.atkMod = atkMod;
    return true;
  }
}

/** Destroys every building and creature in a lane, on both sides. */
class DestroyBuildingLane extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      if (game.buildingCount(other(player)) > 0 || game.creatureCount(other(player)) > 0) return true;
      return false;
    }
    return flag;
  }

  selectionFilter(candidate) {
    if (candidate.hasBuilding() || candidate.hasCreature()) return true;
    return false;
  }

  destroyTarget(target) {
    if (target.hasBuilding()) this.targetList.push(target.getBuilding());
    if (target.hasCreature()) this.targetList.push(target.getCreature());
    if (target.opponentLane.hasBuilding()) this.targetList.push(target.opponentLane.getBuilding());
    if (target.opponentLane.hasCreature()) this.targetList.push(target.opponentLane.getCreature());
    this.doEffectNeutral(this.targetList.slice());
    this.targetList.length = 0;
  }

  onTargetSelected(target) {
    this.destroyTarget(target);
    this.endTargetSelection();
  }

  cast() {
    this.startTargetSelection(other(this.owner), 'Landscape', "Pick one of your opponent's lanes");
  }

  doResult(target) {
    this.game.removeCardFromPlay(target.owner, target.currentLane.index, target.data.form.type);
    this.game.discardCard(target.owner, target.data);
    return true;
  }
}

/** Destroy one of your cards of type (CardType)BaseVal1 and gain 4 magic points. */
class DestroyEntityForAction extends SpellScript {
  // The AI-only HasLegalMove check and its Locked guard are dropped.
  static canPlay(game, player, lane, card) {
    let flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      const num = game.cardCount(player, card.baseVal1);
      if (num <= 0) flag = false;
    }
    return flag;
  }

  selectionFilter(candidate) {
    if (candidate.hasCard(this.data.form.baseVal1)) return true;
    return false;
  }

  sacrificeTarget(target) {
    const script = target.getScript(this.data.form.baseVal1);
    this.targetList.push(script);
    this.doEffect();
    this.doEffectPlayer(this.owner);
  }

  onTargetSelected(target) {
    this.sacrificeTarget(target);
    this.endTargetSelection();
  }

  cast() {
    const type = SELECTION_TYPES[this.data.form.baseVal1];
    this.startTargetSelection(this.owner, type, `Pick one of your ${type === 'Building' ? 'buildings' : 'creatures'} to destroy`);
  }

  doResult(target) {
    if (target !== null) {
      this.game.removeCardFromPlay(this.owner, target.currentLane.index, this.data.form.baseVal1);
      this.game.discardCard(this.owner, target.data);
    } else {
      this.game.addMagicPoints(this.owner, 4);
    }
    return true;
  }
}

/** Destroy one of your cards of type (CardType)BaseVal1 and draw BaseVal2 cards. */
class DestroyEntityForCards extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      if (game.cardCount(player, card.baseVal1) > 0 && game.getDeck(player).cardCount() > 0) return true;
      return false;
    }
    return flag;
  }

  selectionFilter(candidate) {
    if (candidate.hasCard(this.data.form.baseVal1)) return true;
    return false;
  }

  sacrificeTarget(target) {
    const script = target.getScript(this.data.form.baseVal1);
    this.targetList.push(script);
    this.doEffect();
  }

  onTargetSelected(target) {
    this.sacrificeTarget(target);
    this.endTargetSelection();
  }

  cast() {
    const type = SELECTION_TYPES[this.data.form.baseVal1];
    this.startTargetSelection(this.owner, type, `Pick one of your ${type === 'Building' ? 'buildings' : 'creatures'} to destroy`);
  }

  doResult(target) {
    this.game.removeCardFromPlay(this.owner, target.currentLane.index, this.data.form.baseVal1);
    this.game.discardCard(this.owner, target.data);
    for (let i = 0; i < this.data.form.baseVal2; i++) this.game.drawCard(this.owner);
    return true;
  }
}

/** Destroys every enemy creature of rarity BaseVal1 or higher. */
class DestroyHigherRarity extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      const lanes = game.getLanes(other(player));
      for (const item of lanes) {
        if (item.hasCreature()) {
          const creature = item.getCreature();
          if (creature.data.form.rarity >= card.baseVal1) return true;
        }
      }
      return false;
    }
    return flag;
  }

  cast() {
    const lanes = this.game.getLanes(other(this.owner));
    for (const item of lanes) {
      if (item.hasCreature()) {
        const creature = item.getCreature();
        if (creature.data.form.rarity >= this.data.form.baseVal1) this.targetList.push(creature);
      }
    }
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, target.health);
    return true;
  }
}

/** Destroys every enemy creature of rarity BaseVal1 or lower. */
class DestroyLowerRarity extends SpellScript {
  static canPlay(game, player, lane, card) {
    const flag = CardScript.canPlay(game, player, lane, card);
    if (flag) {
      const lanes = game.getLanes(other(player));
      for (const item of lanes) {
        if (item.hasCreature()) {
          const creature = item.getCreature();
          if (creature.data.form.rarity <= card.baseVal1) return true;
        }
      }
      return false;
    }
    return flag;
  }

  cast() {
    const lanes = this.game.getLanes(other(this.owner));
    for (const item of lanes) {
      if (item.hasCreature()) {
        const creature = item.getCreature();
        if (creature.data.form.rarity <= this.data.form.baseVal1) this.targetList.push(creature);
      }
    }
    this.doEffect();
  }

  doResult(target) {
    target.takeDamage(this, target.health);
    return true;
  }
}

/** Nothing can be summoned into the chosen enemy lane until that player's turn ends. */
class DisableLane extends SpellScript {
  selectionFilter(_candidate) {
    return true;
  }

  returnTarget(target) {
    target.disabled = true;
    this.doEffectLane(target.index);
  }

  onTargetSelected(target) {
    this.returnTarget(target);
    this.endTargetSelection();
  }

  cast() {
    // The C# passed SelectionType.Creature here (its AI path used Landscape);
    // every lane, empty or not, is a valid pick, so ask for a lane.
    this.startTargetSelection(other(this.owner), 'Landscape', "Pick one of your opponent's lanes");
  }
}

/** Discards your whole hand and gains BaseVal1 magic points. */
class DiscardForPoints extends SpellScript {
  // The AI-only HasLegalMove check and its Locked guard are dropped.
  static canPlay(game, player, lane, card) {
    return CardScript.canPlay(game, player, lane, card);
  }

  cast() {
    this.doEffectPlayer(this.owner);
  }

  doResult(_target) {
    const hand = this.game.getHand(this.owner);
    while (hand.length > 0) {
      const card = hand[0];
      this.game.discardCard(this.owner, card);
      hand.splice(0, 1);
    }
    this.game.addMagicPoints(this.owner, this.data.form.baseVal1);
    return true;
  }
}

registerScripts({
  ActionPointCreatures,
  ActionPointLandscapes,
  AttackCreatureCorn,
  AttackCreatureCotton,
  AttackCreaturePlains,
  AttackCreatureSand,
  AttackCreatureSwamp,
  AttackSelf,
  BlockTargetFloop,
  DamageToATK,
  DestroyBuildingLane,
  DestroyEntityForAction,
  DestroyEntityForCards,
  DestroyHigherRarity,
  DestroyLowerRarity,
  DisableLane,
  DiscardForPoints,
});
