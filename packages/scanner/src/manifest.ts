import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Manifest } from '@tracedocs/core';

const MANIFEST_RELATIVE_PATH = '.tracedocs/manifest.json';

export function manifestPath(repoRoot: string): string {
  return join(repoRoot, MANIFEST_RELATIVE_PATH);
}

/** Loads the persisted manifest, or an empty one if none exists yet. */
export async function loadManifest(repoRoot: string): Promise<Manifest> {
  try {
    const raw = await readFile(manifestPath(repoRoot), 'utf-8');
    return JSON.parse(raw) as Manifest;
  } catch {
    return { revision: null, updatedAt: new Date(0).toISOString(), files: {} };
  }
}

export async function saveManifest(repoRoot: string, manifest: Manifest): Promise<void> {
  const target = manifestPath(repoRoot);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(manifest, null, 2), 'utf-8');
}
