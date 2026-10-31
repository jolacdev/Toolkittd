/* eslint-disable perfectionist/sort-objects */
import { useQueryClient } from '@tanstack/react-query';

import { StatusFiltersState } from '@globalShared/storage';

import { exportCollection } from '../api/export-collection';
import { ExportProgress, GameDetails } from '../types';
import { createRemainingTimeEstimator } from '../utils/estimate-remaining-time';

type UseExportProps = {
  username: string;
};

// Wait for a few games to finish before showing an estimate.
const MIN_COMPLETED_GAMES = 5;
// Average recent game timings so the estimate adapts to changing speeds.
const RECENT_GAMES = 10;

/** Keeps only progress in React while one export job owns the growing results. */
const useExport = ({ username }: UseExportProps) => {
  const queryClient = useQueryClient();
  const activeExport = useRef<AbortController | undefined>(undefined);
  const [gameDetails, setGameDetails] = useState<GameDetails[]>([]);
  const [progress, setProgress] = useState<ExportProgress>({
    phase: 'idle',
    current: 0,
    total: 0,
  });

  useEffect(() => () => activeExport.current?.abort(), []);

  const fetchData = (selectedStatuses: StatusFiltersState) => {
    if (
      activeExport.current ||
      !username ||
      !Object.values(selectedStatuses).some(Boolean)
    ) {
      return;
    }

    const controller = new AbortController();
    const estimateRemainingTime = createRemainingTimeEstimator({
      minimumCompletedItems: MIN_COMPLETED_GAMES,
      recentIntervalCount: RECENT_GAMES,
    });
    activeExport.current = controller;
    setProgress({ phase: 'analyzing', current: 0, total: 0 });

    exportCollection({
      queryClient,
      selectedStatuses: { ...selectedStatuses },
      signal: controller.signal,
      username,
      onProgress: (nextProgress) => {
        const estimatedSecondsRemaining = estimateRemainingTime(
          nextProgress.current,
          nextProgress.total,
          performance.now(),
        );
        setProgress(
          estimatedSecondsRemaining === undefined
            ? nextProgress
            : {
                ...nextProgress,
                // Show at least one second while an estimate is available.
                estimatedSecondsRemaining: Math.max(
                  1,
                  estimatedSecondsRemaining,
                ),
              },
        );
      },
    })
      .then((details) => {
        if (controller.signal.aborted) return;
        setGameDetails(details);
        setProgress((previous) => ({ ...previous, phase: 'complete' }));
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        controller.abort(); // Stop remaining collection-page workers on failure.
        setProgress((previous) => ({ ...previous, phase: 'error' }));
      });
  };

  return {
    fetchData,
    gameDetails,
    isComplete: progress.phase === 'complete',
    isError: progress.phase === 'error',
    progress,
  };
};

export default useExport;
