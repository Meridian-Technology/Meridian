import React from 'react';
import { render, screen } from '@testing-library/react';
import PivotBatchTagRadar, { buildBatchTagStrength } from './PivotBatchTagRadar';

const TAGS = [
  { slug: 'live-music', label: 'live music' },
  { slug: 'food-and-drink', label: 'food & drink' },
  { slug: 'outdoors', label: 'outdoors' },
];

const EVENTS = [
  { _id: '1', ingestStatus: 'published', tags: ['live-music', 'food-and-drink'] },
  { _id: '2', ingestStatus: 'staged', tags: ['live-music'] },
  {
    _id: '3',
    ingestStatus: 'published',
    tags: ['food-and-drink'],
    rankingOverride: { tier: 'hidden' },
  },
  { _id: '4', ingestStatus: 'published', tags: ['outdoors'] },
];

describe('PivotBatchTagRadar', () => {
  it('summarizes total and live discovery coverage in catalog order', () => {
    expect(buildBatchTagStrength(EVENTS, TAGS)).toEqual({
      maxCatalogCount: 2,
      tags: [
        { slug: 'live-music', label: 'Live music', catalogCount: 2, liveCount: 1 },
        { slug: 'food-and-drink', label: 'Food & drink', catalogCount: 2, liveCount: 1 },
        { slug: 'outdoors', label: 'Outdoors', catalogCount: 1, liveCount: 1 },
      ],
    });
  });

  it('renders an accessible radar chart for the selected batch', () => {
    render(
      <PivotBatchTagRadar
        batchWeek="2026-W38"
        events={EVENTS}
        catalogTags={TAGS}
      />,
    );

    expect(screen.getByRole('img', { name: /tag strength for 2026-W38/i }))
      .toBeInTheDocument();
    expect(screen.getByText('Live music')).toBeInTheDocument();
    expect(screen.getByText(/published, non-hidden events/i)).toBeInTheDocument();
  });
});
