// Deck lists: the game's preset decks plus the player's own, saved in the browser.
import { LANDSCAPES, MIN_CARDS_IN_DECK, MAX_DUPLICATES_IN_DECK } from './engine/consts.js';
import { storage, store } from './ui/dom.js';

export const MAX_CARDS_IN_DECK = 60;
const KEY = 'cardwars.decks';

export function presetDecks(db) {
  return db.decks.map((d) => ({ ...d, preset: true }));
}

export function customDecks() {
  return storage(KEY, []);
}

export function saveCustomDeck(deck) {
  const list = customDecks().filter((d) => d.id !== deck.id);
  list.unshift(deck);
  store(KEY, list);
}

export function deleteCustomDeck(id) {
  store(KEY, customDecks().filter((d) => d.id !== id));
}

export function allDecks(db) {
  return [...customDecks(), ...presetDecks(db)];
}

export function findDeck(db, id) {
  return allDecks(db).find((d) => d.id === id) || null;
}

/** Returns an error string, or null when the deck can be played. */
export function validateDeck(db, d) {
  if (!d || typeof d !== 'object') return 'No deck';
  if (!d.leader || !db.leaders[d.leader]) return 'Pick a hero';
  if (!Array.isArray(d.landscapes) || d.landscapes.length !== 4 || !d.landscapes.every((l) => LANDSCAPES.includes(l))) {
    return 'Pick 4 landscapes';
  }
  if (!Array.isArray(d.cards)) return 'No cards';
  if (d.cards.length < MIN_CARDS_IN_DECK) return `A deck needs at least ${MIN_CARDS_IN_DECK} cards`;
  if (d.cards.length > MAX_CARDS_IN_DECK) return `A deck can have at most ${MAX_CARDS_IN_DECK} cards`;
  const counts = {};
  for (const id of d.cards) {
    if (!db.forms[id]) return 'Unknown card ' + id;
    counts[id] = (counts[id] || 0) + 1;
  }
  // The game's own preset decks are trusted even where they break the copy limit.
  if (!d.preset) {
    const over = Object.keys(counts).find((id) => counts[id] > MAX_DUPLICATES_IN_DECK);
    if (over) return `At most ${MAX_DUPLICATES_IN_DECK} copies of ${db.forms[over].name}`;
  }
  return null;
}

/** The plain description the engine and the network use. */
export function deckDesc(d) {
  return { name: d.name, leader: d.leader, landscapes: [...d.landscapes], cards: [...d.cards], preset: !!d.preset };
}

export function encodeDeck(d) {
  const json = JSON.stringify({ n: d.name, l: d.leader, ls: d.landscapes, c: d.cards });
  return 'CW1.' + btoa(unescape(encodeURIComponent(json))).replace(/=+$/, '');
}

export function decodeDeck(code) {
  const s = String(code || '').trim();
  if (!s.startsWith('CW1.')) throw new Error("That isn't a Card Wars deck code");
  const json = JSON.parse(decodeURIComponent(escape(atob(s.slice(4)))));
  return { id: 'my-' + Date.now().toString(36), name: json.n || 'Imported deck', leader: json.l, landscapes: json.ls, cards: json.c };
}
