import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  FileChangeSummary,
  Manifest,
  RepositoryScanResult,
  ScannedFile,
} from '@tracedocs/core';
import { discoverFiles } from './discover.js';
import { getCurrentRevision } from './git.js';
import { hashFile } from './hash.js';
import { detectLanguage } from './language.js';

/**
 * Scans a repository: discovers supported files, hashes their content, and
 * records the current git revision. Does not consult or mutate the manifest
 * — callers combine this with {@link diffAgainstManifest} and
 * {@link toManifest} to decide what changed and persist the new baseline.
 */
export async function scanRepository(repoRoot: string): Promise<RepositoryScanResult> {
  const [revision, relativePaths] = await Promise.all([
    getCurrentRevision(repoRoot),
    discoverFiles(repoRoot),
  ]);

  const files: ScannedFile[] = await Promise.all(
    relativePaths.map(async (repoRelativePath) => {
      const absolutePath = join(repoRoot, repoRelativePath);
      const [contentHash, stats] = await Promise.all([
        hashFile(absolutePath),
        stat(absolutePath),
      ]);
      const language = detectLanguage(repoRelativePath);
      if (!language) {
        // discoverFiles already filters to supported files; this guards
        // against the two lists drifting apart silently.
        throw new Error(`Unsupported file slipped through discovery: ${repoRelativePath}`);
      }
      return {
        repoRelativePath,
        language,
        contentHash,
        sizeBytes: stats.size,
      };
    }),
  );

  return {
    repositoryRoot: repoRoot,
    revision,
    scannedAt: new Date().toISOString(),
    files,
  };
}

/**
 * Compares a fresh scan against the previously persisted manifest to
 * classify each file as added, modified, removed, or unchanged. This is
 * what lets incremental indexing (Milestone 3+) skip re-parsing files whose
 * content hash has not changed.
 */
export function diffAgainstManifest(
  scan: RepositoryScanResult,
  previous: Manifest,
): FileChangeSummary {
  const summary: FileChangeSummary = { added: [], modified: [], removed: [], unchanged: [] };
  const seen = new Set<string>();

  for (const file of scan.files) {
    seen.add(file.repoRelativePath);
    const previousEntry = previous.files[file.repoRelativePath];
    if (!previousEntry) {
      summary.added.push(file.repoRelativePath);
    } else if (previousEntry.contentHash !== file.contentHash) {
      summary.modified.push(file.repoRelativePath);
    } else {
      summary.unchanged.push(file.repoRelativePath);
    }
  }

  for (const repoRelativePath of Object.keys(previous.files)) {
    if (!seen.has(repoRelativePath)) {
      summary.removed.push(repoRelativePath);
    }
  }

  return summary;
}

/** Builds the manifest that should be persisted after a scan. */
export function toManifest(scan: RepositoryScanResult): Manifest {
  const files: Manifest['files'] = {};
  for (const file of scan.files) {
    files[file.repoRelativePath] = { contentHash: file.contentHash, language: file.language };
  }
  return { revision: scan.revision, updatedAt: scan.scannedAt, files };
}
