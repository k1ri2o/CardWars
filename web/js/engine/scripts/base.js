// CardScript.cs, CreatureScript.cs, BuildingScript.cs, SpellScript.cs and
// LeaderScript.cs, minus Unity visuals and AI scoring.
//
// Where the original paused for the local player to tap a lane or pick a card
// from the discard pile, these classes put a "pending choice" on the game;
// the engine resumes the script when that player answers.
import { CardType, other } from '../consts.js';
import { CardForm, CardItem } from '../cards.js';
import { setDefaultScripts } from '../registry.js';

/** C#'s (int)float conversion truncates toward zero. */
export const toInt = (x) => Math.trunc(x);

/** C#'s Math.Round defaults to banker's rounding. */
export function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

export class CardScript {
  constructor() {
    /** @type {import('../game.js').Game} */
    this.game = null;
    /** @type {CardItem} */
    this.data = null;
    this.currentLane = null;
    this.owner = 0;
    this.targetScript = null;
    this.targetList = [];
    this.flooped = false;
    this.flooping = false;
    this.isSummoning = false;
    this.moved = false;
    this.fresh = false;
    this.used = false;
    this.cardSelected = false;
    this.floopDisabled = false;
    this.protected = false;
    this.cantAttack = false;
    this.helpless = false;
    this.floopBlocked = false;
  }

  // C# names kept as aliases so ported code reads like the original.
  get GameInstance() { return this.game; }
  get Data() { return this.data; }

  // ---- static rules ------------------------------------------------------

  static determineCost(game, player, card) {
    let n = card.cost - game.getDiscount(player, card);
    if (n < 0) n = 0;
    return n;
  }

  static canPlay(game, player, lane, card) {
    if (!game.canPlayCards(player)) return false;
    if (!game.isCastingEnabled(player, card.type)) return false;
    if (lane >= 0) {
      const l = game.getLane(player, lane);
      if ((card.type === CardType.Creature || card.type === CardType.Building)
        && (l.disabled || card.rarity > l.rarityGate)) return false;
    }
    if (card.faction === 'Universal' || game.isLaneOfLandscapeType(player, lane, card.faction)) {
      const cost = card.determineCost(game, player);
      if (game.getMagicPoints(player) >= cost) return true;
    }
    return false;
  }

  determineFloopCost() {
    const mod = this.game.getFloopCostMod(this.owner) + this.currentLane.floopMod;
    let cost = this.data.form.floopCost + mod;
    const flat = this.game.getFlatFloopCost(this.owner);
    if (flat >= 0) cost = flat + mod;
    if (cost < 0) cost = 0;
    return cost;
  }

  // ---- interactive choices -----------------------------------------------

  /**
   * StartTargetSelection: the owner picks one of `side`'s lanes that passes
   * selectionFilter. With no valid lane the selection ends at once, as in
   * the original.
   */
  startTargetSelection(side, selectionType = 'Creature', instruction = '') {
    this.flooping = true;
    const lanes = [];
    for (let i = 0; i < 4; i++) {
      if (this.selectionFilter(this.game.getLane(side, i))) lanes.push(i);
    }
    if (lanes.length === 0) {
      this.endTargetSelection();
      return;
    }
    this.game.setPending({
      kind: 'lane',
      player: this.owner,
      side,
      lanes,
      selectionType,
      prompt: instruction || defaultPrompt(selectionType, side === this.owner),
      script: this,
    });
  }

  endTargetSelection() {
    this.flooping = false;
  }

  /** OpenDiscardPile: the owner picks a card from their own discard pile. */
  openDiscardPile(instruction = '') {
    const pile = this.game.getDiscardPile(this.owner);
    const uids = pile.filter((c) => this.cardFilter(c)).map((c) => c.uid);
    this.cardSelected = false;
    if (uids.length === 0) return;
    this.flooping = true;
    this.game.setPending({
      kind: 'discard',
      player: this.owner,
      side: this.owner,
      cards: uids,
      prompt: instruction || 'Pick a card from your discard pile',
      script: this,
    });
  }

  closeDiscardPile() {
    this.flooping = false;
    this.cardSelected = true;
  }

  selectionFilter(_lane) { return false; }
  onTargetSelected(_lane) {}
  cardFilter(_item) { return false; }
  cardSelection(_item) {}

  // ---- hooks ---------------------------------------------------------------

  canFloop() { return false; }
  cancelFloop() { this.endTargetSelection(); }
  onSummon() { this.isSummoning = true; }
  update() {}
  finishSummoning() {
    this.isSummoning = false;
    this.game.finishSummoning(this);
  }
  onCardLeftPlay(_script) {}
  onCardEnterPlay(_script) {}
  floop() {}
  startTurn() {}
  onOpponentStartTurn() {}
  onCreatureDied(_deadCard) {}
  doResult(_target) { return true; }

  // ---- effects -------------------------------------------------------------

  /** CWFloopActionManager.DoEffect(this, TargetList): DoResult on each target. */
  doEffect() {
    const targets = this.targetList.slice();
    this.targetList.length = 0;
    this.game.emitEffect(this, targets, null);
    for (const t of targets) this.doResult(t);
  }

  /** CWFloopActionManager.DoEffectNeutral: same as doEffect for the rules. */
  doEffectNeutral(targets = this.targetList.slice()) {
    this.targetList.length = 0;
    this.game.emitEffect(this, targets, null);
    for (const t of targets) this.doResult(t);
  }

  /** CWFloopActionManager.DoEffect(this, player): one DoResult(null), aimed at a hero. */
  doEffectPlayer(player) {
    this.game.emitEffect(this, [], player);
    this.doResult(null);
  }

  /** CWFloopActionManager.DoEffect(this, lane): visual only in the original. */
  doEffectLane(laneIndex) {
    this.game.emitEffect(this, [], null, laneIndex);
  }

  endVFX(_context) {}
  endAllVFX() {}

  // ---- helpers shared by many abilities -----------------------------------

  /** AITargetSelection without the AI: lanes of `player` passing selectionFilter. */
  lanesPassingFilter(player) {
    const out = [];
    for (let i = 0; i < 4; i++) {
      const l = this.game.getLane(player, i);
      if (this.selectionFilter(l)) out.push(l);
    }
    return out;
  }

  get opponent() { return other(this.owner); }
}

function defaultPrompt(selectionType, own) {
  const whose = own ? 'your' : "your opponent's";
  switch (selectionType) {
    case 'Building': return `Pick ${whose === 'your' ? 'one of your' : "one of your opponent's"} buildings`;
    case 'Landscape': return `Pick ${whose === 'your' ? 'one of your' : "one of your opponent's"} lanes`;
    default: return `Pick ${whose === 'your' ? 'one of your' : "one of your opponent's"} creatures`;
  }
}

export class CreatureScript extends CardScript {
  constructor() {
    super();
    this.damage = 0;
    this.damageLastTurn = 0;
    this.atkMod = 0;
    this.defMod = 0;
    this.markedForDeath = false;
    this.damageReduction = 0;
    this.damageFactor = 1;
    this.healingFactor = 1;
    this.atkFactor = 1;
    this.defFactor = 1;
  }

  get atk() {
    let n = toInt((this.data.atk + this.atkMod) * this.atkFactor);
    if (n < 0) {
      this.atkMod = -this.data.atk;
      n = 0;
    }
    return n;
  }

  get def() {
    return toInt((this.data.def + this.defMod) * this.defFactor);
  }

  get health() {
    let n = this.def - this.damage;
    if (n < 0) n = 0;
    return n;
  }

  get enemy() {
    return this.currentLane.opponentLane.getCreature();
  }

  get inDanger() {
    const e = this.enemy;
    return !!(e && e.atk > this.health && this.atk < e.health);
  }

  get canWin() {
    return this.enemy === null && this.atk >= this.game.getHealth(other(this.owner));
  }

  getHealthPct() {
    return this.def > 0 ? this.health / this.def : 0;
  }

  heal(amount) {
    amount = roundHalfEven(amount * this.healingFactor);
    const before = this.damage;
    this.damage -= amount;
    if (this.damage < 0) this.damage = 0;
    if (before !== this.damage) this.game.emit({ t: 'heal', side: this.owner, lane: this.currentLane.index, amount: before - this.damage });
  }

  takeDamage(source, amount) {
    let n = amount - this.damageReduction;
    n = toInt(n * this.damageFactor);
    if (n < 0) n = 0;
    this.damage += n;
    this.damageLastTurn = n;
    this.game.emit({ t: 'damage', side: this.owner, lane: this.currentLane.index, amount: n });
    if (this.health <= 0 && source instanceof CreatureScript && source.currentLane && source.currentLane.hasBuilding()) {
      source.currentLane.getBuilding().onCreatureWon();
    }
  }
}

export class BuildingScript extends CardScript {
  constructor() {
    super();
    this.trigger = true;
  }

  onCreatureFlooped() {}
  onCreatureWon() {}
  stopTriggerEffects() { this.trigger = false; }
  resumeTriggerEffects() { this.trigger = true; }
  modifyATK(script, value) { script.atkMod += value; }
  modifyDEF(script, value) { script.defMod += value; }
  triggerEffects() {
    if (this.trigger) this.game.emit({ t: 'building', side: this.owner, lane: this.currentLane.index });
  }
}

export class SpellScript extends CardScript {
  cast() {
    this.doEffectPlayer(this.owner);
  }
}

export class LeaderScript extends SpellScript {
  constructor() {
    super();
    /** @type {import('../cards.js').LeaderItem} */
    this.leader = null;
    this.data = new CardItem(new CardForm({ id: 'Leader', type: CardType.Spell, faction: 'Universal', cost: 0 }));
  }

  static canPlay(game, player, _lane, _card) {
    return game.getLeaderCooldown(player) <= 0;
  }
}

setDefaultScripts({
  creature: CreatureScript,
  building: BuildingScript,
  spell: SpellScript,
  leader: LeaderScript,
  card: CardScript,
});
