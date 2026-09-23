import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChangeSet, ImpactFinding, SymbolChange } from '@tracedocs/core';
import { generateDocumentationUpdates } from '../src/generateDocumentationUpdates.js';
import { createMockProvider } from '../src/mockProvider.js';
import { createTempRepo, type TempRepo } from './helpers/tempRepo.js';

const SYMBOL_ID = 'src/token.ts#refreshAccessToken:function';

function baseFinding(overrides: Partial<ImpactFinding> = {}): ImpactFinding {
  return {
    documentPath: 'docs/auth.md',
    sectionHeading: 'Refresh tokens',
    sectionLocation: { startLine: 3, endLine: 5 },
    relatedSymbolId: SYMBOL_ID,
    relatedSymbolName: 'refreshAccessToken',
    relatedChangeType: 'modified',
    graphPath: [],
    evidence: 'evidence',
    certainty: 'HIGH',
    action: 'REVIEW',
    explanation: 'explanation',
    ...overrides,
  };
}

describe('generateDocumentationUpdates (pre-filtering, no repo needed)', () => {
  it('skips NEEDS_MORE_INFORMATION findings entirely', async () => {
    const changeSet: ChangeSet = {
      repositoryRoot: '/repo',
      baseRevision: 'base',
      targetRevision: null,
      fileChanges: [],
      symbolChanges: [],
    };
    const findings = [baseFinding({ action: 'NEEDS_MORE_INFORMATION' })];

    const outcomes = await generateDocumentationUpdates(findings, changeSet, createMockProvider());

    expect(outcomes).toEqual([]);
  });

  it('skips findings for removed/moved symbols', async () => {
    const changeSet: ChangeSet = {
      repositoryRoot: '/repo',
      baseRevision: 'base',
      targetRevision: null,
      fileChanges: [],
      symbolChanges: [],
    };
    const findings = [baseFinding({ relatedChangeType: 'removed' }), baseFinding({ relatedChangeType: 'moved' })];

    const outcomes = await generateDocumentationUpdates(findings, changeSet, createMockProvider());

    expect(outcomes).toEqual([]);
  });

  it('reports PROVIDER_UNAVAILABLE when context cannot be assembled, without calling the provider', async () => {
    const changeSet: ChangeSet = {
      repositoryRoot: '/repo',
      baseRevision: 'base',
      targetRevision: null,
      fileChanges: [],
      symbolChanges: [], // no matching modified change -> buildGeneratorContext returns null
    };
    const findings = [baseFinding()];

    const outcomes = await generateDocumentationUpdates(findings, changeSet, createMockProvider());

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.result.status).toBe('PROVIDER_UNAVAILABLE');
  });
});

describe('generateDocumentationUpdates (end-to-end with a real repo)', () => {
  let repo: TempRepo;
  let base: string;

  beforeEach(async () => {
    repo = await createTempRepo();
    await repo.writeFile('src/token.ts', 'export function refreshAccessToken(token) {\n  return token;\n}\n');
    await repo.writeFile('docs/auth.md', '# Authentication\n\n## Refresh tokens\n\nDetails.\n');
    base = await repo.commitAll('initial');
    await repo.writeFile(
      'src/token.ts',
      'export function refreshAccessToken(token, force) {\n  return token;\n}\n',
    );
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('produces a PROPOSED outcome for a qualifying REVIEW+modified finding', async () => {
    const symbolChange: SymbolChange = {
      changeType: 'modified',
      symbolId: SYMBOL_ID,
      name: 'refreshAccessToken',
      kind: 'function',
      filePath: 'src/token.ts',
      location: { startLine: 1, startColumn: 1, endLine: 3, endColumn: 2 },
      description: 'Function `refreshAccessToken` changed in src/token.ts',
      evidence: "This symbol's own source text differs between the two revisions.",
    };
    const changeSet: ChangeSet = {
      repositoryRoot: repo.root,
      baseRevision: base,
      targetRevision: null,
      fileChanges: [],
      symbolChanges: [symbolChange],
    };

    const outcomes = await generateDocumentationUpdates([baseFinding()], changeSet, createMockProvider());

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.result.status).toBe('PROPOSED');
    if (outcomes[0]?.result.status === 'PROPOSED') {
      expect(outcomes[0].result.patch.documentPath).toBe('docs/auth.md');
    }
  });
});
