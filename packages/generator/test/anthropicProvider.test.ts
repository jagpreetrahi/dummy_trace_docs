import { describe, expect, it } from 'vitest';
import { describeProviderError } from '../src/anthropicProvider.js';

// Only the parts of the Anthropic adapter that don't require a real network
// call are tested here — no test in this suite calls the actual API (no
// API key is assumed to be configured, and none should be required to run
// the test suite; see docs/architecture.md on the mock provider being the
// default for exactly this reason).
describe('describeProviderError', () => {
  it('uses the message of a plain Error', () => {
    expect(describeProviderError(new Error('boom'))).toBe('boom');
  });

  it('stringifies a non-Error thrown value without throwing itself', () => {
    expect(describeProviderError('just a string')).toBe('just a string');
    expect(describeProviderError(42)).toBe('42');
    expect(describeProviderError(undefined)).toBe('undefined');
  });
});
