import { describe, expect, it } from 'vitest';
import { detectLanguage, isSupportedFile } from '../src/language.js';

describe('detectLanguage', () => {
  it('maps TypeScript extensions', () => {
    expect(detectLanguage('src/a.ts')).toBe('typescript');
    expect(detectLanguage('src/a.tsx')).toBe('typescript');
    expect(detectLanguage('src/a.mts')).toBe('typescript');
  });

  it('maps JavaScript extensions', () => {
    expect(detectLanguage('src/a.js')).toBe('javascript');
    expect(detectLanguage('src/a.jsx')).toBe('javascript');
    expect(detectLanguage('src/a.cjs')).toBe('javascript');
  });

  it('maps Markdown extensions', () => {
    expect(detectLanguage('docs/a.md')).toBe('markdown');
    expect(detectLanguage('docs/a.mdx')).toBe('markdown');
  });

  it('returns null for unsupported or extensionless files', () => {
    expect(detectLanguage('image.png')).toBeNull();
    expect(detectLanguage('LICENSE')).toBeNull();
  });

  it('is case-insensitive on extension', () => {
    expect(detectLanguage('README.MD')).toBe('markdown');
  });
});

describe('isSupportedFile', () => {
  it('agrees with detectLanguage', () => {
    expect(isSupportedFile('a.ts')).toBe(true);
    expect(isSupportedFile('a.png')).toBe(false);
  });
});
