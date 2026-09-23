import { afterEach, describe, expect, it } from 'vitest';
import { analyzeImpact } from '../src/analyzeImpact.js';
import { emptyChangeSet, modifiedChange, seedGraph } from './helpers/seed.js';

describe('direct and indirect documentation relationships', () => {
  let ctx: ReturnType<typeof seedGraph> | undefined;

  afterEach(() => {
    ctx?.store.close();
  });

  it('finds a direct DOCUMENTS edge on the changed symbol itself (HIGH certainty)', () => {
    ctx = seedGraph();
    ctx.store.upsertEdge(ctx.repositoryId, {
      sourceStableId: 'src/a.ts#AuthService.refresh:method',
      targetStableId: 'docs/a.md#refresh-tokens:documentation_section',
      type: 'DOCUMENTS',
      evidenceType: 'explicit_annotation',
      certainty: 'HIGH',
    });
    const changeSet = emptyChangeSet({
      symbolChanges: [
        modifiedChange({
          symbolId: 'src/a.ts#AuthService.refresh:method',
          name: 'refresh',
          kind: 'method',
          filePath: 'src/a.ts',
        }),
      ],
    });

    const findings = analyzeImpact(changeSet, ctx.store, ctx.repositoryId, []);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      documentPath: 'docs/a.md',
      sectionHeading: 'Refresh tokens',
      certainty: 'HIGH',
      action: 'REVIEW',
    });
    expect(findings[0]?.graphPath.map((s) => s.nodeName)).toEqual(['refresh', 'Refresh tokens']);
  });

  it('finds documentation on the containing class one hop up (MEDIUM certainty)', () => {
    ctx = seedGraph();
    ctx.store.upsertEdge(ctx.repositoryId, {
      sourceStableId: 'src/a.ts#AuthService:class',
      targetStableId: 'docs/a.md#auth-service:documentation_section',
      type: 'DOCUMENTS',
      evidenceType: 'explicit_annotation',
      certainty: 'HIGH',
    });
    const changeSet = emptyChangeSet({
      symbolChanges: [
        modifiedChange({
          symbolId: 'src/a.ts#AuthService.refresh:method',
          name: 'refresh',
          kind: 'method',
        }),
      ],
    });

    const findings = analyzeImpact(changeSet, ctx.store, ctx.repositoryId, []);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ sectionHeading: 'Auth service', certainty: 'MEDIUM' });
    expect(findings[0]?.evidence).toMatch(/containing class/i);
  });

  it('finds documentation on the containing file two hops up (LOW certainty)', () => {
    ctx = seedGraph();
    ctx.store.upsertEdge(ctx.repositoryId, {
      sourceStableId: 'src/a.ts#<file>:file',
      targetStableId: 'docs/a.md#<page>:documentation_page',
      type: 'DOCUMENTS',
      evidenceType: 'explicit_annotation',
      certainty: 'HIGH',
    });
    const changeSet = emptyChangeSet({
      symbolChanges: [modifiedChange({ symbolId: 'src/a.ts#AuthService.refresh:method', name: 'refresh' })],
    });

    const findings = analyzeImpact(changeSet, ctx.store, ctx.repositoryId, []);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ sectionHeading: null, documentPath: 'docs/a.md', certainty: 'LOW' });
  });

  it('does not look past maxDepth', () => {
    ctx = seedGraph();
    ctx.store.upsertEdge(ctx.repositoryId, {
      sourceStableId: 'src/a.ts#<file>:file',
      targetStableId: 'docs/a.md#<page>:documentation_page',
      type: 'DOCUMENTS',
      evidenceType: 'explicit_annotation',
      certainty: 'HIGH',
    });
    const changeSet = emptyChangeSet({
      symbolChanges: [modifiedChange({ symbolId: 'src/a.ts#AuthService.refresh:method', name: 'refresh' })],
    });

    const findings = analyzeImpact(changeSet, ctx.store, ctx.repositoryId, [], { maxDepth: 1 });

    expect(findings).toEqual([]);
  });

  it('produces no findings when nothing documents the changed symbol or its containers', () => {
    ctx = seedGraph();
    const changeSet = emptyChangeSet({
      symbolChanges: [modifiedChange({ symbolId: 'src/a.ts#AuthService.refresh:method', name: 'refresh' })],
    });

    const findings = analyzeImpact(changeSet, ctx.store, ctx.repositoryId, []);

    expect(findings).toEqual([]);
  });

  it('produces no findings for an unrelated modified symbol not in the graph', () => {
    ctx = seedGraph();
    const changeSet = emptyChangeSet({
      symbolChanges: [modifiedChange({ symbolId: 'src/other.ts#unrelated:function', name: 'unrelated' })],
    });

    const findings = analyzeImpact(changeSet, ctx.store, ctx.repositoryId, []);

    expect(findings).toEqual([]);
  });

  it('never produces a finding for an added symbol', () => {
    ctx = seedGraph();
    ctx.store.upsertEdge(ctx.repositoryId, {
      sourceStableId: 'src/a.ts#AuthService.refresh:method',
      targetStableId: 'docs/a.md#refresh-tokens:documentation_section',
      type: 'DOCUMENTS',
      evidenceType: 'explicit_annotation',
      certainty: 'HIGH',
    });
    const changeSet = emptyChangeSet({
      symbolChanges: [
        modifiedChange({
          changeType: 'added',
          symbolId: 'src/a.ts#AuthService.refresh:method',
          name: 'refresh',
        }),
      ],
    });

    const findings = analyzeImpact(changeSet, ctx.store, ctx.repositoryId, []);

    expect(findings).toEqual([]);
  });
});
