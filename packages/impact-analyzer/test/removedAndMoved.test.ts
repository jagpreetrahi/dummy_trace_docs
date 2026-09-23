import { afterEach, describe, expect, it } from 'vitest';
import type { DanglingReference } from '@tracedocs/graph';
import { analyzeImpact } from '../src/analyzeImpact.js';
import { emptyChangeSet, seedGraph } from './helpers/seed.js';

describe('removed and moved symbols', () => {
  let ctx: ReturnType<typeof seedGraph> | undefined;

  afterEach(() => {
    ctx?.store.close();
  });

  it('flags documentation that pointed at a removed symbol, via the dangling reference', () => {
    ctx = seedGraph();
    const changeSet = emptyChangeSet({
      symbolChanges: [
        {
          changeType: 'removed',
          symbolId: 'src/a.ts#AuthService.refresh:method',
          name: 'refresh',
          kind: 'method',
          filePath: 'src/a.ts',
          location: { startLine: 1, startColumn: 1, endLine: 3, endColumn: 1 },
          description: 'Method `AuthService.refresh` removed from src/a.ts',
          evidence: 'Symbol is present in the base revision and absent in the target.',
        },
      ],
    });
    const dangling: DanglingReference[] = [
      {
        sourceStableId: 'src/a.ts#AuthService.refresh:method',
        targetStableId: 'docs/a.md#refresh-tokens:documentation_section',
        edgeType: 'DOCUMENTS',
      },
    ];

    const findings = analyzeImpact(changeSet, ctx.store, ctx.repositoryId, dangling);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      documentPath: 'docs/a.md',
      sectionHeading: 'Refresh tokens',
      certainty: 'HIGH',
      action: 'REVIEW',
      relatedChangeType: 'removed',
    });
    expect(findings[0]?.evidence).toMatch(/no longer exists/i);
    expect(findings[0]?.graphPath).toEqual([]); // no live path — the symbol's node is gone
  });

  it('flags documentation that pointed at a moved symbol\'s old location, naming the new one', () => {
    ctx = seedGraph();
    const changeSet = emptyChangeSet({
      symbolChanges: [
        {
          changeType: 'moved',
          symbolId: 'src/b.ts#AuthService.refresh:method',
          previousFilePath: 'src/a.ts',
          previousSymbolId: 'src/a.ts#AuthService.refresh:method',
          name: 'refresh',
          kind: 'method',
          filePath: 'src/b.ts',
          description: 'Method `AuthService.refresh` moved from src/a.ts to src/b.ts',
          evidence: 'Identical source text was removed from one file and added, unchanged, to another.',
        },
      ],
    });
    const dangling: DanglingReference[] = [
      {
        sourceStableId: 'src/a.ts#AuthService.refresh:method',
        targetStableId: 'docs/a.md#refresh-tokens:documentation_section',
        edgeType: 'DOCUMENTS',
      },
    ];

    const findings = analyzeImpact(changeSet, ctx.store, ctx.repositoryId, dangling);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toContain('src/a.ts');
    expect(findings[0]?.evidence).toContain('src/b.ts');
    expect(findings[0]?.relatedChangeType).toBe('moved');
  });

  it('ignores dangling references of other edge types', () => {
    ctx = seedGraph();
    const changeSet = emptyChangeSet({
      symbolChanges: [
        {
          changeType: 'removed',
          symbolId: 'src/a.ts#AuthService.refresh:method',
          name: 'refresh',
          kind: 'method',
          filePath: 'src/a.ts',
          description: 'removed',
          evidence: 'removed',
        },
      ],
    });
    const dangling: DanglingReference[] = [
      {
        sourceStableId: 'src/a.ts#AuthService.refresh:method',
        targetStableId: 'src/a.ts#AuthService:class',
        edgeType: 'CONTAINS',
      },
    ];

    expect(analyzeImpact(changeSet, ctx.store, ctx.repositoryId, dangling)).toEqual([]);
  });

  it('produces nothing when there is no dangling reference for the removed symbol', () => {
    ctx = seedGraph();
    const changeSet = emptyChangeSet({
      symbolChanges: [
        {
          changeType: 'removed',
          symbolId: 'src/a.ts#AuthService.refresh:method',
          name: 'refresh',
          kind: 'method',
          filePath: 'src/a.ts',
          description: 'removed',
          evidence: 'removed',
        },
      ],
    });

    expect(analyzeImpact(changeSet, ctx.store, ctx.repositoryId, [])).toEqual([]);
  });
});
