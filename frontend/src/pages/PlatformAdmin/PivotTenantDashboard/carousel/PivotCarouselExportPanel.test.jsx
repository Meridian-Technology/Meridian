import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PivotCarouselExportPanel from './PivotCarouselExportPanel';

jest.mock('./PivotCarouselPopup', () => ({
  __esModule: true,
  default: ({ open, children }) => (open ? <div>{children}</div> : null),
}));

const DECK = '507f1f77bcf86cd799439011';

function completedJob() {
  return {
    externalJobId: 'job:carousel-iowacity-001',
    kind: 'carousel-export',
    status: 'completed',
    options: { deckId: DECK, deckRevision: '2026-09-11T19:58:00.000Z' },
    completedAt: '2026-09-11T20:08:00.000Z',
    result: {
      renderedDeckRevision: '2026-09-11T19:58:00.000Z',
      renderDurationMs: 180000,
    },
    exportArtifacts: {
      expired: false,
      artifacts: [
        {
          logicalName: 'slide-01.png',
          artifactId: 'artifact:slide-01',
          mimeType: 'image/png',
          byteCount: 1200000,
          slideNumber: 1,
        },
        {
          logicalName: 'carousel.zip',
          artifactId: 'artifact:zip',
          mimeType: 'application/zip',
          byteCount: 2100000,
          slideNumber: null,
        },
      ],
    },
  };
}

describe('PivotCarouselExportPanel', () => {
  it('shows render progress and never offers preview or apply', () => {
    render(
      <PivotCarouselExportPanel
        open
        uiState="rendering"
        progressLabel="Rendering slide 4 of 8"
        job={{
          externalJobId: 'job:carousel-iowacity-001',
          kind: 'carousel-export',
          status: 'running',
          options: { deckId: DECK, deckRevision: '2026-09-11T19:58:00.000Z' },
        }}
        onClose={() => {}}
        onOpen={() => {}}
        onCancel={() => {}}
        onRetry={() => {}}
        onDownload={() => {}}
      />,
    );

    const panel = screen.getByTestId('carousel-export-panel');
    expect(panel).toHaveTextContent('Rendering slide 4 of 8');
    expect(panel).toHaveTextContent('Cancel');
    expect(panel).not.toHaveTextContent(/preview/i);
    expect(panel).not.toHaveTextContent(/apply/i);
  });

  it('offers ZIP and slide downloads after completion', () => {
    const onDownload = jest.fn();
    render(
      <PivotCarouselExportPanel
        open
        uiState="completed"
        progressLabel="Completed"
        job={completedJob()}
        onClose={() => {}}
        onOpen={() => {}}
        onCancel={() => {}}
        onRetry={() => {}}
        onDownload={onDownload}
      />,
    );

    expect(screen.getByTestId('carousel-export-panel')).toHaveTextContent('Rendered revision');
    expect(screen.getByTestId('carousel-export-panel')).toHaveTextContent('3m');
    fireEvent.click(within(screen.getByTestId('carousel-export-panel')).getByRole('button', { name: /Download ZIP/i }));
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ artifactId: 'artifact:zip' }));
    fireEvent.click(screen.getByRole('button', { name: /Slide 01/i }));
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ artifactId: 'artifact:slide-01' }));
  });

  it('offers a PNG download when the export is a single slide', () => {
    const onDownload = jest.fn();
    const job = completedJob();
    job.exportArtifacts.artifacts = [job.exportArtifacts.artifacts[0]];
    render(
      <PivotCarouselExportPanel
        open
        uiState="completed"
        progressLabel="Completed"
        job={job}
        onClose={() => {}}
        onOpen={() => {}}
        onCancel={() => {}}
        onRetry={() => {}}
        onDownload={onDownload}
      />,
    );

    const panel = screen.getByTestId('carousel-export-panel');
    expect(within(panel).queryByRole('button', { name: /Download ZIP/i })).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: /Download PNG/i }));
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ artifactId: 'artifact:slide-01' }));
  });

  it('keeps a completed export on the page after the popup closes', () => {
    render(
      <PivotCarouselExportPanel
        open={false}
        uiState="completed"
        progressLabel="Completed"
        job={completedJob()}
        onClose={() => {}}
        onOpen={() => {}}
        onCancel={() => {}}
        onRetry={() => {}}
        onDownload={() => {}}
      />,
    );

    expect(screen.queryByTestId('carousel-export-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Completed');
    expect(screen.getByRole('button', { name: /Download ZIP/i })).toBeInTheDocument();
  });

  it('hides the completed strip when asked', () => {
    render(
      <PivotCarouselExportPanel
        open={false}
        showStrip={false}
        uiState="completed"
        progressLabel="Completed"
        job={completedJob()}
        onClose={() => {}}
        onOpen={() => {}}
        onCancel={() => {}}
        onRetry={() => {}}
        onDownload={() => {}}
      />,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download ZIP/i })).not.toBeInTheDocument();
  });

  it('names a finalization failure and offers retry', () => {
    const onRetry = jest.fn();
    render(
      <PivotCarouselExportPanel
        open
        uiState="failed"
        failureLabel="Finalization failed"
        job={{
          ...completedJob(),
          status: 'retryable',
          exportArtifacts: null,
          result: null,
        }}
        onClose={() => {}}
        onOpen={() => {}}
        onCancel={() => {}}
        onRetry={onRetry}
        onDownload={() => {}}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Finalization failed');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('warns when the saved deck moves ahead of the exporting revision', () => {
    render(
      <PivotCarouselExportPanel
        open
        uiState="rendering"
        progressLabel="Rendering slide 1 of 2"
        revisionStale
        job={{
          externalJobId: 'job:carousel-iowacity-001',
          status: 'running',
          options: { deckId: DECK, deckRevision: '2026-09-11T19:58:00.000Z' },
        }}
        onClose={() => {}}
        onOpen={() => {}}
        onCancel={() => {}}
        onRetry={() => {}}
        onDownload={() => {}}
      />,
    );

    expect(screen.getByTestId('carousel-export-panel')).toHaveTextContent(
      'still rendering revision 2026-09-11T19:58:00.000Z',
    );
  });
});
