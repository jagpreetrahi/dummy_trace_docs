import { describe, expect, it } from 'vitest';
import { parseMarkdownDocument } from '../src/parseMarkdownDocument.js';

describe('link extraction', () => {
  it('classifies external vs internal links', () => {
    const source = `
[External](https://example.com/docs)
[Relative](./other.md)
[Anchor](#refresh-tokens)
[Mail](mailto:team@example.com)
`;
    const result = parseMarkdownDocument('docs/a.md', source);

    expect(result.links).toEqual([
      expect.objectContaining({ target: 'https://example.com/docs', isExternal: true }),
      expect.objectContaining({ target: './other.md', isExternal: false }),
      expect.objectContaining({ target: '#refresh-tokens', isExternal: false }),
      expect.objectContaining({ target: 'mailto:team@example.com', isExternal: true }),
    ]);
  });
});

describe('code fence extraction', () => {
  it('extracts fenced code blocks with their language', () => {
    const source = '```ts\nconst x = 1;\n```\n';
    const result = parseMarkdownDocument('docs/a.md', source);

    expect(result.codeFences).toEqual([
      expect.objectContaining({ language: 'ts', content: 'const x = 1;' }),
    ]);
  });

  it('records a null language for an unlabeled fence', () => {
    const source = '```\nplain text\n```\n';
    const result = parseMarkdownDocument('docs/a.md', source);
    expect(result.codeFences[0]?.language).toBeNull();
  });
});
