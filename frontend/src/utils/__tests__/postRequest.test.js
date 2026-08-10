jest.mock('axios', () => {
  const axiosMock = jest.fn();
  axiosMock.post = jest.fn();
  return axiosMock;
});

import axios from 'axios';
import apiRequest from '../postRequest';

describe('apiRequest', () => {
  beforeEach(() => {
    axios.mockReset();
    axios.post.mockReset();
  });

  test('sends POST request and returns response data', async () => {
    axios.mockResolvedValueOnce({ data: { ok: true } });

    const response = await apiRequest('/api/example', { foo: 'bar' });

    expect(response).toEqual({ ok: true });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/api/example',
        data: { foo: 'bar' },
        withCredentials: true,
      })
    );
  });

  test('refreshes token and retries when initial request returns 401', async () => {
    axios.mockRejectedValueOnce({ response: { status: 401, data: { code: 'TOKEN_EXPIRED' } } });
    axios.post.mockResolvedValueOnce({ data: { success: true } });
    axios.mockResolvedValueOnce({ data: { retried: true } });

    const response = await apiRequest('/api/protected', { foo: 'bar' });

    expect(axios.post).toHaveBeenCalledWith(
      '/refresh-token',
      {},
      { withCredentials: true }
    );
    expect(response).toEqual({ retried: true });
    expect(axios).toHaveBeenCalledTimes(2);
  });

  test('returns auth-required response when refresh fails', async () => {
    axios.mockRejectedValueOnce({ response: { status: 401, data: { code: 'TOKEN_EXPIRED' } } });
    axios.post.mockRejectedValueOnce({
      response: { data: { code: 'REFRESH_TOKEN_EXPIRED' } },
    });

    const response = await apiRequest('/api/protected', { foo: 'bar' });

    expect(response).toEqual({ error: 'Authentication required' });
  });

  test('normalizes backend error payload from failed request', async () => {
    axios.mockRejectedValueOnce({
      response: { status: 409, data: { message: 'Conflict happened' } },
    });

    const response = await apiRequest('/api/conflict', { foo: 'bar' });

    expect(response).toEqual({ error: 'Conflict happened', code: 409 });
  });

  test('surfaces the backend stable code as errorCode so callers can branch on it', async () => {
    axios.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { message: 'At least one catalog tag is required.', code: 'TAGS_REQUIRED' },
      },
    });

    const response = await apiRequest('/pivot/creator/events', { name: 'x' });

    expect(response).toEqual({
      error: 'At least one catalog tag is required.',
      code: 400,
      errorCode: 'TAGS_REQUIRED',
    });
  });

  test('omits errorCode when the error body carries no code', async () => {
    axios.mockRejectedValueOnce({ response: { status: 500, data: {} } });

    const response = await apiRequest('/api/boom', {});

    expect(response).not.toHaveProperty('errorCode');
    expect(response).toEqual({ error: 'An error occurred', code: 500 });
  });
});
