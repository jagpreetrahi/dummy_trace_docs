import { describe, expect, it } from 'vitest';
import type { GeneratorContext } from '@tracedocs/core';
import { createMockProvider } from '../src/mockProvider.js';

function baseContext(overrides: Partial<GeneratorContext> = {}): GeneratorContext {
  return {
    documentPath: 'docs/a.md',
    sectionHeading: 'Refresh tokens',
    originalSectionContent: '## Refresh tokens\n\nDetails.',
    relatedSymbolName: 'refreshAccessToken',
    relatedSymbolKind: 'function',
    codeBefore: 'function refreshAccessToken(token) {}',
    codeAfter: 'function refreshAccessToken(token, force) {}',
    evidence: "This symbol's own source text differs between the two revisions.",
    explanation: '`refreshAccessToken` (function) was modified in src/token.ts.',
    ...overrides,
  };
}

describe('mock provider', () => {
  it('proposes a placeholder patch by default', async () => {
    const provider = createMockProvider();
    const result = await provider.generatePatch(baseContext());

    expect(result.status).toBe('PROPOSED');
    if (result.status !== 'PROPOSED') return;
    expect(result.patch.documentPath).toBe('docs/a.md');
    expect(result.patch.proposedContent).toContain('refreshAccessToken');
    expect(result.patch.originalContent).toBe(baseContext().originalSectionContent);
    expect(result.patch.assumptions.length).toBeGreaterThan(0);
  });

  it('requests more information when codeAfter is unavailable, even in propose mode', async () => {
    const provider = createMockProvider();
    const result = await provider.generatePatch(baseContext({ codeAfter: null }));
    expect(result.status).toBe('NEEDS_MORE_INFORMATION');
  });

  it('can be forced to always need more information', async () => {
    const provider = createMockProvider({ behavior: 'needsMoreInfo' });
    const result = await provider.generatePatch(baseContext());
    expect(result.status).toBe('NEEDS_MORE_INFORMATION');
  });

  it('can be forced to simulate being unavailable', async () => {
    const provider = createMockProvider({ behavior: 'unavailable' });
    const result = await provider.generatePatch(baseContext());
    expect(result).toEqual({
      status: 'PROVIDER_UNAVAILABLE',
      reason: 'Mock provider configured to simulate unavailability.',
    });
  });

  it('reports its name', () => {
    expect(createMockProvider().name).toBe('mock');
  });
});
