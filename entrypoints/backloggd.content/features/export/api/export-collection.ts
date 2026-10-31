import {
  FetchQueryOptions,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query';

import { ProfileGamesPageScrapeResponse } from '@content/shared/types/api';
import { StatusFiltersState } from '@globalShared/storage';

import { ExportProgress, GameDetails } from '../types';
import { createGameLogDetailsQueryOptions } from './get-game-log-details';
import { createProfileGamesPageQueryOptions } from './get-profile-games-page';
import { deduplicateProfileGames, getTotalPages } from './utils';

// Limit how many collection pages are requested at once to avoid large request bursts.
const PROFILE_PAGE_CONCURRENCY = 4;
// Pace game-detail requests to reduce the risk of rate limiting.
const SEQUENTIAL_DELAY_MS = 100;

type ExportCollectionOptions = {
  queryClient: QueryClient;
  selectedStatuses: StatusFiltersState;
  signal: AbortSignal;
  username: string;
  onProgress: (progress: ExportProgress) => void;
};

/** Cancels an in-flight cached request when its owning export is abandoned. */
const fetchExportQuery = async <T, TQueryKey extends QueryKey>(
  queryClient: QueryClient,
  options: FetchQueryOptions<T, Error, T, TQueryKey>,
  signal: AbortSignal,
): Promise<T> => {
  signal.throwIfAborted();

  // Connect the export's abort signal to this specific cached query.
  const cancelQuery = () => {
    queryClient
      .cancelQueries({ exact: true, queryKey: options.queryKey })
      .catch(() => {
        // Cancellation is best effort during teardown.
      });
  };
  signal.addEventListener('abort', cancelQuery, { once: true });

  try {
    // Preserve configured retries; fetchQuery otherwise defaults to no retries.
    const queryOptions = queryClient.defaultQueryOptions(options);
    const data = await queryClient.fetchQuery({
      ...queryOptions,
      retry: queryOptions.retry ?? 3,
    });
    signal.throwIfAborted(); // Do not publish a result after the export is cancelled.
    return data;
  } finally {
    // Each request owns its listener, even when it fails or is cancelled.
    signal.removeEventListener('abort', cancelQuery);
  }
};

/** Collects pages with bounded concurrency, then fetches details in one paced job. */
export const exportCollection = async ({
  onProgress,
  queryClient,
  selectedStatuses,
  signal,
  username,
}: ExportCollectionOptions): Promise<GameDetails[]> => {
  // Reuse the same cache and cancellation handling for every collection page.
  const fetchPage = (pageNumber: number) =>
    fetchExportQuery(
      queryClient,
      createProfileGamesPageQueryOptions({
        pageNumber,
        selectedStatuses,
        username,
      }),
      signal,
    );

  // 1. Fetch the first page to determine how many pages are needed.
  const firstPage = await fetchPage(1);
  const totalPages = getTotalPages(firstPage);
  if (totalPages === 0) return [];

  // 2. Fetch remaining pages with a shared queue and keep them in page order.
  const pages = new Array<ProfileGamesPageScrapeResponse>(totalPages);
  pages[0] = firstPage;
  let nextPageNumber = 2;

  await Promise.all(
    Array.from(
      { length: Math.min(PROFILE_PAGE_CONCURRENCY, totalPages - 1) },
      async () => {
        while (nextPageNumber <= totalPages) {
          // Claim the page before awaiting so concurrent workers cannot request it twice.
          const pageNumber = nextPageNumber++;
          pages[pageNumber - 1] = await fetchPage(pageNumber);
        }
      },
    ),
  );

  signal.throwIfAborted();
  const games = deduplicateProfileGames(pages.flatMap((page) => page.games));

  // 3. Fetch one game at a time, keeping accumulated results outside React state.
  const gameDetails: GameDetails[] = [];
  const total = games.length;
  onProgress({ current: 0, phase: 'exporting', total });

  for (const [index, game] of games.entries()) {
    signal.throwIfAborted();
    try {
      const gameLog = await fetchExportQuery(
        queryClient,
        createGameLogDetailsQueryOptions(game.id),
        signal,
      );
      gameDetails.push({ ...game, ...gameLog });
    } catch {
      // Individual failures are skipped; aborting the job must stop the queue.
      signal.throwIfAborted();
    }

    // Count failed games as processed, then pause before the next request.
    onProgress({ current: index + 1, phase: 'exporting', total });
    if (index < total - 1) {
      await new Promise((resolve) => setTimeout(resolve, SEQUENTIAL_DELAY_MS));
    }
  }

  return gameDetails;
};
