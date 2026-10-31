import { queryOptions } from '@tanstack/react-query';

import { api } from '@content/lib/axios';
import { GameLogDetailsResponse } from '@content/shared/types/api';

import { queryKeys } from './keys';

/**
 * Fetches user's game log details for a specific game ID.
 */
export const fetchGameLogDetails = async (
  gameId: string,
  signal?: AbortSignal,
): Promise<GameLogDetailsResponse> =>
  await api.get<GameLogDetailsResponse>(`/log/edit/${gameId}`, { signal });

/**
 * Caches raw game logs without mounting a per-game observer or selector.
 */
export const createGameLogDetailsQueryOptions = (gameId: string) =>
  queryOptions({
    queryKey: queryKeys.gameLogDetails(gameId),
    queryFn: ({ signal }) => fetchGameLogDetails(gameId, signal),
  });
