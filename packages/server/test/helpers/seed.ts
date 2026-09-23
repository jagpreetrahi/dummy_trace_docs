import { GraphStore } from '@tracedocs/graph';

/**
 * Builds a small graph directly (not via the indexer) so server tests
 * exercise only the HTTP layer, not the whole scan/parse pipeline.
 */
export function seedGraph(): { store: GraphStore; repositoryId: number; nodeIds: Record<string, number> } {
  const store = GraphStore.open(':memory:');
  const repositoryId = store.upsertRepository('/repo');

  const nodeIds: Record<string, number> = {};
  const add = (stableId: string, type: 'file' | 'function' | 'class', name: string, filePath?: string) => {
    nodeIds[stableId] = store.upsertNode(repositoryId, {
      stableId,
      type,
      name,
      ...(filePath ? { filePath } : {}),
    });
  };

  add('src/a.ts#<file>:file', 'file', 'src/a.ts', 'src/a.ts');
  add('src/a.ts#foo:function', 'function', 'foo', 'src/a.ts');
  add('src/a.ts#bar:function', 'function', 'bar', 'src/a.ts');

  store.upsertEdge(repositoryId, {
    sourceStableId: 'src/a.ts#<file>:file',
    targetStableId: 'src/a.ts#foo:function',
    type: 'CONTAINS',
    evidenceType: 'static_analysis',
    certainty: 'HIGH',
  });
  store.upsertEdge(repositoryId, {
    sourceStableId: 'src/a.ts#foo:function',
    targetStableId: 'src/a.ts#bar:function',
    type: 'CALLS',
    evidenceType: 'static_analysis',
    certainty: 'HIGH',
  });

  store.markRepositoryIndexed(repositoryId, 'abc123', '2024-01-01T00:00:00.000Z');
  store.upsertFile(repositoryId, 'src/a.ts', 'typescript', 'hash', '2024-01-01T00:00:00.000Z');

  return { store, repositoryId, nodeIds };
}
