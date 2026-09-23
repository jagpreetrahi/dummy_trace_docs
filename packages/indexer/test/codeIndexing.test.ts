import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphStore } from '@tracedocs/graph';
import { buildFileSymbolId } from '@tracedocs/parser-ts';
import { indexRepository } from '../src/indexRepository.js';
import { createTempRepo, type TempRepo } from './helpers/tempRepo.js';

describe('indexing code files', () => {
  let repo: TempRepo;
  let store: GraphStore;

  beforeEach(async () => {
    repo = await createTempRepo();
    store = GraphStore.open(':memory:');
  });

  afterEach(async () => {
    store.close();
    await repo.cleanup();
  });

  it('creates a file node and CONTAINS edges to its top-level symbols', async () => {
    await repo.writeFile('src/math.ts', 'export function add(a: number, b: number) { return a + b; }');

    const result = await indexRepository(repo.root, store);

    expect(result.filesAdded).toBe(1);
    const fileId = store.getNodeByStableId(result.repositoryId, buildFileSymbolId('src/math.ts'));
    expect(fileId).toBeDefined();
    const fnId = store.getNodeByStableId(result.repositoryId, 'src/math.ts#add:function');
    expect(fnId).toBeDefined();

    const outgoing = store.listOutgoingEdges(fileId!.id, 'CONTAINS');
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]?.targetNodeId).toBe(fnId!.id);
  });

  it('links a class to its methods via CONTAINS', async () => {
    await repo.writeFile(
      'src/service.ts',
      'export class Service {\n  refresh() { return 1; }\n}\n',
    );

    const result = await indexRepository(repo.root, store);

    const classNode = store.getNodeByStableId(result.repositoryId, 'src/service.ts#Service:class');
    const methodNode = store.getNodeByStableId(result.repositoryId, 'src/service.ts#Service.refresh:method');
    expect(classNode).toBeDefined();
    expect(methodNode).toBeDefined();

    const outgoing = store.listOutgoingEdges(classNode!.id, 'CONTAINS');
    expect(outgoing.map((e) => e.targetNodeId)).toEqual([methodNode!.id]);
  });

  it('resolves a relative import to an IMPORTS edge', async () => {
    await repo.writeFile('src/token.ts', 'export function refresh() { return 1; }');
    await repo.writeFile('src/index.ts', "import { refresh } from './token';\nrefresh();\n");

    const result = await indexRepository(repo.root, store);

    const indexFile = store.getNodeByStableId(result.repositoryId, buildFileSymbolId('src/index.ts'));
    const tokenFile = store.getNodeByStableId(result.repositoryId, buildFileSymbolId('src/token.ts'));
    const imports = store.listOutgoingEdges(indexFile!.id, 'IMPORTS');

    expect(imports).toHaveLength(1);
    expect(imports[0]?.targetNodeId).toBe(tokenFile!.id);
    expect(result.unresolvedImports).toEqual([]);
  });

  it('does not create an edge for a bare package import, and does not report it as unresolved', async () => {
    await repo.writeFile('src/a.ts', "import { useState } from 'react';\n");

    const result = await indexRepository(repo.root, store);

    const fileNode = store.getNodeByStableId(result.repositoryId, buildFileSymbolId('src/a.ts'));
    expect(store.listOutgoingEdges(fileNode!.id, 'IMPORTS')).toEqual([]);
    expect(result.unresolvedImports).toEqual([]);
  });

  it('reports a relative import that does not resolve to any indexed file', async () => {
    await repo.writeFile('src/a.ts', "import { x } from './missing';\n");

    const result = await indexRepository(repo.root, store);

    expect(result.unresolvedImports).toEqual([{ filePath: 'src/a.ts', specifier: './missing' }]);
  });

  it('resolves a same-file function call to a CALLS edge', async () => {
    await repo.writeFile(
      'src/a.ts',
      'function helper() { return 1; }\nfunction run() { return helper(); }\n',
    );

    const result = await indexRepository(repo.root, store);

    const runNode = store.getNodeByStableId(result.repositoryId, 'src/a.ts#run:function');
    const helperNode = store.getNodeByStableId(result.repositoryId, 'src/a.ts#helper:function');
    const calls = store.listOutgoingEdges(runNode!.id, 'CALLS');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.targetNodeId).toBe(helperNode!.id);
  });

  it('resolves this.method() to a sibling method on the same class', async () => {
    await repo.writeFile(
      'src/service.ts',
      'class Service {\n  refresh() { this.persist(); }\n  persist() {}\n}\n',
    );

    const result = await indexRepository(repo.root, store);

    const refreshNode = store.getNodeByStableId(result.repositoryId, 'src/service.ts#Service.refresh:method');
    const persistNode = store.getNodeByStableId(result.repositoryId, 'src/service.ts#Service.persist:method');
    const calls = store.listOutgoingEdges(refreshNode!.id, 'CALLS');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.targetNodeId).toBe(persistNode!.id);
  });

  it('does not create a CALLS edge for an unresolvable dotted callee', async () => {
    await repo.writeFile('src/a.ts', "function run() { someLib.doThing(); }\n");

    const result = await indexRepository(repo.root, store);
    const runNode = store.getNodeByStableId(result.repositoryId, 'src/a.ts#run:function');

    expect(store.listOutgoingEdges(runNode!.id, 'CALLS')).toEqual([]);
  });
});
