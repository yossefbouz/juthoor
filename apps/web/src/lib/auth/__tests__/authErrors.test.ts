import { describe, expect, it } from 'vitest';
import { GENERIC_AUTH_ERROR, friendlyAuthError } from '../authErrors';

describe('friendlyAuthError', () => {
  it('maps expired/invalid OTP tokens to a specific friendly message', () => {
    expect(friendlyAuthError(new Error('Token has expired or is invalid'))).toContain(
      'The code is incorrect or expired'
    );
    expect(friendlyAuthError('Invalid OTP')).toContain('incorrect or expired');
  });

  it('maps invalid login credentials', () => {
    expect(friendlyAuthError(new Error('Invalid login credentials'))).toContain(
      'Incorrect email or password'
    );
  });

  it('maps duplicate signups', () => {
    expect(friendlyAuthError('User already registered')).toContain(
      'already registered'
    );
  });

  it('maps rate-limit errors', () => {
    expect(
      friendlyAuthError(
        'For security purposes, you can only request this after 41 seconds'
      )
    ).toContain('Too many attempts');
  });

  it('maps not-authenticated / not-authorized', () => {
    expect(friendlyAuthError(new Error('Not authorized'))).toContain('signed in');
    expect(friendlyAuthError('Not authenticated')).toContain('signed in');
  });

  it('maps person-claim RPC codes to specific messages (not the generic fallback)', () => {
    expect(friendlyAuthError(new Error('claim_requires_approval'))).toContain(
      'requires the tree owner'
    );
    expect(friendlyAuthError('tree_access_required')).toContain(
      'need access to this tree'
    );
    expect(friendlyAuthError(new Error('already_pending'))).toContain(
      'already linked or has a pending claim'
    );
    expect(friendlyAuthError('verification_required')).toContain(
      'Verify your identity before claiming'
    );
    expect(
      friendlyAuthError(
        new Error(
          'Verify your identity before claiming a living person record, or ask an administrator.'
        )
      )
    ).toContain('Verify your identity before claiming');
  });

  it('collapses unknown errors to a generic message without leaking internals', () => {
    const out = friendlyAuthError(
      new Error('Database connection failed: ECONNREFUSED 10.0.0.5:5432')
    );
    expect(out).toBe(GENERIC_AUTH_ERROR);
    expect(out).not.toContain('ECONNREFUSED');
    expect(out).not.toContain('10.0.0.5');
  });

  it('handles non-Error inputs safely', () => {
    expect(friendlyAuthError(null)).toBe(GENERIC_AUTH_ERROR);
    expect(friendlyAuthError(undefined)).toBe(GENERIC_AUTH_ERROR);
  });
});
