jest.mock('axios', () => {
  const axiosMock = jest.fn();
  axiosMock.post = jest.fn();
  return axiosMock;
});

import axios from 'axios';
import {
  refreshSession,
  isForceLogoutRefreshError,
  resetRefreshSessionForTests,
} from '../refreshSession';

describe('refreshSession', () => {
  beforeEach(() => {
    resetRefreshSessionForTests();
    axios.post.mockReset();
  });

  test('posts /refresh-token once when several callers overlap', async () => {
    let resolveRefresh;
    axios.post.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    const first = refreshSession();
    const second = refreshSession();
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      '/refresh-token',
      {},
      { withCredentials: true },
    );

    resolveRefresh({ data: { success: true } });
    await expect(first).resolves.toEqual({ data: { success: true } });
    await expect(second).resolves.toEqual({ data: { success: true } });
  });

  test('allows a later refresh after the in-flight one settles', async () => {
    axios.post.mockResolvedValue({ data: { success: true } });
    await refreshSession();
    await refreshSession();
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  test('isForceLogoutRefreshError only matches terminal refresh codes', () => {
    expect(
      isForceLogoutRefreshError({
        response: { data: { code: 'REFRESH_TOKEN_EXPIRED' } },
      }),
    ).toBe(true);
    expect(
      isForceLogoutRefreshError({
        response: { status: 401, data: { message: 'Session not found' } },
      }),
    ).toBe(false);
  });
});
