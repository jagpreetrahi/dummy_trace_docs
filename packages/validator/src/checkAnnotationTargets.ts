import type { ValidationIssue } from '@tracedocs/core';
import type { GraphStore } from '@tracedocs/graph';
import { parseMarkdownDocument } from '@tracedocs/parser-md';

/**
 * Resolves each well-formed `tracedocs:documents` annotation in the
 * proposed content against the live graph — the same resolution rule the
 * indexer uses (file path + qualified name, regardless of kind). Only
 * meaningful when a graph is available, which is why this is the one
 * check `validatePatch` treats as optional rather than always attempted.
 */
export function checkAnnotationTargets(
  proposedContent: string,
  store: GraphStore,
  repositoryId: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const parsed = parseMarkdownDocument('(proposed)', proposedContent);

  for (const annotation of parsed.annotations) {
    if (!annotation.wellFormed) continue; // already reported by checkStructure

    const hashIndex = annotation.target.indexOf('#');
    if (hashIndex === -1) continue;

    const targetFilePath = annotation.target.slice(0, hashIndex);
    const qualifiedName = annotation.target.slice(hashIndex + 1);
    const matches = store.findNodesByFilePathAndQualifiedName(repositoryId, targetFilePath, qualifiedName);

    if (matches.length !== 1) {
      issues.push({
        check: 'annotation-target-resolution',
        severity: 'warning',
        message: `Annotation target "${annotation.target}" does not resolve to exactly one known symbol (found ${matches.length}).`,
      });
    }
  }

  return issues;
}
