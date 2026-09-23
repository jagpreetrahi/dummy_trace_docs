import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface TempRepo {
  root: string;
  writeFile(relativePath: string, content: string): Promise<void>;
  git(...args: string[]): Promise<void>;
  commitAll(message: string): Promise<void>;
  cleanup(): Promise<void>;
}

/** Creates an isolated temporary directory initialized as a git repository. */
export async function createTempRepo(): Promise<TempRepo> {
  const root = await mkdtemp(join(tmpdir(), 'tracedocs-repo-'));

  const git = async (...args: string[]) => {
    await execFileAsync('git', args, { cwd: root });
  };

  await git('init', '-q');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test User');

  return {
    root,
    git,
    async writeFile(relativePath: string, content: string) {
      const absolutePath = join(root, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf-8');
    },
    async commitAll(message: string) {
      await git('add', '-A');
      await git('commit', '-q', '-m', message);
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
