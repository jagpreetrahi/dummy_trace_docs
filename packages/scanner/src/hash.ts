import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export function hashContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function hashFile(absolutePath: string): Promise<string> {
  const content = await readFile(absolutePath);
  return hashContent(content);
}
