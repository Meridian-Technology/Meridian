import React from 'react';
import { render, screen } from '@testing-library/react';
import { PivotComputeJobRunStatus } from './PivotComputeJobRunStatus';

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: jest.fn(),
}));

jest.mock('@iconify-icon/react', () => ({
  Icon: ({ icon }) => <span data-icon={icon} />,
}));

jest.mock('./ComputeJobActions', () => ({
  ComputeJobDetailActions: ({ previewButtonLabel }) => (
    <button type="button">{previewButtonLabel}</button>
  ),
}));

const BASE_JOB = {
  externalJobId: 'job:refresh-iowacity-001',
  kind: 'city-curation-refresh',
  status: 'pending',
  requestedAt: '2026-09-10T07:00:00.000Z',
};

describe('PivotComputeJobRunStatus', () => {
  it('separates durable creation from an accepted Mini wake', () => {
    render(
      <PivotComputeJobRunStatus
        job={BASE_JOB}
        wake={{ status: 'accepted', httpStatus: 202 }}
        tenantKey="iowacity"
      />,
    );

    expect(screen.getByText('Job created')).toBeInTheDocument();
    expect(screen.getByText('Mini woken')).toBeInTheDocument();
    expect(screen.getByText('The Mini accepted the wake request.')).toBeInTheDocument();
    expect(screen.getByText('Waiting for a Mini')).toBeInTheDocument();
  });

  it('shows a development job running on this machine', () => {
    render(
      <PivotComputeJobRunStatus
        job={{
          ...BASE_JOB,
          status: 'running',
          startedAt: '2026-09-10T07:00:05.000Z',
          lease: { workerId: 'dev-local' },
        }}
        wake={{ status: 'local' }}
        tenantKey="iowacity"
      />,
    );

    expect(screen.getByText('Local compute job')).toBeInTheDocument();
    expect(screen.getByText('Local runner')).toBeInTheDocument();
    expect(screen.getByText('This machine runs the scrape in process. The Mini is not woken.')).toBeInTheDocument();
    expect(screen.getByText('Claimed on this machine')).toBeInTheDocument();
    expect(screen.getByText('Running here')).toBeInTheDocument();
  });

  it('identifies the worker after execution starts', () => {
    render(
      <PivotComputeJobRunStatus
        job={{
          ...BASE_JOB,
          status: 'running',
          startedAt: '2026-09-10T07:00:05.000Z',
          lease: { workerId: 'relay-mini-1' },
        }}
        wake={{ status: 'accepted' }}
        tenantKey="iowacity"
      />,
    );

    expect(screen.getByText('Mini collected the job')).toBeInTheDocument();
    expect(screen.getByText('Worker relay-mini-1 owns this attempt.')).toBeInTheDocument();
    expect(screen.getByText('Running on the Mini')).toBeInTheDocument();
  });

  it('offers the shared review popup action when a result is ready', () => {
    render(
      <PivotComputeJobRunStatus
        job={{
          ...BASE_JOB,
          status: 'review-required',
          result: { hasEmbeddedResult: true },
        }}
        tenantKey="iowacity"
      />,
    );

    expect(screen.getByText('Finished — ready for review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open review' })).toBeInTheDocument();
  });
});
