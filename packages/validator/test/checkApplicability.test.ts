import { describe, expect, it } from 'vitest';
import type { ProposedPatch } from '@tracedocs/core';
import { checkApplicability } from '../src/checkApplicability.js';

const DOC = '# Title\n\n## Refresh tokens\n\nOriginal text.\n';

function patchFor(overrides: Partial<ProposedPatch> = {}): ProposedPatch {
  return {
    documentPath: 'docs/a.md',
    sectionHeading: 'Refresh tokens',
    originalContent: '## Refresh tokens\n\nOriginal text.',
    proposedContent: '## Refresh tokens\n\nNew text.',
    explanation: '',
    evidence: [],
    assumptions: [],
    ...overrides,
  };
}

describe('checkApplicability', () => {
  it('is applicable when the current section text matches originalContent exactly', () => {
    const result = checkApplicability(patchFor(), DOC);
    expect(result.issues).toEqual([]);
    expect(result.located).not.toBeNull();
  });

  it('reports document-readable when the document is unreadable', () => {
    const result = checkApplicability(patchFor(), null);
    expect(result.issues).toEqual([
      expect.objectContaining({ check: 'document-readable', severity: 'error' }),
    ]);
    expect(result.located).toBeNull();
  });

  it('reports patch-applicability when the section no longer exists', () => {
    const result = checkApplicability(patchFor({ sectionHeading: 'Gone' }), DOC);
    expect(result.issues).toEqual([
      expect.objectContaining({ check: 'patch-applicability', severity: 'error' }),
    ]);
  });

  it('reports patch-applicability (stale) when the section text has changed', () => {
    const changedDoc = '# Title\n\n## Refresh tokens\n\nSomeone already edited this.\n';
    const result = checkApplicability(patchFor(), changedDoc);
    expect(result.issues).toEqual([
      expect.objectContaining({ check: 'patch-applicability', severity: 'error' }),
    ]);
    expect(result.issues[0]?.message).toMatch(/changed since this patch was generated/i);
  });

  it('is applicable for a page-level patch (null sectionHeading) when the whole doc matches', () => {
    const result = checkApplicability(patchFor({ sectionHeading: null, originalContent: DOC }), DOC);
    expect(result.issues).toEqual([]);
  });
});
