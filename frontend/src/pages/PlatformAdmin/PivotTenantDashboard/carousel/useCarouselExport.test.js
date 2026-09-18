import { act, renderHook, waitFor } from '@testing-library/react';
import useCarouselExport from './useCarouselExport';
import { writeExportSession } from './pivotCarouselExport';

const mockAuthenticatedRequest = jest.fn();
const mockAddNotification = jest.fn();

jest.mock('../../../../hooks/useFetch', () => ({
  authenticatedRequest: (...args) => mockAuthenticatedRequest(...args),
}));

jest.mock('../../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: mockAddNotification }),
}));

const DECK = '507f1f77bcf86cd799439011';
const REVISION = '2026-09-11T19:58:00.000Z';

function pendingJob(overrides = {}) {
  return {
    externalJobId: 'job:carousel-iowacity-001',
    kind: 'carousel-export',
    status: 'pending',
    tenantKey: 'iowacity',
    options: { deckId: DECK, deckRevision: REVISION },
    ...overrides,
  };
}

describe('useCarouselExport', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockAuthenticatedRequest.mockReset();
    mockAddNotification.mockReset();
  });

  it('restores an in-flight export after a refresh', async () => {
    writeExportSession('iowacity', DECK, {
      jobId: 'job:carousel-iowacity-001',
      panelOpen: true,
      createKey: 'idem:carousel-restore',
    });
    mockAuthenticatedRequest.mockImplementation(async (url) => {
      if (url === '/admin/pivot/compute-jobs') {
        return { data: { jobs: [pendingJob({ status: 'running' })] } };
      }
      return { data: { job: pendingJob({ status: 'running' }) } };
    });

    const { result, unmount } = renderHook(() => useCarouselExport({
      tenantKey: 'iowacity',
      deck: { _id: DECK, updatedAt: REVISION },
      dirty: false,
    }));

    await waitFor(() => {
      expect(result.current.job?.externalJobId).toBe('job:carousel-iowacity-001');
    });
    expect(result.current.panelOpen).toBe(true);
    expect(result.current.uiState).toBe('rendering');
    unmount();
  });

  it('reuses one idempotency key when Export is clicked twice', async () => {
    const created = [];
    mockAuthenticatedRequest.mockImplementation(async (url, options) => {
      if (url === '/admin/pivot/compute-jobs' && options?.method === 'POST') {
        created.push(options.data.request);
        return { data: { job: pendingJob(), created: created.length === 1, wake: { status: 'accepted' } } };
      }
      if (url === '/admin/pivot/compute-jobs') {
        return { data: { jobs: [] } };
      }
      return { data: { job: pendingJob() } };
    });

    const { result, unmount } = renderHook(() => useCarouselExport({
      tenantKey: 'iowacity',
      deck: { _id: DECK, updatedAt: REVISION },
      dirty: false,
    }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalled());
    await act(async () => {
      await result.current.startExport();
      await result.current.startExport();
    });

    expect(created).toHaveLength(1);
    expect(created[0].idempotencyKey).toMatch(/^idem:carousel-iowacity-/);
    expect(created[0].idempotencyKey).toMatch(/^[a-zA-Z0-9:_-]{8,128}$/);
    expect(created[0].options).toEqual({ deckId: DECK, deckRevision: REVISION });
    expect(result.current.uiState).toBe('relay-notified');
    unmount();
  });

  it('asks the job to render only the chosen slides', async () => {
    const created = [];
    mockAuthenticatedRequest.mockImplementation(async (url, options) => {
      if (url === '/admin/pivot/compute-jobs' && options?.method === 'POST') {
        created.push(options.data.request);
        return { data: { job: pendingJob(), created: true, wake: { status: 'accepted' } } };
      }
      if (url === '/admin/pivot/compute-jobs') {
        return { data: { jobs: [] } };
      }
      return { data: { job: pendingJob() } };
    });

    const { result, unmount } = renderHook(() => useCarouselExport({
      tenantKey: 'iowacity',
      deck: { _id: DECK, updatedAt: REVISION, slides: [{}, {}, {}] },
      dirty: false,
    }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalled());
    await act(async () => {
      await result.current.startExport([2]);
    });

    expect(created[0].options).toEqual({
      deckId: DECK,
      deckRevision: REVISION,
      slideNumbers: [2],
    });
    expect(created[0].idempotencyKey).toMatch(new RegExp(`^idem:carousel-iowacity-${DECK}-2-`));
    expect(created[0].idempotencyKey).toMatch(/^[a-zA-Z0-9:_-]{8,128}$/);
    unmount();
  });

  it('does not put dots in the idempotency key for a multi-slide export', async () => {
    const created = [];
    mockAuthenticatedRequest.mockImplementation(async (url, options) => {
      if (url === '/admin/pivot/compute-jobs' && options?.method === 'POST') {
        created.push(options.data.request);
        return { data: { job: pendingJob(), created: true, wake: { status: 'accepted' } } };
      }
      if (url === '/admin/pivot/compute-jobs') {
        return { data: { jobs: [] } };
      }
      return { data: { job: pendingJob() } };
    });

    const { result, unmount } = renderHook(() => useCarouselExport({
      tenantKey: 'iowacity',
      deck: { _id: DECK, updatedAt: REVISION, slides: [{}, {}, {}] },
      dirty: false,
    }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalled());
    await act(async () => {
      await result.current.startExport([1, 3]);
    });

    expect(created[0].idempotencyKey).toMatch(new RegExp(`^idem:carousel-iowacity-${DECK}-1-3-`));
    expect(created[0].idempotencyKey).toMatch(/^[a-zA-Z0-9:_-]{8,128}$/);
    unmount();
  });

  it('does not create a job when the frontend flag is off', async () => {
    const previous = process.env.REACT_APP_ENABLE_CAROUSEL_EXPORT;
    process.env.REACT_APP_ENABLE_CAROUSEL_EXPORT = 'false';
    mockAuthenticatedRequest.mockResolvedValue({ data: { jobs: [] } });
    const { result, unmount } = renderHook(() => useCarouselExport({
      tenantKey: 'iowacity',
      deck: { _id: DECK, updatedAt: REVISION },
      dirty: false,
    }));
    await waitFor(() => expect(result.current.uiEnabled).toBe(false));
    await act(async () => {
      await result.current.startExport();
    });
    expect(mockAuthenticatedRequest.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
    unmount();
    if (previous === undefined) delete process.env.REACT_APP_ENABLE_CAROUSEL_EXPORT;
    else process.env.REACT_APP_ENABLE_CAROUSEL_EXPORT = previous;
  });

  it('downloads ZIP and slide files through the tenant-authorized artifact route', async () => {
    const completed = pendingJob({
      status: 'completed',
      exportArtifacts: {
        artifacts: [
          { artifactId: 'artifact:zip', mimeType: 'application/zip', logicalName: 'carousel.zip' },
          { artifactId: 'artifact:slide-01', mimeType: 'image/png', logicalName: 'slide-01.png', slideNumber: 1 },
        ],
      },
    });
    mockAuthenticatedRequest.mockImplementation(async (url) => {
      if (url === '/admin/pivot/compute-jobs') return { data: { jobs: [completed] } };
      if (String(url).includes('/artifacts/')) {
        return { data: { downloadUrl: 'https://s3.test/carousel.zip', filename: 'carousel.zip' } };
      }
      return { data: { job: completed } };
    });
    const { result, unmount } = renderHook(() => useCarouselExport({
      tenantKey: 'iowacity',
      deck: { _id: DECK, updatedAt: REVISION },
      dirty: false,
    }));
    await waitFor(() => expect(result.current.job?.status).toBe('completed'));
    await act(async () => {
      await result.current.downloadArtifact(completed.exportArtifacts.artifacts[0]);
    });
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      `/admin/pivot/compute-jobs/${encodeURIComponent(completed.externalJobId)}/artifacts/${encodeURIComponent('artifact:zip')}`,
      expect.objectContaining({ params: { tenantKey: 'iowacity' } }),
    );
    unmount();
  });
});
