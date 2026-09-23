import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import type { FileChangeType } from '@tracedocs/core';

export interface RawFileDiff {
  status: FileChangeType;
  /** Current/new path. */
  path: string;
  /** Present only when `status === 'renamed'`. */
  previousPath?: string;
}

const STATUS_MAP: Record<string, FileChangeType> = { A: 'added', M: 'modified', D: 'deleted' };

/**
 * Lists files that differ between `baseRevision` and `targetRevision`, or
 * between `baseRevision` and the current working tree when
 * `targetRevision` is omitted. Rename detection (`-M`) is git's own — far
 * more reliable than inferring a rename from a delete+add pair ourselves,
 * but it only ever applies to *tracked* files: renaming an uncommitted
 * file that was never `git add`ed is indistinguishable from an unrelated
 * delete-and-add, since there is nothing on the git side to correlate them
 * against. Copy detection (`C...` status codes) and type changes (`T`) are
 * not modeled; those lines are silently skipped as out of scope.
 */
export async function getChangedFiles(
  repoRoot: string,
  baseRevision: string,
  targetRevision?: string,
): Promise<RawFileDiff[]> {
  const git = simpleGit(repoRoot);
  const args = ['diff', '--name-status', '-M', baseRevision];
  if (targetRevision) args.push(targetRevision);

  const raw = await git.raw(args);
  const diffs = parseNameStatus(raw);

  // `git diff <base>` (no second ref) only shows changes to files git
  // already tracks. A brand-new file that hasn't been `git add`ed yet is
  // invisible to it, so untracked files are folded in separately here —
  // only meaningful when comparing against the working tree.
  if (!targetRevision) {
    const untracked = await git.raw(['ls-files', '--others', '--exclude-standard']);
    for (const path of untracked.split('\n')) {
      if (path.trim()) diffs.push({ status: 'added', path: path.trim() });
    }
  }

  return diffs;
}

function parseNameStatus(raw: string): RawFileDiff[] {
  const diffs: RawFileDiff[] = [];

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const columns = line.split('\t');
    const code = columns[0] ?? '';

    if (code.startsWith('R')) {
      const previousPath = columns[1];
      const path = columns[2];
      if (previousPath && path) diffs.push({ status: 'renamed', path, previousPath });
      continue;
    }

    const status = STATUS_MAP[code];
    const path = columns[1];
    if (status && path) diffs.push({ status, path });
  }

  return diffs;
}

/** Resolves a ref (branch, tag, `HEAD~1`, short SHA, ...) to its full commit SHA. */
export async function resolveRevision(repoRoot: string, revision: string): Promise<string> {
  const git = simpleGit(repoRoot);
  return (await git.revparse([revision])).trim();
}

/** File content at a specific revision, or `null` if the file doesn't exist there. */
export async function readFileAtRevision(
  repoRoot: string,
  revision: string,
  path: string,
): Promise<string | null> {
  const git = simpleGit(repoRoot);
  try {
    return await git.show([`${revision}:${path}`]);
  } catch {
    return null;
  }
}

/** File content in `targetRevision`, or in the working tree when `targetRevision` is `undefined`. */
export async function readTargetContent(
  repoRoot: string,
  targetRevision: string | undefined,
  path: string,
): Promise<string | null> {
  if (targetRevision) return readFileAtRevision(repoRoot, targetRevision, path);
  try {
    return await readFile(join(repoRoot, path), 'utf-8');
  } catch {
    return null;
  }
}
