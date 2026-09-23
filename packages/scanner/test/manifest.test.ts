import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadManifest, saveManifest } from '../src/manifest.js';
import { createTempRepo, type TempRepo } from './helpers/tempRepo.js';

describe('manifest persistence', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await createTempRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('returns an empty manifest when none has been saved yet', async () => {
    const manifest = await loadManifest(repo.root);
    expect(manifest.revision).toBeNull();
    expect(manifest.files).toEqual({});
  });

  it('round-trips a saved manifest', async () => {
    const manifest = {
      revision: 'abc123',
      updatedAt: new Date().toISOString(),
      files: { 'src/a.ts': { contentHash: 'deadbeef', language: 'typescript' as const } },
    };

    await saveManifest(repo.root, manifest);
    const loaded = await loadManifest(repo.root);

    expect(loaded).toEqual(manifest);
  });
});
