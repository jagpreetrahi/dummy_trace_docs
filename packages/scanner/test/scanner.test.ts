import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCurrentRevision } from '../src/git.js';
import { diffAgainstManifest, scanRepository, toManifest } from '../src/scanner.js';
import { createTempRepo, type TempRepo } from './helpers/tempRepo.js';

describe('scanRepository', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await createTempRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('returns null revision when there are no commits yet', async () => {
    await repo.writeFile('src/index.ts', 'export const a = 1;');
    const result = await scanRepository(repo.root);
    expect(result.revision).toBeNull();
    expect(result.files).toHaveLength(1);
  });

  it('reports the current HEAD revision once a commit exists', async () => {
    await repo.writeFile('src/index.ts', 'export const a = 1;');
    await repo.commitAll('initial commit');

    const result = await scanRepository(repo.root);
    const expectedRevision = await getCurrentRevision(repo.root);

    expect(result.revision).toBe(expectedRevision);
    expect(result.revision).toMatch(/^[0-9a-f]{40}$/);
  });

  it('computes a stable content hash per file', async () => {
    await repo.writeFile('src/a.ts', 'export const a = 1;');
    const result = await scanRepository(repo.root);
    const fileA = result.files.find((f) => f.repoRelativePath === 'src/a.ts');
    expect(fileA).toBeDefined();
    expect(fileA?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fileA?.language).toBe('typescript');
  });
});

describe('diffAgainstManifest', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await createTempRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('classifies every file as added against an empty manifest', async () => {
    await repo.writeFile('src/a.ts', 'export const a = 1;');
    await repo.writeFile('docs/guide.md', '# Guide');

    const scan = await scanRepository(repo.root);
    const summary = diffAgainstManifest(scan, { revision: null, updatedAt: '', files: {} });

    expect(summary.added.sort()).toEqual(['docs/guide.md', 'src/a.ts']);
    expect(summary.modified).toEqual([]);
    expect(summary.removed).toEqual([]);
    expect(summary.unchanged).toEqual([]);
  });

  it('distinguishes unchanged, modified, added, and removed files across two scans', async () => {
    await repo.writeFile('src/unchanged.ts', 'export const u = 1;');
    await repo.writeFile('src/will-change.ts', 'export const v = 1;');
    await repo.writeFile('src/will-be-removed.ts', 'export const r = 1;');

    const firstScan = await scanRepository(repo.root);
    const manifest = toManifest(firstScan);

    // Simulate edits between indexing runs.
    await repo.writeFile('src/will-change.ts', 'export const v = 2;');
    const { rm } = await import('node:fs/promises');
    const { join } = await import('node:path');
    await rm(join(repo.root, 'src/will-be-removed.ts'));
    await repo.writeFile('src/newly-added.ts', 'export const n = 1;');

    const secondScan = await scanRepository(repo.root);
    const summary = diffAgainstManifest(secondScan, manifest);

    expect(summary.added).toEqual(['src/newly-added.ts']);
    expect(summary.modified).toEqual(['src/will-change.ts']);
    expect(summary.removed).toEqual(['src/will-be-removed.ts']);
    expect(summary.unchanged).toEqual(['src/unchanged.ts']);
  });
});
