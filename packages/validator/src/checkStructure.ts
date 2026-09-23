import type { ValidationIssue } from '@tracedocs/core';
import { parseMarkdownDocument } from '@tracedocs/parser-md';

const FENCE_MARKER = /^```/gm;

/**
 * Structural soundness of the proposed content on its own: does it parse,
 * are its code fences balanced, are any `tracedocs:` annotations it
 * contains well-formed. All `error`-severity — these are correctness
 * problems in the generated text itself, not judgment calls.
 */
export function checkStructure(proposedContent: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const fenceMarkers = proposedContent.match(FENCE_MARKER) ?? [];
  if (fenceMarkers.length % 2 !== 0) {
    issues.push({
      check: 'code-fence-integrity',
      severity: 'error',
      message: 'An odd number of ``` fence markers were found — a code fence may be unclosed.',
    });
  }

  let parsed;
  try {
    parsed = parseMarkdownDocument('(proposed)', proposedContent);
  } catch (error) {
    issues.push({
      check: 'markdown-parse',
      severity: 'error',
      message: `Proposed content could not be parsed as Markdown: ${error instanceof Error ? error.message : String(error)}`,
    });
    return issues;
  }

  for (const annotation of parsed.annotations) {
    if (!annotation.wellFormed) {
      issues.push({
        check: 'annotation-well-formed',
        severity: 'error',
        message: `Malformed tracedocs annotation targeting "${annotation.target}": ${annotation.issues.join('; ')}`,
      });
    }
  }

  return issues;
}
