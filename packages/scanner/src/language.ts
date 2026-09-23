import type { SupportedLanguage } from '@tracedocs/core';

const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.md': 'markdown',
  '.mdx': 'markdown',
};

/** Returns the supported language for a file path, or null if unsupported. */
export function detectLanguage(repoRelativePath: string): SupportedLanguage | null {
  const dotIndex = repoRelativePath.lastIndexOf('.');
  if (dotIndex === -1) return null;
  const extension = repoRelativePath.slice(dotIndex).toLowerCase();
  return EXTENSION_MAP[extension] ?? null;
}

export function isSupportedFile(repoRelativePath: string): boolean {
  return detectLanguage(repoRelativePath) !== null;
}
