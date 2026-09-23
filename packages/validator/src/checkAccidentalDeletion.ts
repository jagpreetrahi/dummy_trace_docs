import type { ProposedPatch, ValidationIssue } from '@tracedocs/core';

const MIN_ORIGINAL_LENGTH_TO_CHECK = 40;
const SHRINK_RATIO_THRESHOLD = 0.2;

/**
 * A heuristic, not a proof: flags a patch whose proposed content is
 * dramatically shorter than the original as worth a second look, rather
 * than silently accepting what could be an LLM dropping most of a
 * section instead of editing it. `warning` severity — a large legitimate
 * trim is possible and shouldn't be blocked outright.
 */
export function checkAccidentalDeletion(patch: ProposedPatch): ValidationIssue[] {
  const originalLength = patch.originalContent.trim().length;
  const proposedLength = patch.proposedContent.trim().length;

  if (originalLength < MIN_ORIGINAL_LENGTH_TO_CHECK) return [];
  if (proposedLength >= originalLength * SHRINK_RATIO_THRESHOLD) return [];

  const shrinkPercent = Math.round((1 - proposedLength / originalLength) * 100);
  return [
    {
      check: 'accidental-deletion',
      severity: 'warning',
      message: `The proposed content is ${shrinkPercent}% shorter than the original — check this wasn't an accidental deletion.`,
    },
  ];
}
