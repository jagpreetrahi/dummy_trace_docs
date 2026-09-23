import { describe, expect, it } from 'vitest';
import { parseTypeScriptFile } from '../src/parseTypeScriptFile.js';

describe('function extraction', () => {
  it('extracts an exported function declaration with JSDoc', () => {
    const source = `
/**
 * Refreshes an access token.
 * @param token the refresh token
 * @returns a new access token
 */
export async function refreshAccessToken(token: string): Promise<string> {
  return token;
}
`;
    const result = parseTypeScriptFile('src/auth/token.ts', source);

    expect(result.symbols).toHaveLength(1);
    const fn = result.symbols[0]!;
    expect(fn.kind).toBe('function');
    expect(fn.name).toBe('refreshAccessToken');
    expect(fn.qualifiedName).toBe('refreshAccessToken');
    expect(fn.exported).toBe(true);
    expect(fn.isDefaultExport).toBe(false);
    expect(fn.id).toBe('src/auth/token.ts#refreshAccessToken:function');
    expect(fn.jsDoc?.description).toBe('Refreshes an access token.');
    expect(fn.jsDoc?.tags).toEqual([
      { tag: 'param', text: 'token the refresh token' },
      { tag: 'returns', text: 'a new access token' },
    ]);
    expect(fn.location.startLine).toBe(7);
  });

  it('extracts a non-exported function without JSDoc', () => {
    const source = `function helper() { return 1; }`;
    const result = parseTypeScriptFile('src/util.ts', source);

    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0]!.exported).toBe(false);
    expect(result.symbols[0]!.jsDoc).toBeUndefined();
  });

  it('extracts a default-exported anonymous function as "default"', () => {
    const source = `export default function () { return 1; }`;
    const result = parseTypeScriptFile('src/main.ts', source);

    expect(result.symbols).toHaveLength(1);
    const fn = result.symbols[0]!;
    expect(fn.name).toBe('default');
    expect(fn.isDefaultExport).toBe(true);
    expect(fn.exported).toBe(true);
  });

  it('extracts an exported const arrow function', () => {
    const source = `export const add = (a: number, b: number) => a + b;`;
    const result = parseTypeScriptFile('src/math.ts', source);

    expect(result.symbols).toHaveLength(1);
    const fn = result.symbols[0]!;
    expect(fn.kind).toBe('function');
    expect(fn.name).toBe('add');
    expect(fn.exported).toBe(true);
  });

  it('records exports produced by inline export modifiers', () => {
    const source = `export function foo() {}`;
    const result = parseTypeScriptFile('src/a.ts', source);

    expect(result.exports).toEqual([
      expect.objectContaining({ exportedName: 'foo', localName: 'foo' }),
    ]);
  });
});
