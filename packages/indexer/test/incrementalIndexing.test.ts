import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphStore } from '@tracedocs/graph';
import { buildFileSymbolId } from '@tracedocs/parser-ts';
import { indexRepository } from '../src/indexRepository.js';
import { createTempRepo, type TempRepo } from './helpers/tempRepo.js';

describe('incremental indexing', () => {
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

  it('re-indexing an unchanged repository creates no new nodes or edges', async () => {
    await repo.writeFile('src/a.ts', 'export function foo() { return bar(); }\nfunction bar() { return 1; }');

    const first = await indexRepository(repo.root, store);
    const second = await indexRepository(repo.root, store);

    expect(second.filesAdded).toBe(0);
    expect(second.filesModified).toBe(0);
    expect(second.filesUnchanged).toBe(1);
    expect(second.totalNodes).toBe(first.totalNodes);
    expect(second.totalEdges).toBe(first.totalEdges);
  });

  it('leaves an unrelated file untouched when another file changes', async () => {
    await repo.writeFile('src/a.ts', 'export function foo() {}');
    await repo.writeFile('src/b.ts', 'export function untouched() {}');
    const first = await indexRepository(repo.root, store);
    const untouchedNodeBefore = store.getNodeByStableId(first.repositoryId, 'src/b.ts#untouched:function');

    await repo.writeFile('src/a.ts', 'export function foo() { return 1; }');
    const second = await indexRepository(repo.root, store);

    expect(second.filesModified).toBe(1);
    expect(second.filesUnchanged).toBe(1);
    const untouchedNodeAfter = store.getNodeByStableId(second.repositoryId, 'src/b.ts#untouched:function');
    expect(untouchedNodeAfter?.id).toBe(untouchedNodeBefore?.id);
  });

  it('removes the old symbol node when a function is renamed', async () => {
    await repo.writeFile('src/a.ts', 'export function oldName() {}');
    const first = await indexRepository(repo.root, store);
    expect(store.getNodeByStableId(first.repositoryId, 'src/a.ts#oldName:function')).toBeDefined();

    await repo.writeFile('src/a.ts', 'export function newName() {}');
    const second = await indexRepository(repo.root, store);

    expect(store.getNodeByStableId(second.repositoryId, 'src/a.ts#oldName:function')).toBeUndefined();
    expect(store.getNodeByStableId(second.repositoryId, 'src/a.ts#newName:function')).toBeDefined();
  });

  it('removes nodes and reports a dangling cross-file reference when a file is deleted', async () => {
    await repo.writeFile('src/token.ts', 'export function refresh() {}');
    await repo.writeFile('src/index.ts', "import { refresh } from './token';\nrefresh();\n");
    const first = await indexRepository(repo.root, store);
    expect(first.filesAdded).toBe(2);

    await repo.removeFile('src/token.ts');
    const second = await indexRepository(repo.root, store);

    expect(second.filesRemoved).toBe(1);
    expect(store.getNodeByStableId(second.repositoryId, buildFileSymbolId('src/token.ts'))).toBeUndefined();
    expect(second.danglingReferences).toEqual([
      {
        sourceStableId: buildFileSymbolId('src/index.ts'),
        targetStableId: buildFileSymbolId('src/token.ts'),
        edgeType: 'IMPORTS',
      },
    ]);
  });

  it('treats a renamed file as removal of the old path plus addition of the new one', async () => {
    await repo.writeFile('src/old.ts', 'export function foo() {}');
    const first = await indexRepository(repo.root, store);
    expect(store.getNodeByStableId(first.repositoryId, buildFileSymbolId('src/old.ts'))).toBeDefined();

    await repo.removeFile('src/old.ts');
    await repo.writeFile('src/new.ts', 'export function foo() {}');
    const second = await indexRepository(repo.root, store);

    expect(second.filesRemoved).toBe(1);
    expect(second.filesAdded).toBe(1);
    expect(store.getNodeByStableId(second.repositoryId, buildFileSymbolId('src/old.ts'))).toBeUndefined();
    expect(store.getNodeByStableId(second.repositoryId, 'src/new.ts#foo:function')).toBeDefined();
  });
});
