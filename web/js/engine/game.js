// The rules engine: a port of GameState.cs plus the turn and battle flow that
// the Unity project spread over BattlePhaseManager, BattleManagerScript,
// CWBattleSequenceController, CreatureBattleScript and CWStartTurnTrigger.
//
// The host runs one Game. Players change it only through apply(player, action);
// everyone (host included) renders snapshot(player).
import {
  CardType, CARDS_TO_DEAL, MAX_HAND, LANE_COUNT, STARTING_MAGIC_POINTS, MAX_MAGIC_POINTS,
  NONE, LANDSCAPES, other, Phase,
} from './consts.js';
import { Lane } from './lane.js';
import { Rng } from './rng.js';
import { CreatureScript, LeaderScript, SpellScript, toInt } from './scripts/base.js';

const pair = (f) => [f(0), f(1)];

export const RING_SECONDS_PER_SPIN = 1.1;

export class Game {
  /**
   * @param {import('./cards.js').CardDb} db
   * @param {{seed?: number, ring?: boolean, cardLevel?: number, heroLevel?: number}} opts
   */
  constructor(db, opts = {}) {
    this.db = db;
    this.opts = { ring: true, cardLevel: 1, heroLevel: 3, ...opts };
    this.rng = new Rng(opts.seed);

    this.lanes = [[], []];
    for (let i = 0; i < 2; i++) {
      let prev = null;
      for (let j = 0; j < LANE_COUNT; j++) {
        const lane = new Lane(i, j);
        this.lanes[i][j] = lane;
        lane.adjacentLanes[0] = prev;
        if (prev) prev.adjacentLanes[1] = lane;
        prev = lane;
      }
    }
    for (let j = 0; j < LANE_COUNT; j++) {
      this.lanes[0][j].opponentLane = this.lanes[1][3 - j];
      this.lanes[1][3 - j].opponentLane = this.lanes[0][j];
    }

    this.names = ['Player 1', 'Player 2'];
    this.decks = [null, null];
    this.hands = [[], []];
    this.discardPiles = [[], []];
    this.summonedCards = [new Map(), new Map()];
    this.magicPoints = [0, 0];
    this.bonusPoints = [0, 0];
    this.spellPoints = [0, 0];
    this.floopCountTurn = [0, 0];
    this.floopCountGame = [0, 0];
    this.spellsCast = [0, 0];
    this.creaturesSummoned = [0, 0];
    this.creaturesRemoved = [0, 0];
    /** canCast[cardType][player] */
    this.canCast = [[true, true], [true, true], [true, true]];
    this.canFloop = [true, true];
    this.canPlay = [true, true];
    this.health = [25, 25];
    this.maxHealth = [25, 25];
    this.minHealth = [0, 0];
    this.leaderCooldown = [0, 0];
    this.attacked = [false, false];
    this.overrideLandscapes = [NONE, NONE];
    this.fakeLandscapes = [[], []];
    this.randomizeSummon = [false, false];
    this.spellsInEffect = [[], []];
    this.persistentSpellsInEffect = [[], []];
    this.discounts = [[], []];
    this.floopCostMods = [0, 0];
    this.flatFloopCost = [-1, -1];
    this.atkPenalty = [0, 0];
    this.currentMagicPoints = STARTING_MAGIC_POINTS;
    // The original kept these as single values because only the local player
    // had a battle ring; with two humans each player gets their own.
    this.extraMagicPoints = [0, 0];
    this.hitAreaModifier = [0, 0];
    this.critAreaModifier = [0, 0];
    this.defenseAreaModifier = [0, 0];
    this.defenseAreaCritModifier = [0, 0];
    this.stealing = false;

    this.firstPlayer = 0;
    this.turn = 0;
    this.activePlayer = 0;
    this.phase = Phase.Setup;
    this.pending = null;
    this.battle = null;
    this.winner = null;
    this.endReason = null;
    this.events = [];
    this.seq = 0;
    this.log = [];
  }

  // =========================================================================
  // Match setup
  // =========================================================================

  /**
   * @param {Array<{leader:string, landscapes:string[], cards:string[], name?:string}>} deckDescs
   * @param {string[]} names
   * @param {number} [firstPlayer] random when omitted, like the ketchup bottle
   */
  start(deckDescs, names = this.names, firstPlayer) {
    this.names = names.slice();
    for (let p = 0; p < 2; p++) {
      this.decks[p] = this.db.buildDeck(deckDescs[p], {
        cardLevel: this.opts.cardLevel,
        heroLevel: this.opts.heroLevel,
      });
      for (let i = 0; i < LANE_COUNT; i++) this.lanes[p][i].type = this.decks[p].landscapes[i] || NONE;
      this.health[p] = this.maxHealth[p] = this.decks[p].leader.hp;
      this.minHealth[p] = 0;
    }
    for (let p = 0; p < 2; p++) {
      const deck = this.decks[p];
      deck.shuffle(this.rng);
      this.leaderCooldown[p] = deck.leader.form.cooldown;
      this.hands[p] = [];
      for (let i = 0; i < CARDS_TO_DEAL; i++) {
        const c = deck.dealCard();
        if (c) this.hands[p].push(c);
      }
      this.summonedCards[p].clear();
    }
    this.firstPlayer = firstPlayer ?? this.rng.range(0, 2);
    this.setMagicPoints(this.firstPlayer, STARTING_MAGIC_POINTS);
    this.emit({ t: 'start', first: this.firstPlayer });
    this.turn = 1;
    this.beginTurn(this.firstPlayer);
    return this;
  }

  /** CWStartTurnTrigger: EndTurn(!player) then StartTurn(player). */
  beginTurn(player) {
    this.activePlayer = player;
    this.phase = Phase.Setup;
    this.battle = null;
    this.endTurn(other(player));
    this.emit({ t: 'turn', player, turn: this.turn });
    this.startTurn(player);
    this.settle();
  }

  // =========================================================================
  // Player actions
  // =========================================================================

  /**
   * Applies one action for `player`. Returns { ok: true } or { ok: false, error }.
   * Actions:
   *   {type:'play', uid, lane}       play a card from hand (lane -1 for a spell)
   *   {type:'floop', lane}           floop the creature in your lane
   *   {type:'leader'}                use the hero power
   *   {type:'target', lane}          answer a lane choice
   *   {type:'discard', uid}          answer a discard-pile choice
   *   {type:'ring', result}          'hit' | 'crit' | 'miss' for the pending attack
   *   {type:'endTurn'}               finish setup and go to battle
   *   {type:'concede'}
   */
  apply(player, action) {
    if (!action || typeof action.type !== 'string') return fail('Bad action');
    if (this.phase === Phase.GameOver) return fail('The match is over');
    if (action.type === 'concede') {
      this.finish(other(player), 'concede');
      return ok();
    }
    try {
      const r = this.dispatch(player, action);
      if (r.ok) this.settle();
      return r;
    } catch (err) {
      // A broken ability must never wedge the match: log it, drop any choice
      // it left open and carry on.
      console.error('Engine error on', action, err);
      this.emit({ t: 'error', message: String(err && err.message || err) });
      if (this.pending && this.pending.kind !== 'ring') this.pending = null;
      this.settle();
      return { ok: true, warning: String(err && err.message || err) };
    }
  }

  dispatch(player, a) {
    const p = this.pending;
    if (p) {
      if (p.player !== player) return fail('Waiting for the other player');
      if (p.kind === 'lane' && a.type === 'target') return this.answerLane(a.lane);
      if (p.kind === 'discard' && a.type === 'discard') return this.answerDiscard(a.uid);
      if (p.kind === 'ring' && a.type === 'ring') return this.answerRing(a.result);
      return fail('Finish the current choice first');
    }
    if (player !== this.activePlayer) return fail('Not your turn');
    if (this.phase !== Phase.Setup) return fail('Not now');
    switch (a.type) {
      case 'play': return this.actPlay(player, a.uid, a.lane);
      case 'floop': return this.actFloop(player, a.lane);
      case 'leader': return this.actLeader(player);
      case 'endTurn': return this.actEndTurn(player);
      default: return fail('Unknown action');
    }
  }

  actPlay(player, uid, laneIdx) {
    const card = this.hands[player].find((c) => c.uid === uid);
    if (!card) return fail('That card is not in your hand');
    const form = card.form;
    if (form.type === CardType.Spell) {
      if (!form.canPlay(this, player, -1)) return fail("Can't cast that now");
      this.castSpell(player, card);
      return ok();
    }
    if (!(laneIdx >= 0 && laneIdx < LANE_COUNT)) return fail('Pick a lane');
    if (!form.canPlay(this, player, laneIdx)) return fail("Can't play that there");
    this.summon(player, laneIdx, card);
    return ok();
  }

  actFloop(player, laneIdx) {
    if (!(laneIdx >= 0 && laneIdx < LANE_COUNT)) return fail('Pick a lane');
    const lane = this.getLane(player, laneIdx);
    if (!lane.hasCreature()) return fail('No creature there');
    const script = lane.getCreature();
    if (!this.isFloopingEnabled(player) || !this.canFloopCard(player, script)) return fail("Can't floop that now");
    this.floopCard(player, laneIdx, CardType.Creature);
    return ok();
  }

  actLeader(player) {
    if (!this.isLeaderAbilityReady(player)) return fail('Hero power is not ready');
    this.useLeaderAbility(player);
    return ok();
  }

  actEndTurn(player) {
    if (this.turn === 1) {
      // The first turn of the match has no battle.
      this.finishBattle();
      return ok();
    }
    this.startBattle(player);
    return ok();
  }

  answerLane(laneIdx) {
    const p = this.pending;
    if (!p.lanes.includes(laneIdx)) return fail('Pick a highlighted lane');
    this.pending = null;
    p.script.onTargetSelected(this.getLane(p.side, laneIdx));
    return ok();
  }

  answerDiscard(uid) {
    const p = this.pending;
    if (!p.cards.includes(uid)) return fail('Pick a highlighted card');
    const item = this.discardPiles[p.side].find((c) => c.uid === uid);
    this.pending = null;
    if (item) p.script.cardSelection(item);
    return ok();
  }

  answerRing(result) {
    const p = this.pending;
    const r = result === 'crit' ? 'crit' : result === 'miss' ? 'miss' : 'hit';
    this.pending = null;
    this.resolveAttack(p.lane, r);
    this.battle.index++;
    this.advanceBattle();
    return ok();
  }

  setPending(p) {
    this.pending = p;
  }

  /** Runs after every action: continuous effects, deaths, game over. */
  settle() {
    for (let guard = 0; guard < 8; guard++) {
      this.update();
      if (!this.checkForDeaths()) break;
    }
    this.checkGameOver();
  }

  checkGameOver() {
    if (this.phase === Phase.GameOver) return;
    const dead0 = this.health[0] <= 0;
    const dead1 = this.health[1] <= 0;
    if (dead0 && dead1) this.finish(other(this.activePlayer), 'hero');
    else if (dead0) this.finish(1, 'hero');
    else if (dead1) this.finish(0, 'hero');
  }

  finish(winner, reason) {
    if (this.phase === Phase.GameOver) return;
    this.phase = Phase.GameOver;
    this.winner = winner;
    this.endReason = reason;
    this.pending = null;
    this.emit({ t: 'gameover', winner, reason });
  }

  // =========================================================================
  // Battle (CWBattleSequenceController / CreatureBattleScript)
  // =========================================================================

  startBattle(player) {
    this.phase = Phase.Battle;
    for (let i = 0; i < LANE_COUNT; i++) {
      if (this.laneHasCreature(player, i)) this.getCreature(player, i).damageLastTurn = 0;
    }
    const order = player === 0 ? [0, 1, 2, 3] : [3, 2, 1, 0];
    this.battle = { player, order, index: 0 };
    this.emit({ t: 'battle', player });
    this.advanceBattle();
  }

  advanceBattle() {
    const b = this.battle;
    while (b.index < 4) {
      if (this.phase === Phase.GameOver) return;
      const laneIdx = b.order[b.index];
      if (!this.laneHasCreature(b.player, laneIdx)) { b.index++; continue; }
      const attacker = this.getCreature(b.player, laneIdx);
      if (this.opts.ring && this.attackWouldLand(attacker)) {
        this.pending = { kind: 'ring', player: b.player, side: b.player, lane: laneIdx, ...this.ringFor(b.player, laneIdx) };
        return;
      }
      this.resolveAttack(laneIdx, 'hit');
      this.settle();
      b.index++;
    }
    if (this.phase !== Phase.GameOver) this.finishBattle();
  }

  attackWouldLand(attacker) {
    if (attacker.atk <= 0 || attacker.cantAttack) return false;
    const opp = attacker.currentLane.opponentLane;
    if (opp.hasCreature() && opp.getCreature().protected) return false;
    return true;
  }

  /** Ring geometry for the attacker's UI (CWBattleSequenceController.SetUpRing). */
  ringFor(player, laneIdx) {
    const leader = this.decks[player].leader.form;
    const defender = other(player);
    let hit = leader.hitArea * (1 + this.hitAreaModifier[player]);
    let crit = leader.critArea * (1 + this.critAreaModifier[player]);
    // The original's defense ring changed nothing, so its defense-area floops
    // (IncreaseDefenseArea and friends) instead shrink the attacker's ring.
    hit *= Math.max(0, 1 - this.defenseAreaModifier[defender]);
    crit *= Math.max(0, 1 - this.defenseAreaCritModifier[defender]);
    if (hit + crit > 1) hit = 1 - crit;
    const lane = this.getLane(player, laneIdx);
    if (!lane.opponentLane.hasCreature()) hit = 1 - crit;
    const start = this.rng.rangeFloat(0, Math.max(0, 1 - hit - crit));
    const spin = this.rng.rangeFloat(leader.spinMin, leader.spinMax) / 0.2 * RING_SECONDS_PER_SPIN;
    return { hitStart: start, hitEnd: start + hit, critEnd: start + hit + crit, spin, critMod: leader.critDamageMod };
  }

  /** BattleAction + CreatureBattleScript.DealDamage for one lane. */
  resolveAttack(laneIdx, result) {
    const player = this.battle.player;
    if (!this.laneHasCreature(player, laneIdx)) return;
    const attacker = this.getCreature(player, laneIdx);
    const lane = attacker.currentLane;
    const oppLane = lane.opponentLane;
    let stop = true;
    if (oppLane.hasCreature()) {
      if (!oppLane.getCreature().protected && !attacker.cantAttack) stop = false;
    } else if (!attacker.cantAttack) {
      stop = false;
    }
    const critMod = this.decks[player].leader.form.critDamageMod;
    this.emit({ t: 'attack', side: player, lane: laneIdx, result, blocked: stop });
    if (stop) return;
    if (oppLane.hasCreature() && !oppLane.getCreature().helpless) {
      const target = oppLane.getCreature();
      let atk = attacker.atk;
      if (atk < 0) atk = 0;
      if (result === 'crit') atk = toInt(atk * critMod);
      target.takeDamage(attacker, atk);
    } else {
      let dmg = attacker.atk - this.getATKPenalty(player);
      if (dmg < 0) dmg = 0;
      if (result === 'crit') dmg = toInt(dmg * critMod);
      this.dealDamage(other(player), dmg, oppLane.index);
    }
  }

  /** BattleManagerScript.P1BattleFinished / P2BattleFinished, then the next turn. */
  finishBattle() {
    const player = this.activePlayer;
    this.hitAreaModifier[player] = 0;
    this.critAreaModifier[player] = 0;
    this.defenseAreaModifier[other(player)] = 0;
    this.defenseAreaCritModifier[other(player)] = 0;
    this.turn++;
    this.beginTurn(other(player));
  }

  // =========================================================================
  // GameState.cs
  // =========================================================================

  emit(ev) {
    ev.seq = ++this.seq;
    this.events.push(ev);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  emitEffect(source, targets, heroPlayer, laneIndex) {
    const ev = {
      t: 'effect',
      kind: source instanceof LeaderScript ? 'leader' : source.data.form.type === CardType.Spell ? 'spell' : 'floop',
      side: source.owner,
      card: source instanceof LeaderScript ? (source.leader && source.leader.form.id) : source.data.form.id,
      script: source instanceof LeaderScript ? (source.leader && source.leader.form.scriptName) : source.data.form.scriptName,
      targets: targets.filter(Boolean).map((t) => ({ side: t.owner, lane: t.currentLane ? t.currentLane.index : -1, type: t.data.form.type })),
    };
    if (source.currentLane) ev.lane = source.currentLane.index;
    if (heroPlayer !== null && heroPlayer !== undefined) ev.hero = heroPlayer;
    if (laneIndex !== undefined) ev.laneTarget = laneIndex;
    this.emit(ev);
  }

  getCharacter(player) { return this.decks[player] ? this.decks[player].leader.form.character : null; }

  setHealthBoth(user, opponent) {
    this.health[0] = this.maxHealth[0] = user;
    this.health[1] = this.maxHealth[1] = opponent;
  }

  getMaxHealth(player) { return this.maxHealth[player]; }
  setMinHealth(user, opponent) { this.minHealth[0] = user; this.minHealth[1] = opponent; }
  getMinHealth(player) { return this.minHealth[player]; }

  getLeader(player) { return this.decks[player] ? this.decks[player].leader : null; }
  getLeaderCooldown(player) { return this.leaderCooldown[player]; }
  isLeaderAbilityReady(player) { return this.getLeader(player).canPlay(this, player); }

  useLeaderAbility(player) {
    const leader = this.getLeader(player);
    const script = leader.instanceScript();
    script.game = this;
    script.owner = player;
    script.leader = leader;
    script.data.form.name = leader.form.name;
    script.data.form.scriptName = leader.form.scriptName;
    script.data.form.rawDescription = leader.description;
    this.emit({ t: 'leader', side: player, leader: leader.form.id });
    script.cast();
    this.leaderCooldown[player] = leader.form.cooldown;
  }

  wasAttacked(player) { return this.attacked[player]; }
  getLane(player, lane) { return this.lanes[player][lane]; }

  /** GameState.DealDamage: positive damages the hero, negative heals, clamped. */
  dealDamage(player, damage, lane) {
    const before = this.health[player];
    this.health[player] -= damage;
    if (this.health[player] < this.minHealth[player]) this.health[player] = this.minHealth[player];
    if (this.health[player] > this.maxHealth[player]) this.health[player] = this.maxHealth[player];
    if (damage > 0) this.attacked[player] = true;
    const delta = before - this.health[player];
    if (delta !== 0) this.emit({ t: delta > 0 ? 'heroDamage' : 'heroHeal', side: player, amount: Math.abs(delta), lane: lane ?? -1 });
  }

  getHealth(player) { return this.health[player]; }
  setHealth(player, health) {
    const before = this.health[player];
    this.health[player] = health;
    if (before !== health) this.emit({ t: health < before ? 'heroDamage' : 'heroHeal', side: player, amount: Math.abs(before - health) });
  }
  setMaxHealth(player) { this.setHealth(player, this.getMaxHealth(player)); }

  setMagicPoints(player, points) { this.magicPoints[player] = points; }
  getMagicPoints(player) { return this.magicPoints[player]; }
  addMagicPoints(player, points) { this.magicPoints[player] += points; }

  getFloopCountTurn(player) { return this.floopCountTurn[player]; }
  getFloopCountGame(player) { return this.floopCountGame[player]; }
  addBonusPoints(player, points) { this.bonusPoints[player] += points; }
  getSpellPoints(player) { return this.spellPoints[player]; }
  setSpellPoints(player, points) { this.spellPoints[player] = points; }
  addSpellPoints(player, points) { this.spellPoints[player] += points; }
  resetExtraMagicPoints(player) { this.extraMagicPoints[player] = 0; }

  canPlayCard(player) {
    const hand = this.getHand(player);
    for (const item of hand) {
      const form = item.form;
      if (form.type === CardType.Spell) {
        if (form.canPlay(this, player, -1)) return true;
        continue;
      }
      for (let j = 0; j < LANE_COUNT; j++) {
        const lane = this.getLane(player, j);
        if ((form.type !== CardType.Creature || !lane.hasCreature())
          && (form.type !== CardType.Building || !lane.hasBuilding())
          && form.canPlay(this, player, j)) return true;
      }
    }
    return false;
  }

  canFloopCreature(player) {
    for (let i = 0; i < LANE_COUNT; i++) {
      const lane = this.getLane(player, i);
      if (lane.hasCreature() && this.canFloopCard(player, lane.getCreature())) return true;
    }
    return false;
  }

  hasLegalMove(player) {
    return this.canPlayCard(player) || this.canFloopCreature(player);
  }

  getHand(player) { return this.hands[player]; }
  getCardInHand(player, idx) { return this.hands[player][idx] ?? null; }
  getCardsInHand(player) { return this.hands[player].length; }

  drawCard(player) {
    const deck = this.decks[player];
    const hand = this.hands[player];
    if (hand.length >= MAX_HAND || deck.cardCount() <= 0) return;
    hand.push(deck.dealCard());
    this.emit({ t: 'draw', side: player });
  }

  popCard(player) { return this.decks[player].dealCard(); }
  pushCard(player, item) { this.decks[player].placeCard(item); }
  reshuffle(player) { this.decks[player].shuffle(this.rng); }
  getDeck(player) { return this.decks[player]; }

  placeCardInHand(player, card) {
    this.hands[player].push(card);
    this.emit({ t: 'toHand', side: player, card: card.form.id });
  }

  removeCardFromHand(player, card) {
    const hand = this.hands[player];
    const i = hand.indexOf(card);
    if (i >= 0) hand.splice(i, 1);
  }

  removeCardFromPlay(player, lane, type) {
    const l = this.lanes[player][lane];
    const script = l.scripts[type];
    if (!script) return;
    script.flooped = false;
    for (let i = 0; i < LANE_COUNT; i++) {
      for (let j = 0; j < 2; j++) {
        if (this.laneHasCard(player, i, j)) {
          const s = this.getScript(player, i, j);
          s.onCardLeftPlay(script);
          s.endAllVFX();
        }
      }
    }
    l.scripts[type] = null;
    if (type === CardType.Creature) this.creaturesRemoved[player]++;
    this.emit({ t: 'leave', side: player, lane, type, card: script.data.form.id });
  }

  getCardsInDeck(player) { return this.decks[player].getCards(); }

  discardCard(player, card) {
    this.discardPiles[player].unshift(card);
  }

  getDiscardPile(player) { return this.discardPiles[player]; }

  removeCardFromDiscardPile(player, card) {
    const pile = this.discardPiles[player];
    const i = pile.indexOf(card);
    if (i >= 0) pile.splice(i, 1);
  }

  returnCardToHand(player, type) {
    const matches = this.discardPiles[player].filter((c) => c.form.type === type);
    if (matches.length > 0) this.placeCardInHand(player, matches[this.rng.range(0, matches.length)]);
  }

  discardPileContains(player, type) {
    return this.discardPiles[player].some((c) => c.form.type === type);
  }

  getCard(player, lane, type) { return this.lanes[player][lane].scripts[type].data; }
  getCardForm(player, lane, type) { return this.getCard(player, lane, type).form; }

  hasCreaturesInPlay(player) {
    for (let i = 0; i < LANE_COUNT; i++) if (this.laneHasCreature(player, i)) return true;
    return false;
  }

  hasCardTypeInPlay(player, type) {
    for (let i = 0; i < LANE_COUNT; i++) if (this.laneHasCard(player, i, type)) return true;
    return false;
  }

  laneHasCreature(player, lane) { return this.lanes[player][lane].hasCreature(); }
  laneHasBuilding(player, lane) { return this.lanes[player][lane].hasBuilding(); }
  laneHasCard(player, lane, type) { return this.lanes[player][lane].hasCard(type); }
  getLanes(player) { return this.lanes[player].slice(); }

  /**
   * GameState.CheckForDeaths followed straight away by what the death
   * animation did afterwards (CreatureBattleScript.DeathActions).
   * Returns true when anything died.
   */
  checkForDeaths() {
    const dying = [];
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < LANE_COUNT; j++) {
        if (!this.laneHasCreature(i, j)) continue;
        const c = this.getCreature(i, j);
        if (c.health <= 0 && !c.markedForDeath) {
          this.discardCard(i, c.data);
          c.markedForDeath = true;
          dying.push([i, j, c]);
        }
      }
    }
    for (const [i, j, c] of dying) {
      if (this.getCreature(i, j) !== c) continue;
      const dyingCard = c.data;
      this.emit({ t: 'death', side: i, lane: j, card: dyingCard.form.id });
      this.removeCardFromPlay(i, j, CardType.Creature);
      if (this.laneHasBuilding(i, j)) this.getBuilding(i, j).onCreatureDied(dyingCard);
      const lane = this.getLane(i, j);
      if (lane.opponentLane.hasCreature()) lane.opponentLane.getCreature().onCreatureDied(dyingCard);
    }
    return dying.length > 0;
  }

  isMarkedForDeath(player, lane) {
    return this.laneHasCreature(player, lane) ? this.getCreature(player, lane).markedForDeath : false;
  }

  /** Swaps the cards of `type` between two of a player's lanes. */
  moveCard(player, source, dest, type) {
    const a = this.lanes[player][source];
    const b = this.lanes[player][dest];
    const sa = a.scripts[type];
    const sb = b.scripts[type];
    b.scripts[type] = sa;
    a.scripts[type] = sb;
    if (sa) {
      sa.onCardLeftPlay(sa);
      sa.currentLane = b;
      sa.onCardEnterPlay(sa);
    }
    if (sb) {
      sb.onCardLeftPlay(sb);
      sb.currentLane = a;
      sb.onCardEnterPlay(sb);
    }
    this.emit({ t: 'move', side: player, from: source, to: dest, type });
  }

  /** Moves a card between the two sides of the board (steal). */
  moveCardBetween(victim, source, thief, dest, type) {
    const a = this.lanes[victim][source];
    const b = this.lanes[thief][dest];
    const sa = a.scripts[type];
    const sb = b.scripts[type];
    b.scripts[type] = sa;
    a.scripts[type] = sb;
    if (sa) { sa.owner = thief; sa.currentLane = b; }
    if (sb) { sb.owner = victim; sb.currentLane = a; }
    this.emit({ t: 'steal', from: victim, fromLane: source, to: thief, toLane: dest, type });
  }

  castSpell(player, card) {
    if (!this.stealing) {
      const cost = card.form.determineCost(this, player);
      const left = this.spellPoints[player] - cost;
      if (left >= 0) this.addSpellPoints(player, -cost);
      else {
        this.setSpellPoints(player, 0);
        this.addMagicPoints(player, left);
      }
      this.removeCardFromHand(player, card);
    } else {
      this.removeCardFromHand(other(player), card);
      this.stealing = false;
    }
    this.discardCard(player, card);
    const script = card.form.instanceScript();
    script.owner = player;
    script.data = card;
    script.game = this;
    this.spellsCast[player]++;
    this.emit({ t: 'spell', side: player, card: card.form.id });
    script.cast();
  }

  addSpellEffect(player, script) { this.spellsInEffect[player].push(script); }
  endSpellEffect(player, script) { removeFrom(this.spellsInEffect[player], script); }
  addPersistentSpellEffect(player, script) { this.persistentSpellsInEffect[player].push(script); }
  endPersistentSpellEffect(player, script) { removeFrom(this.persistentSpellsInEffect[player], script); }

  /** GameState.Summon + DoResultSummon + the summon animation's FinishSummoning. */
  summon(player, laneIdx, card) {
    const type = this.lanes[player][laneIdx].type;
    const m = this.summonedCards[player];
    if (!m.has(card.form.id)) m.set(card.form.id, []);
    m.get(card.form.id).push(type);

    this.addMagicPoints(player, -card.form.determineCost(this, player));
    this.removeCardFromHand(player, card);
    const lane = this.lanes[player][laneIdx];
    if (lane.hasCard(card.form.type)) {
      const old = lane.getScript(card.form.type);
      this.discardCard(player, old.data);
      this.removeCardFromPlay(player, lane.index, card.form.type);
    }
    const script = card.form.instanceScript();
    lane.scripts[card.form.type] = script;
    script.data = card;
    script.currentLane = lane;
    script.owner = player;
    script.game = this;
    script.fresh = true;
    this.emit({ t: 'summon', side: player, lane: laneIdx, type: card.form.type, card: card.form.id });
    script.onSummon();
    if (card.form.type === CardType.Creature) this.creaturesSummoned[player]++;
    if (script.isSummoning) script.finishSummoning();
  }

  isSummoning(player, lane, type) { return this.lanes[player][lane].scripts[type].isSummoning; }

  /** GameState.FinishSummoning: every other card on the owner's side hears about it. */
  finishSummoning(script) {
    for (let i = 0; i < LANE_COUNT; i++) {
      for (let j = 0; j < 2; j++) {
        if (this.laneHasCard(script.owner, i, j)) {
          const s = this.getScript(script.owner, i, j);
          if (!s.isSummoning) s.onCardEnterPlay(script);
        }
      }
    }
  }

  canFloopCard(player, script) {
    return !script.flooped && !script.floopDisabled && !script.floopBlocked
      && this.getMagicPoints(player) >= script.determineFloopCost() && !!script.canFloop();
  }

  floopCard(player, lane, type) {
    const script = this.lanes[player][lane].scripts[type];
    this.addMagicPoints(player, -script.determineFloopCost());
    this.floopCountTurn[player]++;
    this.floopCountGame[player]++;
    this.emit({ t: 'floop', side: player, lane, card: script.data.form.id });
    script.floop();
    script.flooped = true;
    if (script.currentLane && script.currentLane.hasBuilding()) script.currentLane.getBuilding().onCreatureFlooped();
  }

  unfloopCard(player, lane, type) {
    this.lanes[player][lane].scripts[type].flooped = false;
  }

  isFlooping(player) {
    for (let i = 0; i < LANE_COUNT; i++) {
      for (let j = 0; j < 2; j++) {
        if (this.laneHasCard(player, i, j) && this.getScript(player, i, j).flooping) return true;
      }
    }
    return this.spellsInEffect[player].some((s) => s.flooping)
      || this.persistentSpellsInEffect[player].some((s) => s.flooping);
  }

  /** GameState.Update: per-frame hooks, run after every action here. */
  update() {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < LANE_COUNT; j++) {
        for (let k = 0; k < 2; k++) {
          const s = this.lanes[i][j].scripts[k];
          if (s) s.update();
        }
      }
      for (const s of this.spellsInEffect[i].slice()) s.update();
      for (const s of this.persistentSpellsInEffect[i].slice()) s.update();
    }
  }

  floopCount(player, type) {
    let n = 0;
    for (let i = 0; i < LANE_COUNT; i++) {
      if (this.laneHasCard(player, i, type) && this.lanes[player][i].scripts[type].flooped) n++;
    }
    return n;
  }

  setLandscape(player, lane, type) { this.lanes[player][lane].type = type; }
  getLandscapeType(player, lane) { return this.lanes[player][lane].type; }
  setOverrideLandscape(player, type) { this.overrideLandscapes[player] = type; }
  getOverrideLandscape(player) { return this.overrideLandscapes[player]; }
  addFakeLandscape(player, type) { this.fakeLandscapes[player].push(type); }
  removeFakeLandscape(player, type) { removeFrom(this.fakeLandscapes[player], type); }

  isLaneOfLandscapeType(player, lane, type) {
    if (lane < 0) return this.overrideLandscapes[player] === type;
    return this.lanes[player][lane].type === type || this.overrideLandscapes[player] === type;
  }

  /** LandscapeCount(player, type), or across both players when player is null. */
  landscapeCount(player, type) {
    if (type === undefined) return this.landscapeCount(null, player);
    const players = player === null ? [0, 1] : [player];
    let n = 0;
    for (const p of players) {
      for (const f of this.fakeLandscapes[p]) if (f === type) n++;
      for (let j = 0; j < LANE_COUNT; j++) {
        const lane = this.lanes[p][j];
        if ((lane.type === type || this.overrideLandscapes[p] === type) && !lane.flipped) n++;
      }
    }
    return n;
  }

  /** LandscapeTypeCount(player): distinct landscape types; no argument = both boards. */
  landscapeTypeCount(player) {
    const seen = new Set();
    if (player === undefined || player === null) {
      for (let i = 0; i < LANE_COUNT; i++) {
        const lane = this.lanes[0][i];
        seen.add(lane.type);
        seen.add(lane.opponentLane.type);
      }
      return seen.size;
    }
    if (this.overrideLandscapes[player] !== NONE) seen.add(this.overrideLandscapes[player]);
    for (const f of this.fakeLandscapes[player]) seen.add(f);
    for (let j = 0; j < LANE_COUNT; j++) seen.add(this.lanes[player][j].type);
    return seen.size;
  }

  flippedLandscapeCount(player) {
    return this.lanes[player].filter((l) => l.flipped).length;
  }

  /** CreatureFactionCount(player) = distinct factions; with a faction = how many. */
  creatureFactionCount(player, faction) {
    const creatures = this.lanes[player].filter((l) => l.hasCreature()).map((l) => l.getCreature());
    if (faction !== undefined) return creatures.filter((c) => c.data.form.faction === faction).length;
    return new Set(creatures.map((c) => c.data.form.faction)).size;
  }

  creatureCount(player) { return this.lanes[player].filter((l) => l.hasCreature()).length; }
  buildingCount(player) { return this.lanes[player].filter((l) => l.hasBuilding()).length; }
  cardCount(player, type) { return this.lanes[player].filter((l) => l.hasCard(type)).length; }
  emptyLaneCount(player) { return this.lanes[player].filter((l) => l.isEmpty()).length; }
  floopedCardCount(player) {
    return this.lanes[player].filter((l) => l.hasCreature() && l.getCreature().flooped).length;
  }

  getLandscapeInDeck(player, lane) { return this.decks[player].getLandscape(lane); }
  getCreature(player, lane) { return this.lanes[player][lane].getCreature(); }
  getBuilding(player, lane) { return this.lanes[player][lane].getBuilding(); }
  getScript(player, lane, type) { return this.lanes[player][lane].scripts[type]; }

  discardCount(player, type) {
    const pile = this.discardPiles[player];
    return type === undefined ? pile.length : pile.filter((c) => c.form.type === type).length;
  }

  getDiscount(player, form) {
    let n = 0;
    for (const d of this.discounts[player]) {
      if (d.factionRequired) {
        if ((d.forType === CardType.None || form.type === d.forType) && form.faction === d.forFaction) n += d.discount;
      } else if (d.forType === CardType.None || form.type === d.forType) {
        n += d.discount;
      }
    }
    return n;
  }

  setDiscount(player, type, discount, factionReq = false, factionType = 'Universal') {
    this.discounts[player].push({ forType: type, factionRequired: factionReq, forFaction: factionType, discount });
  }

  getFloopCostMod(player) { return this.floopCostMods[player]; }
  addFloopCostMod(player, amount) { this.floopCostMods[player] += amount; }
  getFlatFloopCost(player) { return this.flatFloopCost[player]; }
  setFlatFloopCost(player, cost) {
    this.flatFloopCost[player] = cost;
    this.floopCostMods[player] = 0;
  }
  getATKPenalty(player) { return this.atkPenalty[player]; }
  setATKPenalty(player, penalty) { this.atkPenalty[player] = penalty; }
  getSpellsCast(player) { return this.spellsCast[player]; }

  clearSummonedCards() { this.summonedCards.forEach((m) => m.clear()); }
  getSummonedCards(player) { return this.summonedCards[player]; }
  getSummonedCardCount(player, cardId) {
    return this.summonedCards[player].has(cardId) ? this.summonedCards[player].get(cardId).length : 0;
  }
  getCreaturesSummoned(player) { return this.creaturesSummoned[player]; }
  getCreaturesRemoved(player) { return this.creaturesRemoved[player]; }

  enableCasting(player, type, flag) { this.canCast[type][player] = flag; }
  isCastingEnabled(player, type) {
    return type >= 0 && type <= 2 ? this.canCast[type][player] : true;
  }
  /** GameState.EnableFlooping always disabled flooping, whatever the flag. */
  enableFlooping(player, _flag) { this.canFloop[player] = false; }
  randomizeSummoning(player, flag) { this.randomizeSummon[player] = flag; }
  canPlayCards(player) { return this.canPlay[player]; }
  isFloopingEnabled(player) { return this.canFloop[player]; }

  flipLandscape(player, lane, flip) {
    this.lanes[player][lane].flipped = flip;
    this.emit({ t: 'flip', side: player, lane, flipped: flip });
  }
  isLandscapeFlipped(player, lane) { return this.lanes[player][lane].flipped; }

  stealFrom(player) {
    this.stealing = true;
    this.stealSource = player;
  }

  getCritAreaModifier(player) { return this.critAreaModifier[player]; }
  setCritAreaModifier(player, v) { this.critAreaModifier[player] = v; }
  getHitAreaModifier(player) { return this.hitAreaModifier[player]; }
  setHitAreaModifier(player, v) { this.hitAreaModifier[player] = v; }
  getDefenseAreaModifier(player) { return this.defenseAreaModifier[player]; }
  setDefenseAreaModifier(player, v) { this.defenseAreaModifier[player] = v; }
  getDefenseAreaCritModifier(player) { return this.defenseAreaCritModifier[player]; }
  setDefenseAreaCritModifier(player, v) { this.defenseAreaCritModifier[player] = v; }

  startTurn(player) {
    this.spellsCast[player] = 0;
    this.creaturesSummoned[player] = 0;
    this.creaturesRemoved[player] = 0;
    this.overrideLandscapes[player] = NONE;
    for (let i = 0; i < LANE_COUNT; i++) {
      for (let j = 0; j < 2; j++) {
        if (this.laneHasCard(player, i, j)) {
          const s = this.getScript(player, i, j);
          s.moved = false;
          s.flooped = false;
          s.helpless = false;
          s.protected = false;
          s.fresh = false;
          s.used = false;
          s.startTurn();
        }
      }
    }
    const persistent = this.persistentSpellsInEffect[other(player)];
    for (let guard = 0; persistent.length > 0 && guard < 64; guard++) {
      const s = persistent[0];
      s.onOpponentStartTurn();
      if (persistent[0] === s) persistent.shift();
    }
    if (this.decks[player].cardCount() !== 0) this.drawCard(player);
    else this.outOfCards(player);
  }

  /**
   * Out of cards (CWOutOfCardsApplyBleed, CWOutOfCardsPopup/DiscardTarget,
   * ReshuffleOpponentCards): bleed damage equal to the hero level, your board
   * is cleared, and hand plus discard pile become a fresh deck with a new hand.
   */
  outOfCards(player) {
    this.emit({ t: 'outOfCards', side: player });
    this.dealDamage(player, this.getLeader(player).rank);
    for (let t = 0; t < 2; t++) {
      for (let j = 0; j < LANE_COUNT; j++) {
        if (this.laneHasCard(player, j, t)) {
          const s = this.getScript(player, j, t);
          this.removeCardFromPlay(player, j, t);
          this.discardCard(player, s.data);
        }
      }
    }
    const hand = this.hands[player];
    while (hand.length > 0) this.discardCard(player, hand.shift());
    const pile = this.discardPiles[player];
    const deck = this.decks[player];
    while (pile.length > 0) deck.addCard(pile.shift());
    this.reshuffle(player);
    for (let i = 0; i < CARDS_TO_DEAL; i++) this.drawCard(player);
  }

  doResultBleed(player) {
    this.dealDamage(player, this.getLeader(player).rank);
  }

  resetCasting(player) {
    this.canCast[0][player] = true;
    this.canCast[1][player] = true;
    this.canCast[2][player] = true;
  }

  endTurn(player) {
    if (this.firstPlayer === player) {
      this.currentMagicPoints++;
      if (this.currentMagicPoints > MAX_MAGIC_POINTS) this.currentMagicPoints = MAX_MAGIC_POINTS;
    }
    this.magicPoints[player] = this.currentMagicPoints + this.bonusPoints[player];
    this.bonusPoints[player] = 0;
    this.floopCountTurn[player] = 0;
    this.discounts[player] = [];
    this.floopCostMods[player] = 0;
    this.flatFloopCost[player] = -1;
    this.atkPenalty[player] = 0;
    this.resetCasting(player);
    this.canPlay[player] = true;
    this.canFloop[player] = true;
    this.randomizeSummon[player] = false;
    this.spellsInEffect[player] = [];
    if (this.leaderCooldown[player] > 0) this.leaderCooldown[player]--;
    for (let i = 0; i < LANE_COUNT; i++) {
      const lane = this.getLane(player, i);
      lane.disabled = false;
      for (let j = 0; j < 2; j++) {
        if (this.laneHasCard(player, i, j)) {
          const s = this.getScript(player, i, j);
          s.floopBlocked = false;
          s.cantAttack = false;
        }
      }
    }
  }

  // =========================================================================
  // Hints for the UI and the bot
  // =========================================================================

  /** Lanes where `uid` can be played right now ([-1] for a castable spell). */
  playableLanes(player, uid) {
    if (this.phase !== Phase.Setup || this.pending || player !== this.activePlayer) return [];
    const card = this.hands[player].find((c) => c.uid === uid);
    if (!card) return [];
    if (card.form.type === CardType.Spell) return safe(() => card.form.canPlay(this, player, -1)) ? [-1] : [];
    const out = [];
    for (let i = 0; i < LANE_COUNT; i++) if (safe(() => card.form.canPlay(this, player, i))) out.push(i);
    return out;
  }

  floopableLanes(player) {
    if (this.phase !== Phase.Setup || this.pending || player !== this.activePlayer) return [];
    if (!this.isFloopingEnabled(player)) return [];
    const out = [];
    for (let i = 0; i < LANE_COUNT; i++) {
      const l = this.getLane(player, i);
      if (l.hasCreature() && safe(() => this.canFloopCard(player, l.getCreature()))) out.push(i);
    }
    return out;
  }

  leaderReady(player) {
    if (this.phase !== Phase.Setup || this.pending || player !== this.activePlayer) return false;
    return safe(() => this.isLeaderAbilityReady(player));
  }

  // =========================================================================
  // Snapshots: what one player is allowed to see
  // =========================================================================

  snapshot(viewer) {
    const cardView = (c) => ({
      uid: c.uid, id: c.form.id, level: c.level,
      cost: safe(() => c.form.determineCost(this, viewer), c.form.cost),
    });
    const scriptView = (s) => {
      if (!s) return null;
      const v = {
        uid: s.data.uid, id: s.data.form.id, level: s.data.level,
        flooped: s.flooped, fresh: s.fresh,
        protected: s.protected, helpless: s.helpless, cantAttack: s.cantAttack,
        floopBlocked: s.floopBlocked || s.floopDisabled,
      };
      if (s instanceof CreatureScript) {
        v.atk = s.atk;
        v.def = s.def;
        v.health = s.health;
        v.damage = s.damage;
        v.baseAtk = s.data.atk;
        v.baseDef = s.data.def;
        v.floopCost = safe(() => s.determineFloopCost(), s.data.form.floopCost);
      }
      return v;
    };
    const players = pair((p) => {
      const leader = this.decks[p] ? this.decks[p].leader : null;
      return {
        name: this.names[p],
        leader: leader ? leader.form.id : null,
        heroLevel: leader ? leader.rank : 1,
        health: this.health[p],
        maxHealth: this.maxHealth[p],
        magic: this.magicPoints[p],
        spellPoints: this.spellPoints[p],
        cooldown: this.leaderCooldown[p],
        deckCount: this.decks[p] ? this.decks[p].cardCount() : 0,
        handCount: this.hands[p].length,
        hand: p === viewer || viewer === 'all' ? this.hands[p].map(cardView) : null,
        discard: this.discardPiles[p].map((c) => ({ uid: c.uid, id: c.form.id, level: c.level })),
        lanes: this.lanes[p].map((l) => ({
          type: l.type,
          flipped: l.flipped,
          disabled: l.disabled,
          creature: scriptView(l.getCreature()),
          building: scriptView(l.getBuilding()),
        })),
        canCast: [this.canCast[0][p], this.canCast[1][p], this.canCast[2][p]],
        floopEnabled: this.canFloop[p],
      };
    });
    let pending = null;
    if (this.pending) {
      const { script, ...rest } = this.pending;
      pending = rest;
      if (script && script.data) pending.source = script instanceof LeaderScript ? 'leader' : script.data.form.id;
    }
    const me = typeof viewer === 'number' ? viewer : null;
    return {
      seq: this.seq,
      turn: this.turn,
      phase: this.phase,
      active: this.activePlayer,
      first: this.firstPlayer,
      winner: this.winner,
      endReason: this.endReason,
      ring: this.opts.ring,
      players,
      pending,
      battle: this.battle ? { player: this.battle.player, lane: this.battle.order[this.battle.index] ?? -1 } : null,
      hints: me === null ? null : {
        playable: Object.fromEntries(this.hands[me].map((c) => [c.uid, this.playableLanes(me, c.uid)])),
        floopable: this.floopableLanes(me),
        leader: this.leaderReady(me),
      },
    };
  }

  eventsSince(seq) {
    return this.events.filter((e) => e.seq > seq);
  }
}

function ok() { return { ok: true }; }
function fail(error) { return { ok: false, error }; }
function removeFrom(list, item) {
  const i = list.indexOf(item);
  if (i >= 0) list.splice(i, 1);
}
function safe(f, fallback = false) {
  try { return f(); } catch { return fallback; }
}

export { LANDSCAPES, SpellScript };
