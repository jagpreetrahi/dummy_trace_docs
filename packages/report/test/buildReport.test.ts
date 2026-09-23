import { describe, expect, it } from 'vitest';
import type { ChangeSet, ImpactFinding } from '@tracedocs/core';
import { buildReport } from '../src/buildReport.js';

function changeSetFor(overrides: Partial<ChangeSet> = {}): ChangeSet {
  return {
    repositoryRoot: '/repo',
    baseRevision: 'base-sha',
    targetRevision: null,
    fileChanges: [],
    symbolChanges: [],
    ...overrides,
  };
}

function findingFor(overrides: Partial<ImpactFinding> = {}): ImpactFinding {
  return {
    documentPath: 'docs/a.md',
    sectionHeading: 'Refresh tokens',
    sectionLocation: { startLine: 3, endLine: 5 },
    relatedSymbolId: 'src/a.ts#foo:function',
    relatedSymbolName: 'foo',
    relatedChangeType: 'modified',
    graphPath: [],
    evidence: 'evidence',
    certainty: 'HIGH',
    action: 'REVIEW',
    explanation: 'explanation',
    ...overrides,
  };
}

const emptyUnresolved = { imports: [], annotations: [], danglingReferences: [] };

describe('buildReport', () => {
  it('carries the change set fields through directly', () => {
    const changeSet = changeSetFor({
      fileChanges: [{ changeType: 'modified', path: 'src/a.ts', language: 'typescript' }],
    });
    const report = buildReport({ changeSet, findings: [], unresolved: emptyUnresolved });

    expect(report.repositoryRoot).toBe('/repo');
    expect(report.baseRevision).toBe('base-sha');
    expect(report.fileChanges).toEqual(changeSet.fileChanges);
    expect(report.summary.filesChanged).toBe(1);
  });

  it('defaults proposedPatches to an empty array when omitted', () => {
    const report = buildReport({ changeSet: changeSetFor(), findings: [], unresolved: emptyUnresolved });
    expect(report.proposedPatches).toEqual([]);
  });

  it('summarizes findings by action and certainty', () => {
    const findings = [
      findingFor({ action: 'REVIEW', certainty: 'HIGH' }),
      findingFor({ action: 'REVIEW', certainty: 'MEDIUM' }),
      findingFor({ action: 'NEEDS_MORE_INFORMATION', certainty: 'HIGH' }),
    ];
    const report = buildReport({ changeSet: changeSetFor(), findings, unresolved: emptyUnresolved });

    expect(report.summary.findingsByAction).toEqual({ REVIEW: 2, NEEDS_MORE_INFORMATION: 1 });
    expect(report.summary.findingsByCertainty).toEqual({ HIGH: 2, MEDIUM: 1 });
  });

  it('includes a generatedAt ISO timestamp', () => {
    const report = buildReport({ changeSet: changeSetFor(), findings: [], unresolved: emptyUnresolved });
    expect(() => new Date(report.generatedAt).toISOString()).not.toThrow();
  });

  it('carries unresolved items through unchanged', () => {
    const unresolved = {
      imports: [{ filePath: 'src/a.ts', specifier: './missing' }],
      annotations: [{ filePath: 'docs/a.md', target: 'x#y', reason: 'not found' }],
      danglingReferences: [{ sourceStableId: 'a', targetStableId: 'b', edgeType: 'DOCUMENTS' }],
    };
    const report = buildReport({ changeSet: changeSetFor(), findings: [], unresolved });
    expect(report.unresolved).toEqual(unresolved);
  });
});
