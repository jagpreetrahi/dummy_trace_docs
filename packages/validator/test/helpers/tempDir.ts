import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface TempDir {
  root: string;
  writeFile(relativePath: string, content: string): Promise<void>;
  cleanup(): Promise<void>;
}

export async function createTempDir(): Promise<TempDir> {
  const root = await mkdtemp(join(tmpdir(), 'tracedocs-validator-'));
  return {
    root,
    async writeFile(relativePath: string, content: string) {
      const absolutePath = join(root, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf-8');
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
