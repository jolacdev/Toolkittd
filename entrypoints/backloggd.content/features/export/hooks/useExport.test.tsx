import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { MockInstance } from 'vitest';

import { api } from '@content/lib/axios';

import { exportCollection } from '../api/export-collection';
import { queryKeys } from '../api/keys';
import useExport from './useExport';

describe('useExport', () => {
  const selectedStatuses = {
    backlog: false,
    played: true,
    playing: false,
    wishlist: false,
  };
  const gameLog = { most_recent_playthrough_id: null, playthroughs: {} };
  const pageHtml = (ids: string[], total = ids.length) => `
  <p class="subtitle-text">${total} games</p>
  <div id="user_games">${ids
    .map(
      (id) => `
    <div class="card game-cover" game_id="${id}">
      <a class="cover-link" href="/games/game-${id}/"></a>
      <img class="card-img" alt="Game ${id}" />
    </div>`,
    )
    .join('')}
  </div>`;

  let queryClient: QueryClient;
  let get: MockInstance<typeof api.get>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Infinity, retry: false, staleTime: Infinity },
      },
    });
    get = vi.spyOn(api, 'get');
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    vi.useRealTimers();
  });

  const renderExport = (username = 'tester') => {
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => useExport({ username }), { wrapper: Wrapper });
  };

  it('paces requests, reports skipped games, and publishes results only at completion', async () => {
    const requestTimes: number[] = [];
    get.mockImplementation(async (url) => {
      if (!url.startsWith('/log/')) return pageHtml(['1', '2', '3']);
      requestTimes.push(Date.now());
      if (url === '/log/edit/2') throw new Error('Unavailable game');
      return gameLog;
    });
    const { result } = renderExport();
    const initialDetails = result.current.gameDetails;
    await act(async () => {
      result.current.fetchData(selectedStatuses);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.progress).toEqual({
      current: 1,
      phase: 'exporting',
      total: 3,
    });
    expect(result.current.gameDetails).toBe(initialDetails);
    expect(requestTimes).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(99));
    expect(requestTimes).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current.progress.current).toBe(2);
    expect(result.current.gameDetails).toBe(initialDetails);
    await act(() => vi.advanceTimersByTimeAsync(100));

    expect(result.current.progress).toEqual({
      current: 3,
      phase: 'complete',
      total: 3,
    });
    expect(result.current.gameDetails).toEqual([
      {
        id: '1',
        name: 'Game 1',
        rating: undefined,
        url: 'https://backloggd.com/games/game-1/',
        ...gameLog,
      },
      {
        id: '3',
        name: 'Game 3',
        rating: undefined,
        url: 'https://backloggd.com/games/game-3/',
        ...gameLog,
      },
    ]);
    expect(requestTimes.map((time) => time - requestTimes[0])).toEqual([
      0, 100, 200,
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows an estimate after five games and removes it on completion', async () => {
    get.mockImplementation(async (url) =>
      url.startsWith('/log/')
        ? gameLog
        : pageHtml(['1', '2', '3', '4', '5', '6']),
    );
    const { result } = renderExport();
    await act(async () => {
      result.current.fetchData(selectedStatuses);
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.progress.current).toBe(4);
    expect(result.current.progress.estimatedSecondsRemaining).toBeUndefined();

    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(result.current.progress.current).toBe(5);
    expect(result.current.progress.estimatedSecondsRemaining).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.progress.estimatedSecondsRemaining).toBeUndefined();
  });

  it('bounds page concurrency and preserves page order when responses arrive out of order', async () => {
    const resolvePages = new Map<number, (html: string) => void>();
    get.mockImplementation(async (url, config) => {
      if (url.startsWith('/log/')) return gameLog;
      const page = Number(config?.params.page);
      if (page === 1) return pageHtml(['1', '2'], 12);
      return new Promise<string>((resolve) => resolvePages.set(page, resolve));
    });
    const onProgress = vi.fn();
    const promise = exportCollection({
      onProgress,
      queryClient,
      selectedStatuses,
      signal: new AbortController().signal,
      username: 'tester',
    });
    await vi.advanceTimersByTimeAsync(0);
    expect([...resolvePages.keys()]).toEqual([2, 3, 4, 5]);

    resolvePages.get(4)!(pageHtml(['7', '8'], 12));
    await vi.advanceTimersByTimeAsync(0);
    expect(resolvePages.has(6)).toBe(true);
    resolvePages.get(6)!(pageHtml(['11', '12'], 12));
    resolvePages.get(5)!(pageHtml(['9', '10'], 12));
    resolvePages.get(3)!(pageHtml(['5', '6'], 12));
    resolvePages.get(2)!(pageHtml(['2', '4'], 12));
    await vi.runAllTimersAsync();

    expect((await promise).map(({ id }) => id)).toEqual([
      '1',
      '2',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
    ]);
    expect(
      get.mock.calls.filter(([url]) => !url.startsWith('/log/')),
    ).toHaveLength(6);
    expect(onProgress).toHaveBeenLastCalledWith({
      current: 11,
      phase: 'exporting',
      total: 11,
    });
  });

  it('parses collection pages once and mounts no observers while progress renders', async () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    get.mockImplementation(async (url, config) => {
      if (url.startsWith('/log/')) return gameLog;
      return Number(config?.params.page) === 1
        ? pageHtml(['1', '2'], 4)
        : pageHtml(['3', '4'], 4);
    });
    const { rerender, result } = renderExport();
    await act(async () => {
      result.current.fetchData(selectedStatuses);
      await vi.advanceTimersByTimeAsync(0);
    });
    rerender();
    await act(() => vi.runAllTimersAsync());

    expect(result.current.gameDetails).toHaveLength(4);
    expect(parse).toHaveBeenCalledTimes(2);
    const cachedPage = queryClient.getQueryData(
      queryKeys.profileGamesPage('tester', 1, selectedStatuses),
    );
    expect(cachedPage).toMatchObject({
      games: [{ id: '1' }, { id: '2' }],
      totalGames: 4,
    });
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .every((query) => query.getObserversCount() === 0),
    ).toBe(true);
  });

  it('reuses fresh cached responses on another export without parsing again', async () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    get.mockImplementation(async (url) =>
      url.startsWith('/log/') ? gameLog : pageHtml(['1']),
    );
    const first = renderExport();
    await act(async () => {
      first.result.current.fetchData(selectedStatuses);
      await vi.runAllTimersAsync();
    });
    first.unmount();
    const second = renderExport();
    await act(async () => {
      second.result.current.fetchData(selectedStatuses);
      await vi.runAllTimersAsync();
    });
    expect(second.result.current.gameDetails).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(2);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('cancels an active detail request on unmount and does not start the next game', async () => {
    let requestSignal: AbortSignal | undefined;
    get.mockImplementation(async (url, config) => {
      if (!url.startsWith('/log/')) return pageHtml(['1', '2']);
      requestSignal = config?.signal as AbortSignal;
      return new Promise(() => {});
    });
    const { result, unmount } = renderExport();
    await act(async () => {
      result.current.fetchData(selectedStatuses);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(requestSignal?.aborted).toBe(false);
    unmount();
    await vi.runAllTimersAsync();
    expect(requestSignal?.aborted).toBe(true);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('stops between games when the dialog unmounts during the pacing delay', async () => {
    get.mockImplementation(async (url) =>
      url.startsWith('/log/') ? gameLog : pageHtml(['1', '2']),
    );
    const { result, unmount } = renderExport();
    await act(async () => {
      result.current.fetchData(selectedStatuses);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.progress.current).toBe(1);
    unmount();
    await vi.runAllTimersAsync();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('fails a collection-page error, cancels other page requests, and fetches no details', async () => {
    const pageSignals: AbortSignal[] = [];
    let rejectPage: (error: Error) => void = () => {};
    get.mockImplementation(async (_url, config) => {
      const page = Number(config?.params.page);
      if (page === 1) return pageHtml(['1'], 6);
      pageSignals.push(config?.signal as AbortSignal);
      return new Promise<string>((_resolve, reject) => {
        if (page === 2) rejectPage = reject;
      });
    });
    const { result } = renderExport();
    await act(async () => {
      result.current.fetchData(selectedStatuses);
      await vi.advanceTimersByTimeAsync(0);
      rejectPage(new Error('Failed page'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isError).toBe(true);
    expect(result.current.gameDetails).toEqual([]);
    expect(pageSignals.slice(1).every((signal) => signal.aborted)).toBe(true);
    expect(get.mock.calls.every(([url]) => !url.startsWith('/log/'))).toBe(
      true,
    );
    expect(get).toHaveBeenCalledTimes(5);
  });

  it('completes empty collections without requesting details', async () => {
    get.mockResolvedValue(pageHtml([]));
    const { result } = renderExport();
    await act(async () => {
      result.current.fetchData(selectedStatuses);
      await vi.runAllTimersAsync();
    });
    expect(result.current.isComplete).toBe(true);
    expect(result.current.gameDetails).toEqual([]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('ignores invalid selections and duplicate starts', async () => {
    get.mockImplementation(async (url) =>
      url.startsWith('/log/') ? gameLog : pageHtml(['1']),
    );
    const { result } = renderExport();
    const anonymous = renderExport('');
    await act(async () => {
      result.current.fetchData({ ...selectedStatuses, played: false });
      anonymous.result.current.fetchData(selectedStatuses);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(get).not.toHaveBeenCalled();
    await act(async () => {
      result.current.fetchData(selectedStatuses);
      result.current.fetchData(selectedStatuses);
      await vi.runAllTimersAsync();
    });
    expect(result.current.isComplete).toBe(true);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('keeps configured retries before skipping a failed game', async () => {
    queryClient.setDefaultOptions({
      queries: { gcTime: Infinity, retry: 1, retryDelay: 10 },
    });
    let attempts = 0;
    get.mockImplementation(async (url) => {
      if (!url.startsWith('/log/')) return pageHtml(['1', '2']);
      if (url === '/log/edit/1' && attempts++ === 0) {
        throw new Error('Transient failure');
      }
      return gameLog;
    });
    const { result } = renderExport();
    await act(async () => {
      result.current.fetchData(selectedStatuses);
      await vi.runAllTimersAsync();
    });
    expect(result.current.gameDetails.map(({ id }) => id)).toEqual(['1', '2']);
    expect(
      get.mock.calls.filter(([url]) => url === '/log/edit/1'),
    ).toHaveLength(2);
  });

  it('preserves three default retries and skips only the game that exhausts them', async () => {
    queryClient.setDefaultOptions({ queries: { gcTime: Infinity } });
    get.mockImplementation(async (url) => {
      if (!url.startsWith('/log/')) return pageHtml(['1', '2']);
      if (url === '/log/edit/1') throw new Error('Unavailable game');
      return gameLog;
    });
    const { result } = renderExport();
    await act(async () => {
      result.current.fetchData(selectedStatuses);
      await vi.runAllTimersAsync();
    });
    expect(result.current.progress).toEqual({
      current: 2,
      phase: 'complete',
      total: 2,
    });
    expect(result.current.gameDetails.map(({ id }) => id)).toEqual(['2']);
    expect(
      get.mock.calls.filter(([url]) => url === '/log/edit/1'),
    ).toHaveLength(4);
  });

  it('exports 5000 synthetic games with one parse per page and no per-game subscriptions', async () => {
    const count = 5000;
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    get.mockImplementation(async (url, config) => {
      if (url.startsWith('/log/')) return gameLog;
      const start = (Number(config?.params.page) - 1) * 40;
      return pageHtml(
        Array.from({ length: 40 }, (_, index) => String(start + index)),
        count,
      );
    });
    const { result } = renderExport();
    await act(async () => {
      result.current.fetchData(selectedStatuses);
      await vi.runAllTimersAsync();
    });

    expect(result.current.isComplete).toBe(true);
    expect(result.current.progress.current).toBe(count);
    expect(result.current.gameDetails.map(({ id }) => id)).toEqual(
      Array.from({ length: count }, (_, index) => String(index)),
    );
    expect(parse).toHaveBeenCalledTimes(count / 40);
    expect(get).toHaveBeenCalledTimes(count + count / 40);
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .every((query) => query.getObserversCount() === 0),
    ).toBe(true);
  }, 20_000);
});
