import { describe, expect, it } from 'vitest';
import { parseMarkdownDocument } from '../src/parseMarkdownDocument.js';

describe('tracedocs annotations', () => {
  it('parses a well-formed documents annotation', () => {
    const source = `<!-- tracedocs:documents src/auth/token.ts#refreshAccessToken -->\n\n# Refresh tokens\n`;
    const result = parseMarkdownDocument('docs/a.md', source);

    expect(result.annotations).toEqual([
      expect.objectContaining({
        directive: 'documents',
        target: 'src/auth/token.ts#refreshAccessToken',
        wellFormed: true,
        issues: [],
      }),
    ]);
  });

  it('flags an unknown directive as not well-formed', () => {
    const source = `<!-- tracedocs:frobnicate src/x.ts -->\n`;
    const result = parseMarkdownDocument('docs/a.md', source);

    expect(result.annotations[0]?.wellFormed).toBe(false);
    expect(result.annotations[0]?.issues[0]).toMatch(/unknown tracedocs directive/i);
  });

  it('ignores ordinary HTML comments', () => {
    const source = `<!-- just a regular comment -->\n`;
    const result = parseMarkdownDocument('docs/a.md', source);
    expect(result.annotations).toEqual([]);
  });
});
