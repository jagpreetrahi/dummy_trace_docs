import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface TempRepo {
  root: string;
  writeFile(relativePath: string, content: string): Promise<void>;
  removeFile(relativePath: string): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * A plain temp directory (no `git init`) — the indexer only needs the
 * scanner's file discovery, which works without a git repository (git
 * revision just comes back `null`, already covered in Milestone 1's tests).
 */
export async function createTempRepo(): Promise<TempRepo> {
  const root = await mkdtemp(join(tmpdir(), 'tracedocs-index-'));

  return {
    root,
    async writeFile(relativePath: string, content: string) {
      const absolutePath = join(root, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf-8');
    },
    async removeFile(relativePath: string) {
      await rm(join(root, relativePath));
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
