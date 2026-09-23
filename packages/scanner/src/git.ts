import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

/**
 * Returns the current HEAD commit SHA, or null when the directory is not a
 * git repository yet, or is a git repository with no commits yet.
 */
export async function getCurrentRevision(repoRoot: string): Promise<string | null> {
  const git = simpleGit(repoRoot);
  try {
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return null;
    const revision = await git.revparse(['HEAD']);
    return revision.trim();
  } catch {
    // No commits yet, or git not available for this path.
    return null;
  }
}

/** Reads `.gitignore` content at the repository root, if present. */
export async function readGitignore(repoRoot: string): Promise<string> {
  try {
    return await readFile(join(repoRoot, '.gitignore'), 'utf-8');
  } catch {
    return '';
  }
}
