import { describe, expect, it } from 'vitest';
import type { ProposedPatch } from '@tracedocs/core';
import { checkAccidentalDeletion } from '../src/checkAccidentalDeletion.js';

function patchFor(originalContent: string, proposedContent: string): ProposedPatch {
  return {
    documentPath: 'docs/a.md',
    sectionHeading: 'Section',
    originalContent,
    proposedContent,
    explanation: '',
    evidence: [],
    assumptions: [],
  };
}

describe('checkAccidentalDeletion', () => {
  it('flags a drastic shrink of substantial content', () => {
    const original = 'A'.repeat(200);
    const issues = checkAccidentalDeletion(patchFor(original, 'short'));
    expect(issues).toEqual([expect.objectContaining({ check: 'accidental-deletion', severity: 'warning' })]);
  });

  it('does not flag a modest, reasonable edit', () => {
    const original = 'The quick brown fox jumps over the lazy dog. '.repeat(4);
    const proposed = `${original} One more sentence added.`;
    expect(checkAccidentalDeletion(patchFor(original, proposed))).toEqual([]);
  });

  it('does not flag short original content even if it shrinks a lot', () => {
    expect(checkAccidentalDeletion(patchFor('short', ''))).toEqual([]);
  });

  it('does not flag when proposed content grows', () => {
    const original = 'A'.repeat(200);
    const proposed = 'A'.repeat(400);
    expect(checkAccidentalDeletion(patchFor(original, proposed))).toEqual([]);
  });
});
