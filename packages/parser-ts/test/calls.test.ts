import { describe, expect, it } from 'vitest';
import { parseTypeScriptFile } from '../src/parseTypeScriptFile.js';

describe('call extraction', () => {
  it('attributes a call to its enclosing function', () => {
    const source = `
function outer() {
  helper();
}
`;
    const result = parseTypeScriptFile('src/a.ts', source);
    const outerId = result.symbols.find((s) => s.name === 'outer')!.id;

    expect(result.calls).toEqual([
      expect.objectContaining({ calleeName: 'helper', callerSymbolId: outerId }),
    ]);
  });

  it('records a top-level call with a null caller', () => {
    const source = `initialize();`;
    const result = parseTypeScriptFile('src/a.ts', source);

    expect(result.calls).toEqual([
      expect.objectContaining({ calleeName: 'initialize', callerSymbolId: null }),
    ]);
  });

  it('records simple property-access call chains', () => {
    const source = `authService.tokenStore.save();`;
    const result = parseTypeScriptFile('src/a.ts', source);

    expect(result.calls[0]!.calleeName).toBe('authService.tokenStore.save');
  });

  it('attributes a call inside a method to that method', () => {
    const source = `
class Service {
  refresh() {
    this.persist();
  }
}
`;
    const result = parseTypeScriptFile('src/a.ts', source);
    const refreshId = result.symbols.find((s) => s.name === 'refresh')!.id;

    expect(result.calls).toEqual([
      expect.objectContaining({ calleeName: 'this.persist', callerSymbolId: refreshId }),
    ]);
  });

  it('skips dynamic call callees rather than guessing', () => {
    const source = `
const fns = [() => {}];
fns[0]();
`;
    const result = parseTypeScriptFile('src/a.ts', source);
    expect(result.calls).toEqual([]);
  });

  it('attributes a call inside an anonymous callback to the enclosing named function', () => {
    const source = `
function run() {
  [1, 2, 3].forEach(function () {
    doWork();
  });
}
`;
    const result = parseTypeScriptFile('src/a.ts', source);
    const runId = result.symbols.find((s) => s.name === 'run')!.id;

    const doWorkCall = result.calls.find((c) => c.calleeName === 'doWork');
    expect(doWorkCall?.callerSymbolId).toBe(runId);
  });
});
