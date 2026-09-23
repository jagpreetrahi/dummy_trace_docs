import { describe, expect, it } from 'vitest';
import { parseTypeScriptFile } from '../src/parseTypeScriptFile.js';

describe('import extraction', () => {
  it('extracts default, named, and namespace imports', () => {
    const source = `
import React from 'react';
import { useState, useEffect as useEffectAlias } from 'react';
import * as path from 'node:path';
import type { Options } from './types';
`;
    const result = parseTypeScriptFile('src/a.ts', source);

    expect(result.imports).toHaveLength(4);
    expect(result.imports[0]).toMatchObject({ specifier: 'react', defaultImportLocal: 'React' });
    expect(result.imports[1]).toMatchObject({
      specifier: 'react',
      namedImports: [
        { imported: 'useState', local: 'useState' },
        { imported: 'useEffect', local: 'useEffectAlias' },
      ],
    });
    expect(result.imports[2]).toMatchObject({ specifier: 'node:path', namespaceImportLocal: 'path' });
    expect(result.imports[3]).toMatchObject({ specifier: './types', isTypeOnly: true });
  });
});

describe('export extraction', () => {
  it('extracts named re-exports and export *', () => {
    const source = `
export { refreshAccessToken } from './token';
export { save as persist } from './store';
export * from './constants';
export * as helpers from './helpers';
`;
    const result = parseTypeScriptFile('src/index.ts', source);

    expect(result.exports).toEqual([
      expect.objectContaining({
        exportedName: 'refreshAccessToken',
        localName: 'refreshAccessToken',
        reExportFrom: './token',
      }),
      expect.objectContaining({
        exportedName: 'persist',
        localName: 'save',
        reExportFrom: './store',
      }),
      expect.objectContaining({ exportedName: '*', reExportFrom: './constants' }),
      expect.objectContaining({ exportedName: 'helpers', reExportFrom: './helpers' }),
    ]);
  });

  it('extracts a default export assignment referring to a local symbol', () => {
    const source = `
function refreshAccessToken() {}
export default refreshAccessToken;
`;
    const result = parseTypeScriptFile('src/token.ts', source);

    const defaultExport = result.exports.find((e) => e.exportedName === 'default');
    expect(defaultExport).toMatchObject({ exportedName: 'default', localName: 'refreshAccessToken' });
  });

  it('flags destructured export bindings as unsupported', () => {
    const source = `export const { a, b } = getConfig();`;
    const result = parseTypeScriptFile('src/config.ts', source);

    expect(result.unsupportedConstructs).toHaveLength(1);
    expect(result.unsupportedConstructs[0]!.description).toMatch(/destructured export/i);
    // The call inside the initializer should still be found.
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]!.calleeName).toBe('getConfig');
  });

  it('flags CommonJS-style export= as unsupported', () => {
    const source = `export = { foo: 1 };`;
    const result = parseTypeScriptFile('src/legacy.ts', source);

    expect(result.unsupportedConstructs).toHaveLength(1);
    expect(result.unsupportedConstructs[0]!.description).toMatch(/export =/);
  });
});
