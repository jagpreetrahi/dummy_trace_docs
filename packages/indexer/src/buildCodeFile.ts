import type { ParsedSourceFile } from '@tracedocs/core';
import type { GraphStore } from '@tracedocs/graph';
import { buildFileSymbolId } from '@tracedocs/parser-ts';

/**
 * Inserts the file node and its symbols (functions, classes, methods),
 * plus CONTAINS edges (file -> top-level symbol, class -> its methods).
 * Returns the file's stable id, since callers need it for IMPORTS edges.
 */
export function insertCodeFileNodes(
  store: GraphStore,
  repositoryId: number,
  filePath: string,
  language: string,
  contentHash: string,
  indexedAt: string,
  parsed: ParsedSourceFile,
): string {
  store.upsertFile(repositoryId, filePath, language, contentHash, indexedAt);

  const fileStableId = buildFileSymbolId(filePath);
  store.upsertNode(repositoryId, {
    stableId: fileStableId,
    type: 'file',
    name: filePath,
    filePath,
  });

  for (const symbol of parsed.symbols) {
    store.upsertNode(repositoryId, {
      stableId: symbol.id,
      type: symbol.kind,
      name: symbol.name,
      qualifiedName: symbol.qualifiedName,
      filePath: symbol.repoRelativePath,
      startLine: symbol.location.startLine,
      endLine: symbol.location.endLine,
      metadata: {
        exported: symbol.exported,
        isDefaultExport: symbol.isDefaultExport,
        ...(symbol.jsDoc ? { jsDoc: symbol.jsDoc } : {}),
      },
    });

    store.upsertEdge(repositoryId, {
      sourceStableId: symbol.parentId ?? fileStableId,
      targetStableId: symbol.id,
      type: 'CONTAINS',
      evidenceType: 'static_analysis',
      certainty: 'HIGH',
    });
  }

  return fileStableId;
}
