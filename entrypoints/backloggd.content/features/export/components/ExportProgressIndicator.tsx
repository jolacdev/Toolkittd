import { useTranslation } from 'react-i18next';

import { ExportProgress } from '../types';
import { getDurationParts } from '../utils/get-duration-parts';

type ExportProgressIndicatorProps = {
  progress: ExportProgress;
};

/** Reports the active export phase and completed game count. */
const ExportProgressIndicator = ({
  progress: { current, estimatedSecondsRemaining, phase, total },
}: ExportProgressIndicatorProps) => {
  const { t } = useTranslation(undefined, {
    keyPrefix: 'features.export.dialog.progress',
  });

  const isAnalyzing = phase === 'analyzing';
  const message = isAnalyzing
    ? t('analyzingCollection')
    : t('exportingGames', { current, total });

  const remainingTime =
    !isAnalyzing && estimatedSecondsRemaining !== undefined
      ? t('remainingTime', getDurationParts(estimatedSecondsRemaining))
      : undefined;

  return (
    <div
      className="border-border bg-field mt-5 rounded-md border p-3"
      role="status"
    >
      <div className="text-content flex items-center gap-3 text-sm">
        <span className="loading loading-spinner loading-sm text-primary" />
        <span>
          {message}
          {remainingTime && (
            <span className="text-content/70">
              {' · '}
              {remainingTime}
            </span>
          )}
        </span>
      </div>
      {!isAnalyzing && total > 0 && (
        <progress
          aria-label={message}
          className="progress text-primary mt-3 h-1.5 w-full"
          max={total}
          value={current}
        />
      )}
    </div>
  );
};

export default ExportProgressIndicator;
