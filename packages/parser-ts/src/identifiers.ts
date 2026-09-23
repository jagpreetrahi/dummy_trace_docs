import type { CodeSymbolKind } from '@tracedocs/core';

/** Stable within one indexing run. Never derived from line numbers. */
export function buildSymbolId(
  repoRelativePath: string,
  qualifiedName: string,
  kind: CodeSymbolKind,
): string {
  return `${repoRelativePath}#${qualifiedName}:${kind}`;
}

export function buildFileSymbolId(repoRelativePath: string): string {
  return `${repoRelativePath}#<file>:file`;
}
