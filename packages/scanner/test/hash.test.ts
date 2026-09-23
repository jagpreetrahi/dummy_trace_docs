import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashContent, hashFile } from '../src/hash.js';

describe('hashContent', () => {
  it('is deterministic for the same content', () => {
    expect(hashContent('hello')).toBe(hashContent('hello'));
  });

  it('differs for different content', () => {
    expect(hashContent('hello')).not.toBe(hashContent('world'));
  });
});

describe('hashFile', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tracedocs-hash-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('matches hashContent of the same bytes', async () => {
    const filePath = join(dir, 'file.txt');
    await writeFile(filePath, 'hello world', 'utf-8');
    expect(await hashFile(filePath)).toBe(hashContent('hello world'));
  });
});
