import { posix } from 'node:path';

const CANDIDATE_SUFFIXES = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
];

/**
 * Resolves a relative import specifier (`./token`, `../auth/service`) to a
 * repo-relative path that's actually in the indexed file set. Bare
 * specifiers (package imports like `react`, `node:fs`) are never resolved
 * — there is nothing in the repository for them to point at. Returns
 * `null` when relative but nothing in `knownFilePaths` matches any
 * candidate, which the caller reports as an unresolved import rather than
 * guessing.
 */
export function resolveRelativeImport(
  fromFilePath: string,
  specifier: string,
  knownFilePaths: ReadonlySet<string>,
): string | null {
  if (!specifier.startsWith('.')) return null;

  const fromDir = posix.dirname(fromFilePath);
  const joined = posix.normalize(posix.join(fromDir, specifier));

  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${joined}${suffix}`;
    if (knownFilePaths.has(candidate)) return candidate;
  }
  return null;
}
