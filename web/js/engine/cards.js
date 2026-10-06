// Card, hero and deck models: CardForm.cs, CardItem.cs, LeaderForm.cs,
// LeaderItem.cs and Deck.cs.
import { CardType } from './consts.js';
import { scriptClassFor } from './registry.js';

export class CardForm {
  constructor(raw) {
    this.id = raw.id;
    this.name = raw.name;
    this.shortName = raw.short || raw.name;
    this.type = raw.type;
    this.rawDescription = raw.desc || '';
    this.baseATK = raw.atk || 0;
    this.baseDEF = raw.def || 0;
    this.baseVal1 = raw.val1 || 0;
    this.baseVal2 = raw.val2 || 0;
    this.scriptName = raw.script || '';
    this.faction = raw.faction || 'Universal';
    this.quality = raw.quality || 'Standard';
    this.rarity = raw.rarity || 1;
    this.cost = raw.cost || 0;
    this.floopCost = raw.floopCost || 0;
    this.art = raw.art || null;
  }

  getScriptClass() {
    return scriptClassFor(this.scriptName, this.type);
  }

  /** CardForm.CanPlay: dispatches to the script class's static CanPlay. */
  canPlay(game, player, lane) {
    return this.getScriptClass().canPlay(game, player, lane, this);
  }

  /** CardForm.DetermineCost: dispatches to the script class's static DetermineCost. */
  determineCost(game, player) {
    return this.getScriptClass().determineCost(game, player, this);
  }

  instanceScript() {
    const Cls = this.getScriptClass();
    return new Cls();
  }
}

let nextUid = 1;

export class CardItem {
  constructor(form, level = 1) {
    this.uid = nextUid++;
    this.form = form;
    this.level = level;
  }

  get atk() { return this.level * this.form.baseATK; }
  get def() { return this.level * this.form.baseDEF; }
  get val1() { return this.level * this.form.baseVal1; }
  get val2() { return this.level * this.form.baseVal2; }

  get description() {
    return this.form.rawDescription
      .replaceAll('<val1>', String(this.val1))
      .replaceAll('<val2>', String(this.val2));
  }
}

export class LeaderForm {
  constructor(raw) {
    this.id = raw.id;
    this.name = raw.name;
    this.desc = raw.desc || '';
    this.character = raw.character;
    this.baseHP = raw.baseHP || 10;
    this.scriptName = raw.script;
    this.cooldown = raw.cooldown || 0;
    this.baseVal1 = raw.val1 || 0;
    this.baseVal2 = raw.val2 || 0;
    this.forFaction = raw.forFaction ?? null;
    this.forLandscape = raw.forLandscape ?? null;
    this.forCardType = raw.forCardType ?? null;
    this.critDamageMod = raw.critMod || 2;
    this.hitArea = raw.hitArea ?? 0.8;
    this.critArea = raw.critArea ?? 0.07;
    this.spinMin = raw.spinMin ?? 0.18;
    this.spinMax = raw.spinMax ?? 0.23;
    this.portrait = raw.portrait || null;
  }

  getScriptClass() {
    return scriptClassFor(this.scriptName, CardType.Spell, true);
  }
}

export class LeaderItem {
  constructor(form, rank = 1) {
    this.form = form;
    this.rank = rank;
  }

  /** LeaderItem.HP: rank * HP_PER_LEVEL + BaseHP. */
  get hp() { return this.rank * 5 + this.form.baseHP; }

  get description() {
    return this.form.desc
      .replaceAll('<val1>', String(this.form.baseVal1))
      .replaceAll('<val2>', String(this.form.baseVal2));
  }

  canPlay(game, player) {
    return this.form.getScriptClass().canPlay(game, player, -1, this.form);
  }

  instanceScript() {
    const Cls = this.form.getScriptClass();
    return new Cls();
  }
}

export class Deck {
  constructor({ name = '', cards = [], landscapes = [], leader = null } = {}) {
    this.name = name;
    this.cards = cards;
    this.landscapes = landscapes;
    this.leader = leader;
  }

  /** Deck.Shuffle: Count*7 random swaps, as in the original. */
  shuffle(rng) {
    const c = this.cards;
    for (let n = c.length * 7; n > 0; n--) {
      const i = rng.range(0, c.length);
      const j = rng.range(0, c.length);
      const t = c[i];
      c[i] = c[j];
      c[j] = t;
    }
  }

  dealCard() { return this.cards.length > 0 ? this.cards.shift() : null; }
  placeCard(item) { this.cards.unshift(item); }
  addCard(item) { this.cards.push(item); }
  removeCard(item) {
    const i = this.cards.indexOf(item);
    if (i >= 0) this.cards.splice(i, 1);
  }
  cardCount() { return this.cards.length; }
  getCards() { return this.cards; }
  getLandscape(i) { return this.landscapes[i]; }
}

/** Card database built from data/cards.json. */
export class CardDb {
  constructor(json) {
    this.json = json;
    this.forms = {};
    for (const raw of Object.values(json.cards)) this.forms[raw.id] = new CardForm(raw);
    this.leaders = {};
    for (const raw of Object.values(json.leaders)) this.leaders[raw.id] = new LeaderForm(raw);
    this.decks = json.decks || [];
  }

  form(id) {
    const f = this.forms[id];
    if (!f) throw new Error('Unknown card ' + id);
    return f;
  }

  leader(id) {
    const l = this.leaders[id];
    if (!l) throw new Error('Unknown hero ' + id);
    return l;
  }

  /**
   * Builds a playable Deck from a plain description:
   * { leader, landscapes: [4], cards: [ids] }.
   */
  buildDeck(desc, { cardLevel = 1, heroLevel = 1 } = {}) {
    const cards = desc.cards.map((id) => new CardItem(this.form(id), cardLevel));
    const leader = new LeaderItem(this.leader(desc.leader), heroLevel);
    return new Deck({ name: desc.name || '', cards, landscapes: [...desc.landscapes], leader });
  }
}
