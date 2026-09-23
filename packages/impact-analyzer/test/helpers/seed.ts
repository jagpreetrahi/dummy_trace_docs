import { GraphStore } from '@tracedocs/graph';
import type { ChangeSet, SymbolChange } from '@tracedocs/core';

export function emptyChangeSet(overrides: Partial<ChangeSet> = {}): ChangeSet {
  return {
    repositoryRoot: '/repo',
    baseRevision: 'base-sha',
    targetRevision: 'target-sha',
    fileChanges: [],
    symbolChanges: [],
    ...overrides,
  };
}

export function modifiedChange(overrides: Partial<SymbolChange> = {}): SymbolChange {
  return {
    changeType: 'modified',
    symbolId: 'src/a.ts#refreshAccessToken:function',
    name: 'refreshAccessToken',
    kind: 'function',
    filePath: 'src/a.ts',
    description: 'Function `refreshAccessToken` changed in src/a.ts',
    evidence: "This symbol's own source text differs between the two revisions.",
    ...overrides,
  };
}

/** A minimal but realistic graph: a documented function inside a documented class inside a file, plus a doc page/section. */
export function seedGraph() {
  const store = GraphStore.open(':memory:');
  const repositoryId = store.upsertRepository('/repo');

  store.upsertNode(repositoryId, {
    stableId: 'src/a.ts#<file>:file',
    type: 'file',
    name: 'src/a.ts',
    filePath: 'src/a.ts',
  });
  store.upsertNode(repositoryId, {
    stableId: 'src/a.ts#AuthService:class',
    type: 'class',
    name: 'AuthService',
    qualifiedName: 'AuthService',
    filePath: 'src/a.ts',
  });
  store.upsertNode(repositoryId, {
    stableId: 'src/a.ts#AuthService.refresh:method',
    type: 'method',
    name: 'refresh',
    qualifiedName: 'AuthService.refresh',
    filePath: 'src/a.ts',
  });

  store.upsertEdge(repositoryId, {
    sourceStableId: 'src/a.ts#<file>:file',
    targetStableId: 'src/a.ts#AuthService:class',
    type: 'CONTAINS',
    evidenceType: 'static_analysis',
    certainty: 'HIGH',
  });
  store.upsertEdge(repositoryId, {
    sourceStableId: 'src/a.ts#AuthService:class',
    targetStableId: 'src/a.ts#AuthService.refresh:method',
    type: 'CONTAINS',
    evidenceType: 'static_analysis',
    certainty: 'HIGH',
  });

  store.upsertNode(repositoryId, {
    stableId: 'docs/a.md#<page>:documentation_page',
    type: 'documentation_page',
    name: 'docs/a.md',
    filePath: 'docs/a.md',
  });
  store.upsertNode(repositoryId, {
    stableId: 'docs/a.md#refresh-tokens:documentation_section',
    type: 'documentation_section',
    name: 'Refresh tokens',
    qualifiedName: 'refresh-tokens',
    filePath: 'docs/a.md',
    startLine: 3,
    endLine: 6,
  });
  store.upsertNode(repositoryId, {
    stableId: 'docs/a.md#auth-service:documentation_section',
    type: 'documentation_section',
    name: 'Auth service',
    qualifiedName: 'auth-service',
    filePath: 'docs/a.md',
    startLine: 8,
    endLine: 10,
  });

  return { store, repositoryId };
}
