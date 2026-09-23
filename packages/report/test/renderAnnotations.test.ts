import { describe, expect, it } from 'vitest';
import { renderAnnotations } from '../src/renderAnnotations.js';
import { sampleReport } from './helpers/sampleReport.js';

describe('renderAnnotations', () => {
  it('renders a HIGH-certainty finding as a warning with file, line, and title', () => {
    const output = renderAnnotations(sampleReport());
    expect(output).toMatch(/^::warning file=docs\/auth\.md,line=3,endLine=6,title=/);
    // Only `%`, CR, LF, `,`, and `:` need escaping in a workflow-command
    // property per GitHub's rules — spaces and parens are left as-is.
    expect(output).toContain('title=TraceDocs%3A REVIEW (HIGH)');
    expect(output).toContain('::`refreshAccessToken`');
  });

  it('renders a lower-certainty finding as a notice', () => {
    const report = sampleReport({
      findings: [{ ...sampleReport().findings[0]!, certainty: 'MEDIUM' }],
    });
    const output = renderAnnotations(report);
    expect(output.startsWith('::notice')).toBe(true);
  });

  it('omits line/endLine when sectionLocation is null', () => {
    const report = sampleReport({
      findings: [{ ...sampleReport().findings[0]!, sectionLocation: null }],
    });
    const output = renderAnnotations(report);
    expect(output).not.toContain('line=');
  });

  it('omits endLine when start and end are the same line', () => {
    const report = sampleReport({
      findings: [{ ...sampleReport().findings[0]!, sectionLocation: { startLine: 3, endLine: 3 } }],
    });
    const output = renderAnnotations(report);
    expect(output).toContain('line=3');
    expect(output).not.toContain('endLine=');
  });

  it('escapes newlines in the message but leaves commas/colons as-is (only workflow-command delimiters need escaping there)', () => {
    const report = sampleReport({
      findings: [{ ...sampleReport().findings[0]!, explanation: 'a, b: c\nd' }],
    });
    const output = renderAnnotations(report);
    expect(output).toContain('a, b: c%0Ad');
  });

  it('produces one line per finding', () => {
    const report = sampleReport({ findings: [sampleReport().findings[0]!, sampleReport().findings[0]!] });
    expect(renderAnnotations(report).split('\n')).toHaveLength(2);
  });

  it('produces an empty string when there are no findings', () => {
    expect(renderAnnotations(sampleReport({ findings: [] }))).toBe('');
  });
});
