import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverFiles } from '../src/discover.js';
import { createTempRepo, type TempRepo } from './helpers/tempRepo.js';

describe('discoverFiles', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await createTempRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('finds supported source and markdown files', async () => {
    await repo.writeFile('src/index.ts', 'export const a = 1;');
    await repo.writeFile('docs/guide.md', '# Guide');
    await repo.writeFile('assets/logo.png', 'not-really-a-png');

    const files = await discoverFiles(repo.root);

    expect(files).toEqual(['docs/guide.md', 'src/index.ts']);
  });

  it('respects .gitignore', async () => {
    await repo.writeFile('.gitignore', 'generated/\n');
    await repo.writeFile('src/index.ts', 'export const a = 1;');
    await repo.writeFile('generated/output.ts', 'export const b = 2;');

    const files = await discoverFiles(repo.root);

    expect(files).toEqual(['src/index.ts']);
  });

  it('always excludes node_modules, dist, and .git regardless of .gitignore', async () => {
    await repo.writeFile('src/index.ts', 'export const a = 1;');
    await repo.writeFile('node_modules/pkg/index.js', 'module.exports = {};');
    await repo.writeFile('dist/index.js', 'export {};');

    const files = await discoverFiles(repo.root);

    expect(files).toEqual(['src/index.ts']);
  });

  it('returns an empty list for a repository with no supported files', async () => {
    await repo.writeFile('README', 'no extension');
    const files = await discoverFiles(repo.root);
    expect(files).toEqual([]);
  });
});
