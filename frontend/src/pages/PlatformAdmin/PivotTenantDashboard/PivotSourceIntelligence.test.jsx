import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
jest.mock('../../../hooks/useFetch', () => ({ authenticatedRequest: jest.fn() }));
jest.mock('./PivotSourceEventHistoryPopup', () => () => null);
import PivotSourceIntelligence from './PivotSourceIntelligence';

const source = {
  _id: 'source-1', label: 'Downtown Arts', host: 'lu.ma', sourceKey: 'downtown-arts',
  provider: 'luma', status: 'qualified', enabled: true, url: 'https://lu.ma/downtown',
  entrypoints: [{ id: 'job-1', label: 'Explore', url: 'https://lu.ma/downtown',
    lastRunStatus: 'completed', lastRunAt: '2026-09-20T00:00:00Z' }],
  score: { version: 2, quality: 0.72, reputation: 0.61, sampleSize: 8, publishedCount: 6,
    batchCount: 2, computedAt: '2026-09-21T00:00:00Z', breakdown: {
      eligibleCount: 8, publishedCount: 6, featuredCount: 2,
      publishRate: 0.75, featuredRate: 0.333,
      components: { consistency: 0.66, confidence: 0.3 },
      history: [{ batchWeek: '2026-W38', eligible: 4, published: 3, featured: 1, publishRate: 0.75 }],
      entrypoints: { 'job-1': { eligible: 4, published: 3, featured: 1 } },
      windowBatchCount: 8,
    } },
  deckImpact: { automatic: 0.12, manual: 0, total: 0.12 },
};

function renderPanel(overrides = {}) {
  const actions = {
    onRefresh: jest.fn(), onRecompute: jest.fn(), onCreate: jest.fn(),
    onNewSourceChange: jest.fn(), onSetTier: jest.fn(), onToggleEnabled: jest.fn(),
  };
  render(<PivotSourceIntelligence sources={[source]} rankingSignals={{ personalInterest: 0.7, friendInterested: 0.5, friendGoing: 1.5 }} newSource={{ label: '', sourceKey: '', url: '', provider: 'luma' }} {...actions} {...overrides} />);
  return actions;
}

describe('PivotSourceIntelligence', () => {
  it('shows portfolio evidence, batch history, entrypoint yield, and deck contribution', () => {
    renderPanel();
    expect(screen.getByLabelText('Source portfolio summary')).toHaveTextContent('6/8');
    expect(screen.getByLabelText('Downtown Arts source details')).toHaveTextContent('72%');
    expect(screen.getByLabelText('Downtown Arts source details')).toHaveTextContent('61%');
    expect(screen.getByLabelText('Downtown Arts source details')).toHaveTextContent('2026-W38');
    expect(screen.getByLabelText('Downtown Arts source details')).toHaveTextContent('3/4 published');
    expect(screen.getByLabelText('Downtown Arts source details')).toHaveTextContent('Automatic +0.12');
  });

  it('filters sources and sends explicit distribution actions', () => {
    const { onSetTier, onToggleEnabled } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Strong promote' }));
    expect(onSetTier).toHaveBeenCalledWith(source, 'strong_promote');
    fireEvent.click(screen.getByRole('button', { name: 'Pause future crawls' }));
    expect(onToggleEnabled).toHaveBeenCalledWith(source);
    fireEvent.change(screen.getByLabelText('Search sources'), { target: { value: 'unrelated' } });
    expect(screen.getByText('No sources match this view.')).toBeInTheDocument();
  });

  it('makes the no-evidence state explicit', () => {
    renderPanel({ sources: [{ ...source, score: { quality: null, reputation: null, sampleSize: 0,
      breakdown: { eligibleCount: 0, publishedCount: 0, history: [], entrypoints: {} } },
      deckImpact: { automatic: 0, manual: 0, total: 0 } }] });
    expect(screen.getByText('No attributed events in released batches yet.')).toBeInTheDocument();
    expect(screen.getByLabelText('Downtown Arts source details')).toHaveTextContent('No attributed events');
  });

  it('prompts recomputation for existing scores without evidence details', () => {
    renderPanel({ sources: [{ ...source, score: { quality: 0.6, reputation: 0.5, version: 1 } }] });
    expect(screen.getByText(/older scores without an evidence breakdown/)).toBeInTheDocument();
  });

  it('explains a boost using the actual tenant signal weights', () => {
    renderPanel({ sources: [{ ...source, deckImpact: { automatic: 0.26, manual: 0, total: 0.26 } }] });
    expect(screen.getByText('What +0.26 means')).toBeInTheDocument();
    expect(screen.getByText(/gains about 0.26 points/)).toBeInTheDocument();
    expect(screen.getByLabelText('Compare source points with other deck signals')).toHaveTextContent('37% of one matching interest (+0.70)');
    expect(screen.getByLabelText('Compare source points with other deck signals')).toHaveTextContent('52% of one friend interested (+0.50)');
  });

  it('explains a penalty as a possible change in order', () => {
    renderPanel({ sources: [{ ...source, deckImpact: { automatic: -0.26, manual: 0, total: -0.26 } }] });
    expect(screen.getByText('What -0.26 means')).toBeInTheDocument();
    expect(screen.getByText(/loses about 0.26 points/)).toBeInTheDocument();
    expect(screen.getByText(/move it behind another event/)).toBeInTheDocument();
  });
});
