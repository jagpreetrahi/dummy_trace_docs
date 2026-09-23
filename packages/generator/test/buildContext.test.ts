import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChangeSet, ImpactFinding, SymbolChange } from '@tracedocs/core';
import { buildGeneratorContext } from '../src/buildContext.js';
import { createTempRepo, type TempRepo } from './helpers/tempRepo.js';

const SYMBOL_ID = 'src/token.ts#refreshAccessToken:function';

function modifiedSymbolChange(overrides: Partial<SymbolChange> = {}): SymbolChange {
  return {
    changeType: 'modified',
    symbolId: SYMBOL_ID,
    name: 'refreshAccessToken',
    kind: 'function',
    filePath: 'src/token.ts',
    location: { startLine: 1, startColumn: 1, endLine: 3, endColumn: 2 },
    description: 'Function `refreshAccessToken` changed in src/token.ts',
    evidence: "This symbol's own source text differs between the two revisions.",
    ...overrides,
  };
}

function findingFor(repoRoot: string, base: string, overrides: Partial<ImpactFinding> = {}): ImpactFinding {
  return {
    documentPath: 'docs/auth.md',
    sectionHeading: 'Refresh tokens',
    sectionLocation: { startLine: 3, endLine: 5 },
    relatedSymbolId: SYMBOL_ID,
    relatedSymbolName: 'refreshAccessToken',
    relatedChangeType: 'modified',
    graphPath: [],
    evidence: "This symbol's own source text differs between the two revisions.",
    certainty: 'HIGH',
    action: 'REVIEW',
    explanation: '`refreshAccessToken` (function) was modified in src/token.ts.',
    ...overrides,
  };
}

function changeSetFor(repoRoot: string, base: string, symbolChanges: SymbolChange[]): ChangeSet {
  return {
    repositoryRoot: repoRoot,
    baseRevision: base,
    targetRevision: null,
    fileChanges: [],
    symbolChanges,
  };
}

describe('buildGeneratorContext', () => {
  let repo: TempRepo;
  let base: string;

  beforeEach(async () => {
    repo = await createTempRepo();
    await repo.writeFile('src/token.ts', 'export function refreshAccessToken(token) {\n  return token;\n}\n');
    await repo.writeFile(
      'docs/auth.md',
      '# Authentication\n\n## Refresh tokens\n\nDetails.\n',
    );
    base = await repo.commitAll('initial');
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('extracts before/after code and the current section text', async () => {
    await repo.writeFile(
      'src/token.ts',
      'export function refreshAccessToken(token, force) {\n  return token;\n}\n',
    );

    const changeSet = changeSetFor(repo.root, base, [modifiedSymbolChange()]);
    const finding = findingFor(repo.root, base);

    const context = await buildGeneratorContext(finding, changeSet);

    expect(context).not.toBeNull();
    expect(context?.codeBefore).toContain('function refreshAccessToken(token)');
    expect(context?.codeAfter).toContain('function refreshAccessToken(token, force)');
    expect(context?.originalSectionContent).toContain('## Refresh tokens');
    expect(context?.originalSectionContent).toContain('Details.');
    expect(context?.originalSectionContent).not.toContain('# Authentication');
    expect(context?.relatedSymbolKind).toBe('function');
    expect(context?.documentPath).toBe('docs/auth.md');
  });

  it('returns null when there is no matching modified symbol change', async () => {
    const changeSet = changeSetFor(repo.root, base, []); // no symbol changes at all
    const finding = findingFor(repo.root, base);

    expect(await buildGeneratorContext(finding, changeSet)).toBeNull();
  });

  it('returns null when the documentation file is not readable', async () => {
    const changeSet = changeSetFor(repo.root, base, [modifiedSymbolChange()]);
    const finding = findingFor(repo.root, base, { documentPath: 'docs/does-not-exist.md' });

    expect(await buildGeneratorContext(finding, changeSet)).toBeNull();
  });

  it('uses the whole document when sectionLocation is null (page-level finding)', async () => {
    const changeSet = changeSetFor(repo.root, base, [modifiedSymbolChange()]);
    const finding = findingFor(repo.root, base, { sectionHeading: null, sectionLocation: null });

    const context = await buildGeneratorContext(finding, changeSet);

    expect(context?.originalSectionContent).toContain('# Authentication');
    expect(context?.originalSectionContent).toContain('Details.');
  });
});
