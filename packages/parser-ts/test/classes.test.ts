import { describe, expect, it } from 'vitest';
import { parseTypeScriptFile } from '../src/parseTypeScriptFile.js';

describe('class and method extraction', () => {
  it('extracts a class and its methods with qualified names', () => {
    const source = `
export class AuthenticationService {
  constructor(private tokenStore: TokenStore) {}

  /** Refreshes the current token. */
  async refresh(): Promise<void> {
    this.tokenStore.save('x');
  }

  static create(): AuthenticationService {
    return new AuthenticationService(null as never);
  }
}
`;
    const result = parseTypeScriptFile('src/auth/service.ts', source);

    const classSymbol = result.symbols.find((s) => s.kind === 'class');
    expect(classSymbol).toBeDefined();
    expect(classSymbol?.name).toBe('AuthenticationService');
    expect(classSymbol?.exported).toBe(true);
    expect(classSymbol?.id).toBe('src/auth/service.ts#AuthenticationService:class');

    const methodNames = result.symbols.filter((s) => s.kind === 'method').map((s) => s.name);
    expect(methodNames.sort()).toEqual(['constructor', 'create', 'refresh']);

    const refresh = result.symbols.find((s) => s.qualifiedName === 'AuthenticationService.refresh');
    expect(refresh?.parentId).toBe(classSymbol?.id);
    expect(refresh?.jsDoc?.description).toBe('Refreshes the current token.');
  });

  it('extracts arrow-function class fields as methods', () => {
    const source = `
class Button {
  handleClick = () => {
    doSomething();
  };
}
`;
    const result = parseTypeScriptFile('src/button.ts', source);
    const method = result.symbols.find((s) => s.name === 'handleClick');
    expect(method).toBeDefined();
    expect(method?.kind).toBe('method');
  });

  it('flags a computed method name as unsupported instead of guessing', () => {
    const source = `
class Foo {
  [computedName()]() {}
}
`;
    const result = parseTypeScriptFile('src/foo.ts', source);
    expect(result.unsupportedConstructs).toHaveLength(1);
    expect(result.unsupportedConstructs[0]!.description).toMatch(/computed method name/i);
  });

  it('does not extract plain data fields as symbols', () => {
    const source = `
class Config {
  timeout = 5000;
}
`;
    const result = parseTypeScriptFile('src/config.ts', source);
    const nonClassSymbols = result.symbols.filter((s) => s.kind !== 'class');
    expect(nonClassSymbols).toEqual([]);
  });
});
