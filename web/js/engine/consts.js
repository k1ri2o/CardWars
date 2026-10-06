// Enums and limits ported from the Unity project (GameState.cs, CardType.cs,
// Faction.cs, LandscapeType.cs, db_Parameters.json).

export const CardType = Object.freeze({ Creature: 0, Building: 1, Spell: 2, Dweeb: 3, None: 4 });
export const CardTypeName = ['Creature', 'Building', 'Spell', 'Dweeb', 'None'];

// Faction and LandscapeType share their first five members, so a faction
// string doubles as a landscape string ("Universal" <-> "None").
export const LANDSCAPES = ['Corn', 'Plains', 'Swamp', 'Cotton', 'Sand'];
export const FACTIONS = [...LANDSCAPES, 'Universal'];
export const NONE = 'None';
export const UNIVERSAL = 'Universal';

export const MAX_PLAYERS = 2;
export const CARDS_TO_DEAL = 5;
export const MAX_HAND = 7;
export const LANE_COUNT = 4;
export const STARTING_MAGIC_POINTS = 2;
export const MAX_MAGIC_POINTS = 10;
export const MIN_CARDS_IN_DECK = 10;
export const MAX_DUPLICATES_IN_DECK = 4;
export const DEFAULT_HEALTH = 25;

export const USER = 0;
export const OPPONENT = 1;
/** C#'s `!player`. */
export const other = (p) => 1 - p;

export const Phase = Object.freeze({
  Setup: 'setup',
  Battle: 'battle',
  GameOver: 'gameover',
});
