import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/renderMarkdown.js';
import { sampleReport } from './helpers/sampleReport.js';

describe('renderMarkdown', () => {
  it('includes the header fields', () => {
    const output = renderMarkdown(sampleReport());
    expect(output).toContain('# TraceDocs Report');
    expect(output).toContain('base-sha');
    expect(output).toContain('(working tree)');
  });

  it('renders the changed-files table', () => {
    const output = renderMarkdown(sampleReport());
    expect(output).toContain('## Changed files');
    expect(output).toContain('| modified | src/token.ts |');
  });

  it('renders a renamed file with an arrow', () => {
    const report = sampleReport({
      fileChanges: [{ changeType: 'renamed', path: 'new.md', previousPath: 'old.md', language: 'markdown' }],
    });
    const output = renderMarkdown(report);
    expect(output).toContain('old.md → new.md');
  });

  it('renders findings with certainty, evidence path, and an explicit non-proof caveat', () => {
    const output = renderMarkdown(sampleReport());
    expect(output).toContain('[REVIEW] docs/auth.md — Refresh tokens');
    expect(output).toContain('**Certainty:** HIGH');
    expect(output).toContain('refreshAccessToken → Refresh tokens');
    expect(output).toMatch(/not proof of correctness/i);
  });

  it('says explicitly when there is no documentation impact', () => {
    const output = renderMarkdown(sampleReport({ findings: [] }));
    expect(output).toContain('No documentation impact found');
  });

  it('omits the proposed-patches section when there are none', () => {
    const output = renderMarkdown(sampleReport());
    expect(output).not.toContain('## Proposed patches');
  });

  it('renders a PROPOSED patch with its validation issues', () => {
    const report = sampleReport({
      proposedPatches: [
        {
          finding: sampleReport().findings[0]!,
          result: {
            status: 'PROPOSED',
            patch: {
              documentPath: 'docs/auth.md',
              sectionHeading: 'Refresh tokens',
              originalContent: 'old text',
              proposedContent: 'new text',
              explanation: 'it changed',
              evidence: ['ev'],
              assumptions: [],
            },
          },
          validation: {
            valid: false,
            issues: [{ check: 'patch-applicability', severity: 'error', message: 'stale' }],
            checksNotPerformed: [],
          },
        },
      ],
    });

    const output = renderMarkdown(report);
    expect(output).toContain('## Proposed patches');
    expect(output).toContain('**Validation:** INVALID');
    expect(output).toContain('[error] patch-applicability: stale');
    expect(output).toContain('- old text');
    expect(output).toContain('+ new text');
  });

  it('renders a NEEDS_MORE_INFORMATION patch outcome without a diff', () => {
    const report = sampleReport({
      proposedPatches: [
        {
          finding: sampleReport().findings[0]!,
          result: { status: 'NEEDS_MORE_INFORMATION', reason: 'not enough context' },
        },
      ],
    });
    const output = renderMarkdown(report);
    expect(output).toContain('**Status:** NEEDS_MORE_INFORMATION');
    expect(output).toContain('not enough context');
  });

  it('renders unresolved items when present, and omits the section when empty', () => {
    const withUnresolved = renderMarkdown(
      sampleReport({
        unresolved: {
          imports: [{ filePath: 'src/a.ts', specifier: './missing' }],
          annotations: [{ filePath: 'docs/a.md', target: 'x#y', reason: 'not found' }],
          danglingReferences: [{ sourceStableId: 'a', targetStableId: 'b', edgeType: 'DOCUMENTS' }],
        },
      }),
    );
    expect(withUnresolved).toContain('## Unresolved');
    expect(withUnresolved).toContain('./missing');
    expect(withUnresolved).toContain('not found');
    expect(withUnresolved).toContain('Dangling DOCUMENTS reference');

    const withoutUnresolved = renderMarkdown(sampleReport());
    expect(withoutUnresolved).not.toContain('## Unresolved');
  });
});
