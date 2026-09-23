import type { ProposedPatch } from '@tracedocs/core';
import { parseMarkdownDocument } from '@tracedocs/parser-md';

export interface LocatedSection {
  location: { startLine: number; endLine: number };
  currentText: string;
}

/**
 * Re-locates the section a patch targets within the *current* document
 * content, using the same section-boundary logic the indexer used to
 * derive it originally (`parser-md`'s heading-to-next-heading spans) —
 * never the patch's own stored text, and never a remembered line range,
 * since `ProposedPatch` doesn't carry one (a section's position shifts
 * as a document is edited; re-deriving it from the current content is
 * what makes staleness detection correct instead of coordinate-fragile).
 * Returns `null` when `sectionHeading` no longer matches any heading —
 * itself useful evidence that the patch is stale.
 */
export function locateSection(docContent: string, sectionHeading: string | null): LocatedSection | null {
  if (sectionHeading === null) {
    const lineCount = docContent.split('\n').length;
    return { location: { startLine: 1, endLine: lineCount }, currentText: docContent };
  }

  const parsed = parseMarkdownDocument('(current)', docContent);
  const section = parsed.sections.find((candidate) => candidate.heading?.text === sectionHeading);
  if (!section) return null;

  return {
    location: { startLine: section.location.startLine, endLine: section.location.endLine },
    currentText: section.content,
  };
}

/** Splices `patch.proposedContent` into `docContent` at `located`'s range, leaving everything else untouched. */
export function assembleResultingDocument(
  docContent: string,
  patch: ProposedPatch,
  located: LocatedSection,
): string {
  const lines = docContent.split('\n');
  const before = lines.slice(0, located.location.startLine - 1);
  const after = lines.slice(located.location.endLine);
  return [...before, patch.proposedContent, ...after].join('\n');
}
