import type { GraphStore } from '@tracedocs/graph';
import type { Manifest, SupportedLanguage } from '@tracedocs/core';

/**
 * Builds a scanner-shaped `Manifest` from the graph's `files` table, so the
 * indexer can reuse `diffAgainstManifest` from `@tracedocs/scanner` instead
 * of re-implementing added/modified/removed/unchanged classification. The
 * graph's `files` table is the durable source of truth for "what was
 * indexed last" — there is no separate `.tracedocs/manifest.json` once a
 * repository is indexed into the graph.
 */
export function buildManifestFromGraph(store: GraphStore, repositoryId: number): Manifest {
  const files = store.listFiles(repositoryId);
  const manifestFiles: Manifest['files'] = {};
  for (const file of files) {
    manifestFiles[file.path] = {
      contentHash: file.contentHash,
      language: file.language as SupportedLanguage,
    };
  }
  return { revision: null, updatedAt: new Date(0).toISOString(), files: manifestFiles };
}
