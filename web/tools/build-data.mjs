// Builds web/data/cards.json and copies the art the browser game needs
// out of the Unity project (Assets/). Run it after changing card data:
//   npm run build-data        (from web/), or node web/tools/build-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, '..');
const ROOT = path.resolve(WEB, '..');
const ASSETS = path.join(ROOT, 'Assets');
const BP = path.join(ASSETS, 'StreamingAssets', 'Blueprints');

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(BP, f), 'utf8'));

// ---- localisation -------------------------------------------------------
const strings = {};
for (const f of ['EN_Names.bytes', 'EN_Descriptions.bytes', 'EN_Menu.bytes']) {
  const txt = fs.readFileSync(path.join(ASSETS, 'Resources', 'languages', f), 'utf8');
  for (const m of txt.matchAll(/<entry name="([^"]+)">([\s\S]*?)<\/entry>/g)) {
    strings[m[1]] = decode(m[2]);
  }
}
function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\\n/g, '\n');
}
const loc = (k) => (k && strings[k] !== undefined ? strings[k] : k || '');

// ---- atlases --------------------------------------------------------------
// Rects are [x, y, w, h] in pixels from the top-left. Some atlases store
// pixel rects already, others UV rects (0..1, y from the bottom).
function parseAtlas(prefabPath, size) {
  const txt = fs.readFileSync(prefabPath, 'utf8');
  const out = {};
  const num = '(-?[\\d.]+(?:e-?\\d+)?)';
  const re = new RegExp(`- name: (\\S+)\\n\\s+outer:\\n\\s+serializedVersion: \\d+\\n\\s+x: ${num}\\n\\s+y: ${num}\\n\\s+width: ${num}\\n\\s+height: ${num}`, 'g');
  const uv = /mCoordinates: 1/.test(txt); // NGUI: 0 = pixels, 1 = texture coords
  for (const m of txt.matchAll(re)) {
    let [x, y, w, h] = [+m[2], +m[3], +m[4], +m[5]];
    if (uv) [x, y, w, h] = [x * size[0], (1 - y - h) * size[1], w * size[0], h * size[1]];
    out[m[1]] = [x, y, w, h].map(Math.round);
  }
  return out;
}
const atlasSources = {
  CharacterIconAtlas: path.join(ASSETS, 'Resources', 'CharacterIconAtlas.prefab'),
  CharacterIconAtlas02: path.join(ASSETS, 'Resources', 'CharacterIconAtlas02.prefab'),
  CardArtAtlas02: path.join(ASSETS, 'Resources', 'CardArtAtlas02.prefab'),
  LandscapeAtlas: path.join(ASSETS, 'PrefabInstance', 'LandscapeAtlas.prefab'),
  CardFrameAtlas: path.join(ASSETS, 'Resources', 'CardFrameAtlas.prefab'),
};
const atlases = {};
const atlasSize = {};
for (const [name, prefab] of Object.entries(atlasSources)) {
  const src = path.join(ASSETS, 'Texture2D', name + '.png');
  const buf = fs.readFileSync(src);
  atlasSize[name] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  atlases[name] = parseAtlas(prefab, atlasSize[name]);
  fs.copyFileSync(src, path.join(WEB, 'assets', 'atlas', name + '.png'));
}

// ---- card art -------------------------------------------------------------
const artDir = path.join(ASSETS, 'Resources', 'textures', 'cardart');
const artFiles = {};
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.png')) artFiles[e.name.slice(0, -4).toLowerCase()] = p;
  }
})(artDir);
fs.mkdirSync(path.join(WEB, 'assets', 'cards'), { recursive: true });
function art(sprite) {
  const src = artFiles[(sprite || '').toLowerCase()];
  if (src) {
    const name = path.basename(src);
    fs.copyFileSync(src, path.join(WEB, 'assets', 'cards', name));
    return { file: 'assets/cards/' + name };
  }
  const r = atlases.CardArtAtlas02[sprite];
  if (r) return { atlas: 'CardArtAtlas02', rect: r };
  return null;
}

// ---- cards ----------------------------------------------------------------
const int = (v) => (v === undefined || v === '' ? 0 : parseInt(v, 10) || 0);
const TYPE = { Creature: 0, Building: 1, Spell: 2 };
const cards = {};
function addCards(file, type) {
  for (const x of readJson(file)) {
    cards[x.ID] = {
      id: x.ID,
      type,
      name: loc(x.Name),
      short: loc(x.ShortHandName) || loc(x.Name),
      desc: loc(x.Desc),
      faction: x.Faction,
      cost: int(x.Cost),
      atk: int(x.ATK),
      def: int(x.DEF),
      floopCost: int(x.FloopCost),
      val1: int(x.val1),
      val2: int(x.val2),
      rarity: int(x.Rarity),
      quality: x.Quality,
      script: x.ScriptName,
      art: art(x.SpriteName),
    };
  }
}
addCards('db_Creatures.json', TYPE.Creature);
addCards('db_Buildings.json', TYPE.Building);
addCards('db_Spells.json', TYPE.Spell);

// ---- leaders --------------------------------------------------------------
const leaders = {};
for (const x of readJson('db_Leaders.json')) {
  const sprite = x.SpriteNameHero || x.SpriteName;
  let portrait = null;
  for (const a of ['CharacterIconAtlas', 'CharacterIconAtlas02']) {
    const r = atlases[a][sprite] || atlases[a][x.SpriteName];
    if (r) { portrait = { atlas: a, rect: r }; break; }
  }
  leaders[x.ID] = {
    id: x.ID,
    name: loc(x.Name),
    desc: loc(x.Desc),
    character: x.CharacterID,
    baseHP: int(x.BaseHP),
    script: x.ScriptName,
    cooldown: int(x.Cooldown),
    val1: int(x.Val1),
    val2: int(x.Val2),
    forFaction: x.forFaction || null,
    forLandscape: x.forLandscape || null,
    forCardType: x.forCardType ? TYPE[x.forCardType] : null,
    critMod: parseFloat(x.CritDamageMod) || 2,
    hitArea: parseFloat(x.Ring_P1_HitAreaRange) || 0.8,
    critArea: parseFloat(x.Ring_P1_CritAreaRange) || 0.07,
    spinMin: parseFloat(x.TimeFor1SpinMin) || 0.18,
    spinMax: parseFloat(x.TimeFor1SpinMax) || 0.23,
    portrait,
  };
}

// ---- preset decks (the game's own quest decks) ----------------------------
const rawDecks = [];
let cur = null;
for (const r of readJson('db_Decks.json')) {
  if (r.DeckID) { cur = { id: r.DeckID, landscapes: [], cards: [] }; rawDecks.push(cur); }
  if (!cur) continue;
  if (r.Landscapes && cur.landscapes.length < 4) cur.landscapes.push(r.Landscapes);
  if (r.Cards && cards[r.Cards]) cur.cards.push(r.Cards);
}
const deckLeader = {};
for (const q of readJson('db_Quest.json')) {
  if (q.Deck && q.LeaderID && leaders[q.LeaderID] && !deckLeader[q.Deck]) deckLeader[q.Deck] = q.LeaderID;
}
const decks = [];
const seenLeader = new Set();
for (const d of rawDecks) {
  const leader = deckLeader[d.id];
  if (!leader || d.landscapes.length < 4) continue;
  if (d.cards.length < 25 || d.cards.length > 45) continue;
  if (!/^(Quest|Remix|FCQuest)\d+_Deck$/.test(d.id)) continue;
  // one deck per leader keeps the list readable; later quests are stronger
  if (seenLeader.has(leader)) {
    const i = decks.findIndex((x) => x.leader === leader);
    decks[i] = mkDeck(d, leader);
    continue;
  }
  seenLeader.add(leader);
  decks.push(mkDeck(d, leader));
}
function mkDeck(d, leader) {
  const lands = [...new Set(d.landscapes)].join(' / ');
  return {
    id: d.id,
    name: `${leaders[leader].name}'s ${lands} deck`,
    leader,
    landscapes: d.landscapes,
    cards: d.cards,
  };
}

const ui = {};
for (const k of Object.keys(strings)) if (/^!!(TAP|PICK|SELECT)_/.test(k)) ui[k] = strings[k];

const out = {
  version: 1,
  cards,
  leaders,
  decks,
  atlasSize,
  landscapes: atlases.LandscapeAtlas,
  frames: atlases.CardFrameAtlas,
  ui,
};
fs.writeFileSync(path.join(WEB, 'data', 'cards.json'), JSON.stringify(out));
console.log(`cards=${Object.keys(cards).length} leaders=${Object.keys(leaders).length} decks=${decks.length}`);
const noArt = Object.values(cards).filter((c) => !c.art).map((c) => c.id);
if (noArt.length) console.log('no art:', noArt.join(', '));
const noPortrait = Object.values(leaders).filter((l) => !l.portrait).map((l) => l.id);
if (noPortrait.length) console.log('no portrait:', noPortrait.join(', '));
