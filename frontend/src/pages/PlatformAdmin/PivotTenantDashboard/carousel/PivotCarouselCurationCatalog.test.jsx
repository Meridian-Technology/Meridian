import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PivotCarouselCurationCatalog from './PivotCarouselCurationCatalog';

jest.mock('../../PivotLab/PivotImportThumb', () => ({
  __esModule: true,
  default: ({ alt }) => <span>{alt || 'thumb'}</span>,
}));

const CANDIDATES = [
  {
    ref: { sourceTenantKey: 'sf', eventId: 'feat' },
    snapshot: {
      name: 'Older featured',
      host: 'Just Go',
      startTime: '2026-09-08T20:00:00.000Z',
      location: 'The Chapel',
      tags: ['music'],
      featured: true,
      image: 'https://cdn.example/feat.jpg',
    },
  },
  {
    ref: { sourceTenantKey: 'sf', eventId: 'reg' },
    snapshot: {
      name: 'Tonight',
      host: 'Nadine',
      startTime: '2026-09-20T20:00:00.000Z',
      location: 'warehouse',
      tags: ['jazz'],
      featured: false,
      image: 'https://cdn.example/tonight.jpg',
    },
  },
];

describe('carousel catalog rows', () => {
  test('uses the curation row labels and has no publish actions', () => {
    const onToggle = jest.fn();
    render(
      <PivotCarouselCurationCatalog
        candidates={CANDIDATES}
        selectedKeys={new Set(['sf:feat'])}
        onToggle={onToggle}
      />,
    );

    expect(screen.getByText('Older featured', { selector: '.pivot-curation-sheet__name' })).toBeInTheDocument();
    expect(screen.getByText('Featured')).toBeInTheDocument();
    expect(screen.getByText('Tonight', { selector: '.pivot-curation-sheet__name' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish|stage|weight|feature/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Tonight', { selector: '.pivot-curation-sheet__name' }));
    expect(onToggle).toHaveBeenCalledWith(CANDIDATES[1]);
    fireEvent.doubleClick(screen.getByText('Tonight', { selector: '.pivot-curation-sheet__name' }));
    expect(screen.getByRole('complementary', { name: /tonight details/i })).toBeInTheDocument();
  });
});
