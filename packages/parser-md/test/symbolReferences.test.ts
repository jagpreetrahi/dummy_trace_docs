import { describe, expect, it } from 'vitest';
import { parseMarkdownDocument } from '../src/parseMarkdownDocument.js';

describe('symbol reference extraction', () => {
  it('classifies inline code as symbol-like, file-path, or neither', () => {
    const source = `
Call \`refreshAccessToken()\` or \`AuthService.refresh\`.
See \`src/auth/token.ts\` and \`config.json\`.
This is just \`plain code\` with a space.
`;
    const result = parseMarkdownDocument('docs/a.md', source);

    const byRaw = Object.fromEntries(result.symbolReferences.map((r) => [r.raw, r.kind]));
    expect(byRaw['refreshAccessToken()']).toBe('symbol-like');
    expect(byRaw['AuthService.refresh']).toBe('symbol-like');
    expect(byRaw['src/auth/token.ts']).toBe('file-path');
    expect(byRaw['config.json']).toBe('file-path');
    expect(byRaw['plain code']).toBeUndefined();
  });
});
