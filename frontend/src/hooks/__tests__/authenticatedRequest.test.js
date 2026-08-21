jest.mock('axios', () => {
  const axiosMock = jest.fn();
  axiosMock.post = jest.fn();
  return axiosMock;
});

import axios from 'axios';
import { resetRefreshSessionForTests } from '../../utils/refreshSession';
import { authenticatedRequest } from '../useFetch';

describe('authenticatedRequest', () => {
  beforeEach(() => {
    resetRefreshSessionForTests();
    axios.mockReset();
    axios.post.mockReset();
  });

  test('returns data on success', async () => {
    axios.mockResolvedValueOnce({ data: { success: true } });
    const result = await authenticatedRequest('/admin/pivot/ingest/1', {
      method: 'PATCH',
      data: { tenantKey: 'nyc' },
    });
    expect(result).toEqual({ data: { success: true } });
  });

  test('refreshes and retries on 401 TOKEN_EXPIRED', async () => {
    axios.mockRejectedValueOnce({
      response: { status: 401, data: { code: 'TOKEN_EXPIRED', message: 'Access token expired' } },
    });
    axios.post.mockResolvedValueOnce({ data: { success: true } });
    axios.mockResolvedValueOnce({ data: { success: true, data: { releasedCount: 1 } } });

    const result = await authenticatedRequest(
      '/admin/pivot/tenants/nyc/batches/2026-W34/release',
      { method: 'POST', data: { eventIds: ['evt1'] } },
    );

    expect(axios.post).toHaveBeenCalledWith(
      '/refresh-token',
      {},
      { withCredentials: true },
    );
    expect(result).toEqual({ data: { success: true, data: { releasedCount: 1 } } });
  });

  test('refreshes on 401 even when the body has no TOKEN_EXPIRED code', async () => {
    axios.mockRejectedValueOnce({
      response: { status: 401, data: { success: false, message: 'Authentication required' } },
    });
    axios.post.mockResolvedValueOnce({ data: { success: true } });
    axios.mockResolvedValueOnce({ data: { success: true } });

    const result = await authenticatedRequest('/admin/pivot/ingest/1', { method: 'PATCH' });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: { success: true } });
  });

  test('coalesces overlapping 401s into one refresh', async () => {
    const expired = {
      response: { status: 401, data: { code: 'TOKEN_EXPIRED' } },
    };
    axios
      .mockRejectedValueOnce(expired)
      .mockRejectedValueOnce(expired)
      .mockResolvedValue({ data: { success: true } });
    axios.post.mockResolvedValue({ data: { success: true } });

    const [first, second] = await Promise.all([
      authenticatedRequest('/admin/pivot/a', { method: 'POST' }),
      authenticatedRequest('/admin/pivot/b', { method: 'POST' }),
    ]);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ data: { success: true } });
    expect(second).toEqual({ data: { success: true } });
  });

  test('returns the retry error instead of pretending refresh failed', async () => {
    axios.mockRejectedValueOnce({
      response: { status: 401, data: { code: 'TOKEN_EXPIRED' } },
    });
    axios.post.mockResolvedValueOnce({ data: { success: true } });
    axios.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { message: 'At least one catalog tag is required for published events.' },
      },
    });

    const result = await authenticatedRequest('/admin/pivot/ingest/1', {
      method: 'PATCH',
      data: { overrides: { ingestStatus: 'published' } },
    });

    expect(result).toEqual({
      error: 'At least one catalog tag is required for published events.',
      code: 400,
    });
  });
});
