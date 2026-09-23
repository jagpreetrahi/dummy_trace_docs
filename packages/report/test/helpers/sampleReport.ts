import type { Report } from '@tracedocs/core';

export function sampleReport(overrides: Partial<Report> = {}): Report {
  return {
    repositoryRoot: '/repo',
    baseRevision: 'base-sha',
    targetRevision: null,
    generatedAt: '2024-01-01T00:00:00.000Z',
    fileChanges: [{ changeType: 'modified', path: 'src/token.ts', language: 'typescript' }],
    symbolChanges: [
      {
        changeType: 'modified',
        symbolId: 'src/token.ts#refreshAccessToken:function',
        name: 'refreshAccessToken',
        kind: 'function',
        filePath: 'src/token.ts',
        location: { startLine: 1, startColumn: 1, endLine: 3, endColumn: 2 },
        description: 'Function `refreshAccessToken` changed in src/token.ts',
        evidence: "This symbol's own source text differs between the two revisions.",
      },
    ],
    findings: [
      {
        documentPath: 'docs/auth.md',
        sectionHeading: 'Refresh tokens',
        sectionLocation: { startLine: 3, endLine: 6 },
        relatedSymbolId: 'src/token.ts#refreshAccessToken:function',
        relatedSymbolName: 'refreshAccessToken',
        relatedChangeType: 'modified',
        graphPath: [
          { nodeStableId: 'src/token.ts#refreshAccessToken:function', nodeName: 'refreshAccessToken', nodeType: 'function' },
          { nodeStableId: 'docs/auth.md#refresh-tokens:documentation_section', nodeName: 'Refresh tokens', nodeType: 'documentation_section' },
        ],
        evidence: 'This symbol is explicitly documented in this section.',
        certainty: 'HIGH',
        action: 'REVIEW',
        explanation: '`refreshAccessToken` (function) was modified in src/token.ts.',
      },
    ],
    unresolved: { imports: [], annotations: [], danglingReferences: [] },
    proposedPatches: [],
    summary: {
      filesChanged: 1,
      symbolsChanged: 1,
      findingsByAction: { REVIEW: 1 },
      findingsByCertainty: { HIGH: 1 },
    },
    ...overrides,
  };
}
