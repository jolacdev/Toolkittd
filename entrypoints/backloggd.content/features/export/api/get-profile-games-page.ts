import { queryOptions } from '@tanstack/react-query';

import { api } from '@content/lib/axios';
import { ProfileGamesPageScrapeResponse } from '@content/shared/types/api';
import { StatusFiltersState, StatusKey } from '@globalShared/storage';

import { queryKeys } from './keys';

const createFetchProfileGamesPageUrl = (
  username: string,
  selectedStatuses: StatusFiltersState,
) => {
  // Extract keys where the value is true (e.g., ['played', 'backlog'])
  const activeStatuses = Object.keys(selectedStatuses).filter(
    (key) => selectedStatuses[key as StatusKey],
  );

  if (activeStatuses.length === 0) {
    throw new Error('Select at least one status before exporting');
  }

  return `/u/${username}/games/added/type:${activeStatuses.join(',')}/`;
};

const getTotalGamesCount = (doc: Document): number => {
  for (const element of doc.querySelectorAll('.subtitle-text')) {
    const match = element.textContent?.match(/([\d,]+)\s+games\b/i);
    if (match) return Number(match[1].replace(/,/g, ''));
  }

  return 0;
};

export const parseProfileGamesPage = (
  doc: Document,
): ProfileGamesPageScrapeResponse => {
  // Backloggd 1.18 moved game cards to #user_games; scope the selector to
  // exclude Turbo placeholders while retaining the legacy container fallback.
  const gameCards = [
    ...doc.querySelectorAll(
      '#user_games .card.game-cover[game_id], #user-games-library-container .card.game-cover[game_id]',
    ),
  ];

  const scrapedGames: ProfileGamesPageScrapeResponse['games'] = gameCards.map(
    (card) => {
      const id = card.getAttribute('game_id')!; // Attribute game_id should always exist.
      const name =
        card.querySelector('.game-text-centered')?.textContent?.trim() ??
        card.querySelector('img.card-img')?.getAttribute('alt')?.trim() ??
        '';
      const path = card.querySelector('a.cover-link')?.getAttribute('href');
      const url = path ? `https://backloggd.com${path}` : '';
      const rating = card.getAttribute('data-rating') || undefined;

      return { id, name, rating, url };
    },
  );
  const totalGames = getTotalGamesCount(doc);

  return {
    games: scrapedGames,
    totalGames,
  };
};

type ProfileGamesPageParams = {
  pageNumber: number;
  selectedStatuses: StatusFiltersState;
  username: string;
};

/** Fetches and parses each collection page once, caching plain game data. */
const fetchProfileGamesPage = async (
  { pageNumber, selectedStatuses, username }: ProfileGamesPageParams,
  signal: AbortSignal,
): Promise<ProfileGamesPageScrapeResponse> => {
  try {
    const url = createFetchProfileGamesPageUrl(username, selectedStatuses);
    const result = await api.get<string>(url, {
      params: { page: pageNumber },
      signal,
    });

    const parser = new DOMParser();
    return parseProfileGamesPage(parser.parseFromString(result, 'text/html'));
  } catch (error) {
    console.error(`Failed to fetch page ${pageNumber} for user ${username}`);
    throw error;
  }
};

export const createProfileGamesPageQueryOptions = (
  params: ProfileGamesPageParams,
) =>
  queryOptions({
    staleTime: 60_000,
    queryKey: queryKeys.profileGamesPage(
      params.username,
      params.pageNumber,
      params.selectedStatuses,
    ),
    queryFn: ({ signal }) => fetchProfileGamesPage(params, signal),
  });
