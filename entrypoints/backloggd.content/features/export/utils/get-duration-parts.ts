/** Splits a non-negative duration in seconds into whole hours, minutes and seconds. */
export const getDurationParts = (totalSeconds: number) => {
  const wholeSeconds = Math.floor(totalSeconds);

  return {
    hours: Math.floor(wholeSeconds / 3600),
    minutes: Math.floor((wholeSeconds % 3600) / 60),
    seconds: wholeSeconds % 60,
  };
};
