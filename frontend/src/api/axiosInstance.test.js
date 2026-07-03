import { describe, it, expect, afterEach } from 'vitest';
import axiosInstance, { isReauthCancelled, setAuthHandlers } from './axiosInstance';

function makeAxiosError(config, status, data) {
  const err = new Error(`Request failed with status code ${status}`);
  err.config = config;
  err.isAxiosError = true;
  err.response = { status, data, statusText: '', headers: {}, config };
  return err;
}

describe('isReauthCancelled', () => {
  it('returns true for a REAUTH_CANCELLED error', () => {
    expect(isReauthCancelled(new Error('REAUTH_CANCELLED'))).toBe(true);
  });

  it('returns false for other error messages', () => {
    expect(isReauthCancelled(new Error('Network Error'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isReauthCancelled(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isReauthCancelled(undefined)).toBe(false);
  });
});

describe('401 retry after silent refresh', () => {
  const originalAdapter = axiosInstance.defaults.adapter;

  afterEach(() => {
    axiosInstance.defaults.adapter = originalAdapter;
  });

  it('retries the original request with the newly refreshed token', async () => {
    let currentToken = 'old-token';
    setAuthHandlers(() => currentToken, () => {}, (newToken) => { currentToken = newToken; });

    let dataCallCount = 0;
    axiosInstance.defaults.adapter = async (config) => {
      if (config.url === '/v1/auth/refresh') {
        return { data: { accessToken: 'new-token' }, status: 200, statusText: 'OK', headers: {}, config };
      }
      dataCallCount++;
      if (dataCallCount === 1) {
        throw makeAxiosError(config, 401, { error: { code: 'TOKEN_EXPIRED' } });
      }
      return { data: { authHeader: config.headers.Authorization }, status: 200, statusText: 'OK', headers: {}, config };
    };

    const res = await axiosInstance.get('/v1/submissions');

    expect(res.data.authHeader).toBe('Bearer new-token');
  });
});
