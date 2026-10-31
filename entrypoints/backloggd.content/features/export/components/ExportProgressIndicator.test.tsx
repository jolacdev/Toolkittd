import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import enContent from '@globalShared/i18n/locales/en/content.json';

import ExportProgressIndicator from './ExportProgressIndicator';

vi.unmock('react-i18next');

describe('ExportProgressIndicator', () => {
  const i18n = createInstance();

  beforeAll(async () => {
    await i18n.use(initReactI18next).init({
      defaultNS: 'content',
      lng: 'en',
      resources: { en: { content: enContent } },
    });
  });

  const renderProgress = (estimatedSecondsRemaining?: number) =>
    render(
      <I18nextProvider i18n={i18n}>
        <ExportProgressIndicator
          progress={{
            current: 5,
            estimatedSecondsRemaining,
            phase: 'exporting',
            total: 10,
          }}
        />
      </I18nextProvider>,
    );

  it('shows the progress count without an estimate during warmup', () => {
    renderProgress();
    expect(screen.getByRole('status')).toHaveTextContent('Exporting... 5 / 10');
    expect(screen.getByRole('status')).not.toHaveTextContent('remaining');
    expect(screen.getByRole('progressbar')).toHaveAccessibleName(
      'Exporting... 5 / 10',
    );
  });

  it.each([
    [1, 'About 0h 0m 1s remaining'],
    [13, 'About 0h 0m 13s remaining'],
    [60, 'About 0h 1m 0s remaining'],
    [61, 'About 0h 1m 1s remaining'],
    [120, 'About 0h 2m 0s remaining'],
    [3600, 'About 1h 0m 0s remaining'],
    [3601, 'About 1h 0m 1s remaining'],
    [3661, 'About 1h 1m 1s remaining'],
    [7200, 'About 2h 0m 0s remaining'],
    [7325, 'About 2h 2m 5s remaining'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    renderProgress(seconds);
    expect(screen.getByRole('status')).toHaveTextContent(expected);
  });

  it('does not show an estimate while analyzing the collection', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ExportProgressIndicator
          progress={{
            current: 0,
            estimatedSecondsRemaining: 10,
            phase: 'analyzing',
            total: 0,
          }}
        />
      </I18nextProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Preparing your game collection...',
    );
    expect(screen.getByRole('status')).not.toHaveTextContent('remaining');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
