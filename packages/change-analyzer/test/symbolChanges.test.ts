import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeChanges } from '../src/analyzeChanges.js';
import { createTempRepo, type TempRepo } from './helpers/tempRepo.js';

describe('symbol-level change detection', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await createTempRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('detects a function whose parameters changed', async () => {
    await repo.writeFile('src/token.ts', 'export function refresh(token: string) {\n  return token;\n}\n');
    const base = await repo.commitAll('initial');
    await repo.writeFile(
      'src/token.ts',
      'export function refresh(token: string, force: boolean) {\n  return token;\n}\n',
    );

    const result = await analyzeChanges(repo.root, base);

    expect(result.symbolChanges).toEqual([
      expect.objectContaining({
        changeType: 'modified',
        name: 'refresh',
        filePath: 'src/token.ts',
      }),
    ]);
  });

  it('does not report a function as changed when its own text is identical', async () => {
    await repo.writeFile(
      'src/a.ts',
      'export function unchanged() {\n  return 1;\n}\n\nexport function willChange() {\n  return 1;\n}\n',
    );
    const base = await repo.commitAll('initial');
    await repo.writeFile(
      'src/a.ts',
      '// a leading comment shifts every line below\nexport function unchanged() {\n  return 1;\n}\n\nexport function willChange() {\n  return 2;\n}\n',
    );

    const result = await analyzeChanges(repo.root, base);

    const names = result.symbolChanges.map((c) => c.name);
    expect(names).toEqual(['willChange']);
  });

  it('detects an added function', async () => {
    await repo.writeFile('src/a.ts', 'export function foo() {}\n');
    const base = await repo.commitAll('initial');
    await repo.writeFile('src/a.ts', 'export function foo() {}\nexport function bar() {}\n');

    const result = await analyzeChanges(repo.root, base);

    expect(result.symbolChanges).toEqual([
      expect.objectContaining({ changeType: 'added', name: 'bar', filePath: 'src/a.ts' }),
    ]);
  });

  it('detects a documented function being deleted', async () => {
    await repo.writeFile(
      'src/token.ts',
      '/** Refreshes a token. */\nexport function refreshAccessToken() {\n  return 1;\n}\n',
    );
    const base = await repo.commitAll('initial');
    await repo.writeFile('src/token.ts', '');

    const result = await analyzeChanges(repo.root, base);

    expect(result.symbolChanges).toEqual([
      expect.objectContaining({
        changeType: 'removed',
        name: 'refreshAccessToken',
        filePath: 'src/token.ts',
      }),
    ]);
    // The old location is still reported as evidence of where it used to live.
    expect(result.symbolChanges[0]?.location).toBeDefined();
  });

  it('reports no symbol changes when an unrelated file changes', async () => {
    await repo.writeFile('src/a.ts', 'export function foo() {}\n');
    await repo.writeFile('src/b.ts', 'export function bar() {}\n');
    const base = await repo.commitAll('initial');
    await repo.writeFile('src/b.ts', 'export function bar() { return 42; }\n');

    const result = await analyzeChanges(repo.root, base);

    expect(result.symbolChanges).toEqual([
      expect.objectContaining({ filePath: 'src/b.ts', name: 'bar' }),
    ]);
  });

  it('does not treat markdown changes as symbol changes', async () => {
    await repo.writeFile('docs/a.md', '# A\n');
    const base = await repo.commitAll('initial');
    await repo.writeFile('docs/a.md', '# A\n\nMore text.\n');

    const result = await analyzeChanges(repo.root, base);

    expect(result.fileChanges).toEqual([
      expect.objectContaining({ path: 'docs/a.md', changeType: 'modified', language: 'markdown' }),
    ]);
    expect(result.symbolChanges).toEqual([]);
  });
});
