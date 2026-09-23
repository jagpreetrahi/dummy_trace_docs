import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeChanges } from '../src/analyzeChanges.js';
import { createTempRepo, type TempRepo } from './helpers/tempRepo.js';

describe('file-level change detection', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await createTempRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('detects an added file against the working tree', async () => {
    await repo.writeFile('src/a.ts', 'export const a = 1;');
    const base = await repo.commitAll('initial');
    await repo.writeFile('src/b.ts', 'export const b = 2;');

    const result = await analyzeChanges(repo.root, base);

    expect(result.fileChanges).toEqual([
      expect.objectContaining({ changeType: 'added', path: 'src/b.ts', language: 'typescript' }),
    ]);
    expect(result.targetRevision).toBeNull();
    expect(result.baseRevision).toBe(base);
  });

  it('detects a modified file', async () => {
    await repo.writeFile('src/a.ts', 'export const a = 1;');
    const base = await repo.commitAll('initial');
    await repo.writeFile('src/a.ts', 'export const a = 2;');

    const result = await analyzeChanges(repo.root, base);

    expect(result.fileChanges).toEqual([
      expect.objectContaining({ changeType: 'modified', path: 'src/a.ts' }),
    ]);
  });

  it('detects a deleted file', async () => {
    await repo.writeFile('src/a.ts', 'export const a = 1;');
    const base = await repo.commitAll('initial');
    await repo.removeFile('src/a.ts');

    const result = await analyzeChanges(repo.root, base);

    expect(result.fileChanges).toEqual([
      expect.objectContaining({ changeType: 'deleted', path: 'src/a.ts' }),
    ]);
  });

  it('detects a renamed file via git rename detection, not delete+add', async () => {
    await repo.writeFile('src/old.ts', 'export function foo() { return 1; }\n'.repeat(3));
    const base = await repo.commitAll('initial');
    await repo.removeFile('src/old.ts');
    await repo.writeFile('src/new.ts', 'export function foo() { return 1; }\n'.repeat(3));
    const target = await repo.commitAll('rename'); // rename detection needs both sides committed (or staged)

    const result = await analyzeChanges(repo.root, base, target);

    expect(result.fileChanges).toEqual([
      expect.objectContaining({ changeType: 'renamed', path: 'src/new.ts', previousPath: 'src/old.ts' }),
    ]);
  });

  it('cannot distinguish an uncommitted rename from delete+add — a known git limitation, not a bug', async () => {
    await repo.writeFile('src/old.ts', 'export function foo() { return 1; }\n'.repeat(3));
    const base = await repo.commitAll('initial');
    await repo.removeFile('src/old.ts');
    await repo.writeFile('src/new.ts', 'export function foo() { return 1; }\n'.repeat(3)); // never staged/committed

    const result = await analyzeChanges(repo.root, base);

    const changeTypes = result.fileChanges.map((c) => c.changeType).sort();
    expect(changeTypes).toEqual(['added', 'deleted']);
  });

  it('reports two arbitrary revisions when a target is given explicitly', async () => {
    await repo.writeFile('src/a.ts', 'export const a = 1;');
    const base = await repo.commitAll('first');
    await repo.writeFile('src/a.ts', 'export const a = 2;');
    const target = await repo.commitAll('second');
    await repo.writeFile('src/a.ts', 'export const a = 3;'); // uncommitted — should NOT be picked up

    const result = await analyzeChanges(repo.root, base, target);

    expect(result.targetRevision).toBe(target);
    expect(result.fileChanges).toEqual([
      expect.objectContaining({ changeType: 'modified', path: 'src/a.ts' }),
    ]);
  });

  it('reports an empty change set for two identical revisions', async () => {
    await repo.writeFile('src/a.ts', 'export const a = 1;');
    const base = await repo.commitAll('only commit');

    const result = await analyzeChanges(repo.root, base, base);

    expect(result.fileChanges).toEqual([]);
    expect(result.symbolChanges).toEqual([]);
  });
});
