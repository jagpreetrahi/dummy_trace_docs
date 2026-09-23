import { describe, expect, it } from 'vitest';
import { parseMarkdownDocument } from '../src/parseMarkdownDocument.js';

describe('headings and sections', () => {
  it('extracts headings with GitHub-compatible anchor slugs', () => {
    const source = `# Authentication\n\n## Refresh Tokens\n\nSome text.\n`;
    const result = parseMarkdownDocument('docs/authentication.md', source);

    expect(result.headings).toEqual([
      expect.objectContaining({ depth: 1, text: 'Authentication', slug: 'authentication' }),
      expect.objectContaining({ depth: 2, text: 'Refresh Tokens', slug: 'refresh-tokens' }),
    ]);
  });

  it('disambiguates duplicate heading text the same way GitHub does', () => {
    const source = `# Setup\n\ntext\n\n# Setup\n\ntext\n`;
    const result = parseMarkdownDocument('docs/a.md', source);
    expect(result.headings.map((h) => h.slug)).toEqual(['setup', 'setup-1']);
  });

  it('assigns preamble content before the first heading to a null-heading section', () => {
    const source = `Intro paragraph.\n\n# Title\n\nBody.\n`;
    const result = parseMarkdownDocument('docs/a.md', source);

    expect(result.sections[0]?.heading).toBeNull();
    expect(result.sections[0]?.content).toContain('Intro paragraph.');
    expect(result.sections[1]?.heading?.text).toBe('Title');
    expect(result.sections[1]?.content).toContain('Body.');
  });

  it('gives each heading, including nested ones, its own non-overlapping section', () => {
    const source = `# A\n\nalpha\n\n## B\n\nbeta\n\n# C\n\ngamma\n`;
    const result = parseMarkdownDocument('docs/a.md', source);

    expect(result.sections).toHaveLength(3);
    expect(result.sections[0]?.content).toContain('alpha');
    expect(result.sections[0]?.content).not.toContain('beta');
    expect(result.sections[1]?.heading?.text).toBe('B');
    expect(result.sections[1]?.content).toContain('beta');
    expect(result.sections[2]?.heading?.text).toBe('C');
    expect(result.sections[2]?.content).toContain('gamma');
  });
});
