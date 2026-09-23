import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

/**
 * Resolves `relativePath` against `repoRoot` and returns `null` if the
 * result would land outside `repoRoot` — a `..`-escaping or absolute
 * path never gets read or written, regardless of where it came from
 * (brief §12: "validate paths to prevent directory traversal").
 */
export function resolveSafePath(repoRoot: string, relativePath: string): string | null {
  const resolvedRoot = resolve(repoRoot);
  const resolvedTarget = resolve(resolvedRoot, relativePath);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + sep)) {
    return null;
  }
  return resolvedTarget;
}

/** Reads a repo-relative document, or `null` if it's unreadable or would escape `repoRoot`. */
export async function readDocument(repoRoot: string, relativePath: string): Promise<string | null> {
  const target = resolveSafePath(repoRoot, relativePath);
  if (!target) return null;
  try {
    return await readFile(target, 'utf-8');
  } catch {
    return null;
  }
}
