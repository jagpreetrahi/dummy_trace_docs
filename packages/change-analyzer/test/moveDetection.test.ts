import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeChanges } from '../src/analyzeChanges.js';
import { createTempRepo, type TempRepo } from './helpers/tempRepo.js';

describe('move detection', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await createTempRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('reports a function moved verbatim to a different file as "moved", not remove+add', async () => {
    const fn = 'export function helper() {\n  return 42;\n}\n';
    await repo.writeFile('src/a.ts', fn);
    await repo.writeFile('src/b.ts', 'export const unrelated = 1;\n');
    const base = await repo.commitAll('initial');

    await repo.writeFile('src/a.ts', '');
    await repo.writeFile('src/b.ts', `export const unrelated = 1;\n${fn}`);

    const result = await analyzeChanges(repo.root, base);

    expect(result.symbolChanges).toEqual([
      expect.objectContaining({
        changeType: 'moved',
        name: 'helper',
        previousFilePath: 'src/a.ts',
        filePath: 'src/b.ts',
      }),
    ]);
  });

  it('does not call it a move when the same name reappears with different content', async () => {
    await repo.writeFile('src/a.ts', 'export function helper() {\n  return 1;\n}\n');
    await repo.writeFile('src/b.ts', 'export const unrelated = 1;\n');
    const base = await repo.commitAll('initial');

    await repo.writeFile('src/a.ts', '');
    await repo.writeFile('src/b.ts', 'export const unrelated = 1;\nexport function helper() {\n  return 2;\n}\n');

    const result = await analyzeChanges(repo.root, base);

    const changeTypes = result.symbolChanges.map((c) => c.changeType).sort();
    expect(changeTypes).toEqual(['added', 'removed']);
  });

  it('does not confuse two different symbols that happen to share content as a move for both', async () => {
    // Two identical no-op functions with different names — must not be matched as a move,
    // since matching requires the qualified name to match too.
    const body = '() {\n  return 1;\n}\n';
    await repo.writeFile('src/a.ts', `export function alpha${body}`);
    const base = await repo.commitAll('initial');

    await repo.writeFile('src/a.ts', '');
    await repo.writeFile('src/b.ts', `export function beta${body}`);

    const result = await analyzeChanges(repo.root, base);

    const changeTypes = result.symbolChanges.map((c) => c.changeType).sort();
    expect(changeTypes).toEqual(['added', 'removed']);
  });
});
