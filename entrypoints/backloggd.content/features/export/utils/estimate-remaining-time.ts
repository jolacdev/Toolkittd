type RemainingTimeEstimatorOptions = {
  minimumCompletedItems: number;
  recentIntervalCount: number;
};

/**
 * Creates an estimator for sequential work using recent completion intervals.
 *
 * Call the estimator at zero completed items and after each item, using the same
 * monotonic clock for timestamps. Create a new estimator for each run.
 *
 * @param options.minimumCompletedItems - Completed items required before estimating.
 * @param options.recentIntervalCount - Recent intervals to average; N intervals need N + 1 timestamps.
 * @returns A function accepting completed count, total count, and timestamp in milliseconds.
 * It returns rounded-up seconds, or `undefined` before enough data or after completion.
 */
export const createRemainingTimeEstimator = ({
  minimumCompletedItems,
  recentIntervalCount,
}: RemainingTimeEstimatorOptions) => {
  const timestamps: number[] = [];

  return (
    completed: number,
    total: number,
    now: number,
  ): number | undefined => {
    timestamps.push(now);
    if (timestamps.length > recentIntervalCount + 1) timestamps.shift();

    if (
      completed < minimumCompletedItems ||
      completed >= total ||
      timestamps.length < 2
    ) {
      return undefined;
    }

    const elapsed = now - timestamps[0];
    const averageMsPerItem = elapsed / (timestamps.length - 1);

    return Math.ceil((averageMsPerItem * (total - completed)) / 1000);
  };
};
