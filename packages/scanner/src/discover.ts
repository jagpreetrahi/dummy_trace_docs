import fg from 'fast-glob';
import ignoreFactory from 'ignore';
import { readGitignore } from './git.js';
import { isSupportedFile } from './language.js';

/**
 * Directories excluded unconditionally, regardless of .gitignore content.
 * These are near-universal build/dependency directories that should never
 * be indexed even in a repo with no .gitignore.
 */
const ALWAYS_EXCLUDED_DIRS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.tracedocs/**',
];

const CANDIDATE_PATTERNS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.mts',
  '**/*.cts',
  '**/*.js',
  '**/*.jsx',
  '**/*.mjs',
  '**/*.cjs',
  '**/*.md',
  '**/*.mdx',
];

/**
 * Discovers repository-relative paths (posix separators) of all supported
 * source and documentation files, honoring the repository's `.gitignore`.
 */
export async function discoverFiles(repoRoot: string): Promise<string[]> {
  const gitignoreContent = await readGitignore(repoRoot);
  const ig = ignoreFactory().add(gitignoreContent);

  const matches = await fg(CANDIDATE_PATTERNS, {
    cwd: repoRoot,
    ignore: ALWAYS_EXCLUDED_DIRS,
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: false,
    unique: true,
  });

  return matches
    .filter((relativePath) => !ig.ignores(relativePath))
    .filter((relativePath) => isSupportedFile(relativePath))
    .sort();
}
