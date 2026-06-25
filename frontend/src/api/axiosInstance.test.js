import { describe, it, expect } from 'vitest';
import { isReauthCancelled } from './axiosInstance';

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
