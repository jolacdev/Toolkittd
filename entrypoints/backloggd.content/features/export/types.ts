/* eslint-disable perfectionist/sort-object-types */
import {
  GameLogDetailsResponse,
  ProfileGameScrapeResponse,
} from '@content/shared/types/api';

/**
 * The lifecycle phase of an export run.
 *
 * - `idle`: no export in progress.
 * - `analyzing`: resolving how many pages/games exist (profile page scraping).
 * - `exporting`: fetching per-game details (main data for creating the CSV/JSON).
 * - `complete`: every game-detail request has settled (success or error).
 * - `error`: the game list could not be fetched, so there is nothing to export.
 * Note: Only profile-page fetches can reach 'error'; individual game-detail failures are tolerated.
 */
export type ExportPhase =
  | 'analyzing'
  | 'complete'
  | 'error'
  | 'exporting'
  | 'idle';

export type ExportProgress = {
  phase: ExportPhase;
  current: number;
  total: number;
};

/**
 * This type is used to provide comprehensive details about each game in the user's backlog.
 *
 * It includes all the attributes from both request responses {@link ProfileGameScrapeResponse} and {@link GameLogDetailsResponse}
 */
export type GameDetails = ProfileGameScrapeResponse & GameLogDetailsResponse;

/**
 * This type defines the data for the CSV export format.
 */
export type GameDetailsCSV = {
  // GET - Profile Games Page
  id: number;
  name: string;
  url: string;

  // GET - Game Log Details
  // Attributes from `game_log`
  // --- Status ---
  is_play: boolean;
  is_playing: boolean;
  is_backlog: boolean;
  is_wishlist: boolean;
  total_hours: number;
  total_minutes: number;
  // --- Flags ---
  game_liked: boolean;
  // Attributes from `playthroughs[0]`
  // NOTE: For attributes with two types, the type `string` is used to handle missing values in the CSV export.
  // --- Time Played ---
  hours_played: number | string;
  mins_played: number | string;
  hours_finished: number | string;
  mins_finished: number | string;
  hours_mastered: number | string;
  mins_mastered: number | string;
  // --- Dates ---
  start_date: string;
  finish_date: string;
  // --- Flags ---
  is_master: boolean | string;
  is_replay: boolean | string;
  // --- Review ---
  rating: number | string;
  review: string;
  review_spoilers: boolean | string;
};

/**
 * This type defines the data for the JSON export format.
 */
export type GameDetailsJSON = Pick<ProfileGameScrapeResponse, 'id' | 'name'> &
  GameLogDetailsResponse;
