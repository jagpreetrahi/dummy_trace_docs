import type { ParsedMarkdownDocument } from '@tracedocs/core';
import type { GraphStore } from '@tracedocs/graph';

export function docPageStableId(filePath: string): string {
  return `${filePath}#<page>:documentation_page`;
}

export function docSectionStableId(filePath: string, slug: string): string {
  return `${filePath}#${slug}:documentation_section`;
}

export interface MarkdownFileIndex {
  pageStableId: string;
  /** Section stable id covering each 1-based line, for locating which section an annotation falls in. */
  sectionStableIdForLine(line: number): string;
}

/**
 * Inserts the documentation page node and one section node per *headed*
 * section (the preamble before the first heading isn't independently
 * addressable — it has no anchor — so it isn't given its own node; its
 * content is still attributed to the page node for annotation resolution).
 */
export function insertMarkdownFileNodes(
  store: GraphStore,
  repositoryId: number,
  filePath: string,
  contentHash: string,
  indexedAt: string,
  doc: ParsedMarkdownDocument,
): MarkdownFileIndex {
  store.upsertFile(repositoryId, filePath, 'markdown', contentHash, indexedAt);

  const pageStableId = docPageStableId(filePath);
  store.upsertNode(repositoryId, {
    stableId: pageStableId,
    type: 'documentation_page',
    name: filePath,
    filePath,
  });

  const headedRanges: { startLine: number; endLine: number; stableId: string }[] = [];

  for (const section of doc.sections) {
    if (!section.heading) continue;
    const stableId = docSectionStableId(filePath, section.heading.slug);
    store.upsertNode(repositoryId, {
      stableId,
      type: 'documentation_section',
      name: section.heading.text,
      qualifiedName: section.heading.slug,
      filePath,
      startLine: section.location.startLine,
      endLine: section.location.endLine,
    });
    store.upsertEdge(repositoryId, {
      sourceStableId: pageStableId,
      targetStableId: stableId,
      type: 'CONTAINS',
      evidenceType: 'static_analysis',
      certainty: 'HIGH',
    });
    headedRanges.push({ startLine: section.location.startLine, endLine: section.location.endLine, stableId });
  }

  return {
    pageStableId,
    sectionStableIdForLine(line: number): string {
      const match = headedRanges.find((r) => line >= r.startLine && line <= r.endLine);
      return match?.stableId ?? pageStableId;
    },
  };
}
