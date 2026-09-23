import { describe, expect, it } from 'vitest';
import { checkStructure } from '../src/checkStructure.js';

describe('checkStructure', () => {
  it('finds no issues in well-formed content', () => {
    const content = '## Refresh tokens\n\nSome text, then a fence:\n\n```ts\nconst x = 1;\n```\n';
    expect(checkStructure(content)).toEqual([]);
  });

  it('flags an unclosed code fence', () => {
    const content = '## Refresh tokens\n\n```ts\nconst x = 1;\n';
    const issues = checkStructure(content);
    expect(issues).toEqual([
      expect.objectContaining({ check: 'code-fence-integrity', severity: 'error' }),
    ]);
  });

  it('flags a malformed tracedocs annotation', () => {
    const content = '## Refresh tokens\n\n<!-- tracedocs:frobnicate src/a.ts -->\n';
    const issues = checkStructure(content);
    expect(issues).toEqual([
      expect.objectContaining({ check: 'annotation-well-formed', severity: 'error' }),
    ]);
  });

  it('does not flag a well-formed annotation', () => {
    const content = '## Refresh tokens\n\n<!-- tracedocs:documents src/a.ts#foo -->\n';
    expect(checkStructure(content)).toEqual([]);
  });
});
