// Card faces, hero portraits and landscape tiles, drawn from the game's own art.
import { h } from './dom.js';
import { CardType } from '../engine/consts.js';

let J = null;
export function initArt(json) { J = json; }

export const LANDSCAPE_NAMES = {
  Corn: 'Cornfield', Plains: 'Blue Plains', Swamp: 'Useless Swamp',
  Cotton: 'Cotton Candy', Sand: 'SandyLands', Universal: 'Rainbow', None: 'None',
};
export const TYPE_NAMES = ['Creature', 'Building', 'Spell', 'Dweeb'];

/** CSS for one sprite of an atlas, scaled to whatever box it fills. */
export function sprite(atlas, rect) {
  const [W, H] = J.atlasSize[atlas];
  const [x, y, w, hh] = rect;
  return {
    backgroundImage: `url(assets/atlas/${atlas}.png)`,
    backgroundSize: `${(W / w) * 100}% ${(H / hh) * 100}%`,
    backgroundPosition: `${W === w ? 0 : (x / (W - w)) * 100}% ${H === hh ? 0 : (y / (H - hh)) * 100}%`,
  };
}

export function artStyle(form) {
  const a = form && form.art;
  if (!a) return {};
  if (a.file) return { backgroundImage: `url("${encodeURI(a.file)}")` };
  return sprite(a.atlas, a.rect);
}

export function portraitStyle(leader) {
  const p = leader && leader.portrait;
  return p ? sprite(p.atlas, p.rect) : {};
}

export function landscapeStyle(type) {
  const r = J.landscapes['Landscape_' + type + '1'];
  return r ? sprite('LandscapeAtlas', r) : {};
}

export function cardBackStyle() {
  return sprite('CardFrameAtlas', J.frames.CardBack);
}

export function describe(form, level = 1) {
  return form.rawDescription
    .replaceAll('<val1>', String(level * form.baseVal1))
    .replaceAll('<val2>', String(level * form.baseVal2));
}

export function heroDescribe(leader) {
  return leader.desc
    .replaceAll('<val1>', String(leader.baseVal1))
    .replaceAll('<val2>', String(leader.baseVal2));
}

/** "(5 Turns) Gain 2 Magic" -> "Gain 2 Magic" (the cooldown is shown separately). */
export function heroPowerText(leader) {
  return heroDescribe(leader).replace(/^\(\d+ Turns?\)\s*/i, '');
}

/**
 * A card face.
 * opts.size: 'hand' | 'board' | 'zoom' | 'mini'
 * opts.cost: cost to show (defaults to the printed cost)
 * opts.unit: board state of a creature/building (atk, health, def, flooped...)
 */
export function cardEl(form, opts = {}) {
  const level = opts.level || 1;
  const size = opts.size || 'hand';
  const type = form.type;
  const u = opts.unit;
  const el = h('div.card', {
    class: [`s-${size}`, `f-${form.faction}`, `t-${TYPE_NAMES[type] || 'Card'}`, opts.cls].filter(Boolean).join(' '),
    dataset: { id: form.id },
  });
  const cost = opts.cost ?? form.cost;
  el.append(
    h('div.card-art', { style: artStyle(form) }),
    h('div.card-cost', { class: cost < form.cost ? 'cheaper' : cost > form.cost ? 'dearer' : '' }, String(cost)),
    h('div.card-name', form.name),
  );
  if (size === 'zoom' || size === 'hand') {
    el.append(h('div.card-type', `${TYPE_NAMES[type]} · ${LANDSCAPE_NAMES[form.faction] || form.faction}`));
  }
  if (size === 'zoom') el.append(h('div.card-text', describe(form, level)));
  if (type === CardType.Creature) {
    const atk = u ? u.atk : level * form.baseATK;
    const hp = u ? u.health : level * form.baseDEF;
    const baseAtk = u ? u.baseAtk : atk;
    const maxHp = u ? u.def : hp;
    el.append(h('div.card-stats',
      h('span.atk', { class: atk > baseAtk ? 'up' : atk < baseAtk ? 'down' : '' }, String(atk)),
      form.floopCost || (u && u.floopCost) ? h('span.floop-cost', { title: 'Floop cost' }, String(u ? u.floopCost : form.floopCost)) : null,
      h('span.hp', { class: hp < maxHp ? 'down' : maxHp > level * form.baseDEF ? 'up' : '' }, String(hp)),
    ));
  }
  if (u) {
    if (u.flooped) el.classList.add('flooped');
    const badges = [];
    if (u.protected) badges.push(h('i.badge.protected', { title: 'Protected' }, '🛡'));
    if (u.helpless) badges.push(h('i.badge.helpless', { title: 'Helpless: attacks go to the hero' }, '😵'));
    if (u.cantAttack) badges.push(h('i.badge.cantattack', { title: "Can't attack" }, '🚫'));
    if (u.floopBlocked) badges.push(h('i.badge.blocked', { title: "Can't floop" }, '🔒'));
    if (badges.length) el.append(h('div.card-badges', badges));
  }
  if (level > 1 && size !== 'mini') el.append(h('div.card-level', 'Lv ' + level));
  return el;
}

export function cardBackEl(cls = '') {
  return h('div.card.back', { class: cls, style: cardBackStyle() });
}

export function portraitEl(leader, cls = '') {
  return h('div.portrait', { class: cls, style: portraitStyle(leader), title: leader ? leader.name : '' });
}

export function landscapeChip(type) {
  return h('span.land-chip', { class: 'f-' + type, style: landscapeStyle(type), title: LANDSCAPE_NAMES[type] || type });
}
