import { afterEach, describe, expect, it } from 'vitest';
import { analyzeImpact } from '../src/analyzeImpact.js';
import { classifyAction } from '../src/classify.js';
import { emptyChangeSet, modifiedChange, seedGraph } from './helpers/seed.js';

describe('classifyAction', () => {
  it('downgrades to NEEDS_MORE_INFORMATION when the doc file was also changed', () => {
    const changeSet = emptyChangeSet({
      fileChanges: [{ changeType: 'modified', path: 'docs/a.md', language: 'markdown' }],
    });
    expect(classifyAction('docs/a.md', changeSet)).toBe('NEEDS_MORE_INFORMATION');
  });

  it('matches a doc file change reported under its previous (renamed) path', () => {
    const changeSet = emptyChangeSet({
      fileChanges: [
        { changeType: 'renamed', path: 'docs/new.md', previousPath: 'docs/a.md', language: 'markdown' },
      ],
    });
    expect(classifyAction('docs/a.md', changeSet)).toBe('NEEDS_MORE_INFORMATION');
  });

  it('stays REVIEW when the doc file was not touched', () => {
    const changeSet = emptyChangeSet({ fileChanges: [{ changeType: 'modified', path: 'src/a.ts', language: 'typescript' }] });
    expect(classifyAction('docs/a.md', changeSet)).toBe('REVIEW');
  });
});

describe('deduplication', () => {
  let ctx: ReturnType<typeof seedGraph> | undefined;

  afterEach(() => {
    ctx?.store.close();
  });

  it('reports the same (symbol, document section) pair only once, even when reachable via two paths', () => {
    ctx = seedGraph();
    // The method is documented directly, AND its containing class happens
    // to point at that very same section (e.g. a maintainer annotated
    // both) — without dedup this would surface as two findings for one
    // real relationship.
    ctx.store.upsertEdge(ctx.repositoryId, {
      sourceStableId: 'src/a.ts#AuthService.refresh:method',
      targetStableId: 'docs/a.md#refresh-tokens:documentation_section',
      type: 'DOCUMENTS',
      evidenceType: 'explicit_annotation',
      certainty: 'HIGH',
    });
    ctx.store.upsertEdge(ctx.repositoryId, {
      sourceStableId: 'src/a.ts#AuthService:class',
      targetStableId: 'docs/a.md#refresh-tokens:documentation_section',
      type: 'DOCUMENTS',
      evidenceType: 'explicit_annotation',
      certainty: 'HIGH',
    });

    const changeSet = emptyChangeSet({
      symbolChanges: [modifiedChange({ symbolId: 'src/a.ts#AuthService.refresh:method', name: 'refresh' })],
    });

    const findings = analyzeImpact(changeSet, ctx.store, ctx.repositoryId, []);

    expect(findings).toHaveLength(1);
    // The direct (depth-0, HIGH) relationship wins over the indirect one for the same pair.
    expect(findings[0]).toMatchObject({ sectionHeading: 'Refresh tokens', certainty: 'HIGH' });
  });

  it('reports two changed symbols that share a documented container as two separate findings', () => {
    ctx = seedGraph();
    ctx.store.upsertEdge(ctx.repositoryId, {
      sourceStableId: 'src/a.ts#AuthService:class',
      targetStableId: 'docs/a.md#auth-service:documentation_section',
      type: 'DOCUMENTS',
      evidenceType: 'explicit_annotation',
      certainty: 'HIGH',
    });
    ctx.store.upsertNode(ctx.repositoryId, {
      stableId: 'src/a.ts#AuthService.persist:method',
      type: 'method',
      name: 'persist',
      qualifiedName: 'AuthService.persist',
      filePath: 'src/a.ts',
    });
    ctx.store.upsertEdge(ctx.repositoryId, {
      sourceStableId: 'src/a.ts#AuthService:class',
      targetStableId: 'src/a.ts#AuthService.persist:method',
      type: 'CONTAINS',
      evidenceType: 'static_analysis',
      certainty: 'HIGH',
    });

    const changeSet = emptyChangeSet({
      symbolChanges: [
        modifiedChange({ symbolId: 'src/a.ts#AuthService.refresh:method', name: 'refresh' }),
        modifiedChange({ symbolId: 'src/a.ts#AuthService.persist:method', name: 'persist' }),
      ],
    });

    const findings = analyzeImpact(changeSet, ctx.store, ctx.repositoryId, []);

    // Same document, but each is a genuinely distinct reason to look —
    // a different symbol changed — so both are kept, not collapsed.
    const authServiceFindings = findings.filter((f) => f.sectionHeading === 'Auth service');
    expect(authServiceFindings.map((f) => f.relatedSymbolName).sort()).toEqual(['persist', 'refresh']);
  });
});
