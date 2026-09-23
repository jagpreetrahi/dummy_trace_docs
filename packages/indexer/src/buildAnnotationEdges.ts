import type { ParsedMarkdownDocument } from '@tracedocs/core';
import type { GraphStore } from '@tracedocs/graph';
import type { MarkdownFileIndex } from './buildMarkdownFile.js';

export interface UnresolvedAnnotation {
  filePath: string;
  target: string;
  reason: string;
}

/**
 * Resolves well-formed `tracedocs:documents` annotations to DOCUMENTS
 * edges. Direction is code -> doc section, matching the project brief's
 * traversal example diagram (`refreshAccessToken() -> DOCUMENTS ->
 * docs/authentication.md#refresh-tokens`), even though that reads
 * backwards from the English sentence "the doc documents the function."
 */
export function buildAnnotationEdges(
  store: GraphStore,
  repositoryId: number,
  filePath: string,
  doc: ParsedMarkdownDocument,
  markdownIndex: MarkdownFileIndex,
): UnresolvedAnnotation[] {
  const unresolved: UnresolvedAnnotation[] = [];

  for (const annotation of doc.annotations) {
    // parser-md already flags any directive other than "documents" as not
    // well-formed, so this also catches unknown directives.
    if (!annotation.wellFormed) {
      unresolved.push({ filePath, target: annotation.target, reason: annotation.issues.join('; ') });
      continue;
    }

    const hashIndex = annotation.target.indexOf('#');
    if (hashIndex === -1) {
      unresolved.push({
        filePath,
        target: annotation.target,
        reason: 'Target is missing a "#" separating the file path from the symbol name',
      });
      continue;
    }

    const targetFilePath = annotation.target.slice(0, hashIndex);
    const qualifiedName = annotation.target.slice(hashIndex + 1);
    const matches = store.findNodesByFilePathAndQualifiedName(repositoryId, targetFilePath, qualifiedName);

    if (matches.length === 0) {
      unresolved.push({
        filePath,
        target: annotation.target,
        reason: `No symbol named "${qualifiedName}" found in ${targetFilePath}`,
      });
      continue;
    }
    if (matches.length > 1) {
      unresolved.push({
        filePath,
        target: annotation.target,
        reason: `Ambiguous: ${matches.length} symbols match "${qualifiedName}" in ${targetFilePath}`,
      });
      continue;
    }

    const sectionStableId = markdownIndex.sectionStableIdForLine(annotation.location.startLine);
    store.upsertEdge(repositoryId, {
      sourceStableId: matches[0]!.stableId,
      targetStableId: sectionStableId,
      type: 'DOCUMENTS',
      evidenceType: 'explicit_annotation',
      certainty: 'HIGH',
      evidenceLocation: {
        filePath,
        startLine: annotation.location.startLine,
        endLine: annotation.location.endLine,
      },
    });
  }

  return unresolved;
}
