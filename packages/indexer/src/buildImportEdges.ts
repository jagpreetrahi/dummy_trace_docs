import type { ParsedSourceFile } from '@tracedocs/core';
import type { GraphStore } from '@tracedocs/graph';
import { buildFileSymbolId } from '@tracedocs/parser-ts';
import { resolveRelativeImport } from './resolveImport.js';

export interface UnresolvedImport {
  filePath: string;
  specifier: string;
}

/**
 * Creates a file -> file IMPORTS edge for each import whose specifier
 * resolves to a file that's actually indexed. Bare package specifiers
 * (`react`, `node:fs`) are relative-only by design and never resolve —
 * they aren't collected as unresolved, since there's nothing repo-local
 * they could point at. A relative specifier that doesn't match any known
 * file (typo, or the target genuinely isn't indexed) is reported.
 */
export function buildImportEdges(
  store: GraphStore,
  repositoryId: number,
  filePath: string,
  parsed: ParsedSourceFile,
  knownFilePaths: ReadonlySet<string>,
): UnresolvedImport[] {
  const unresolved: UnresolvedImport[] = [];
  const sourceStableId = buildFileSymbolId(filePath);

  for (const importDecl of parsed.imports) {
    if (!importDecl.specifier.startsWith('.')) continue; // bare specifier — nothing repo-local to link to

    const targetPath = resolveRelativeImport(filePath, importDecl.specifier, knownFilePaths);
    if (!targetPath) {
      unresolved.push({ filePath, specifier: importDecl.specifier });
      continue;
    }

    store.upsertEdge(repositoryId, {
      sourceStableId,
      targetStableId: buildFileSymbolId(targetPath),
      type: 'IMPORTS',
      evidenceType: 'static_analysis',
      certainty: 'HIGH',
      evidenceLocation: {
        filePath,
        startLine: importDecl.location.startLine,
        endLine: importDecl.location.endLine,
      },
    });
  }

  return unresolved;
}
