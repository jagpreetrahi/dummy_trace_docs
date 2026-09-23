import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProposedPatch } from '@tracedocs/core';
import { applyPatch } from '../src/applyPatch.js';
import { createTempDir, type TempDir } from './helpers/tempDir.js';

const DOC = '# Authentication\n\n## Refresh tokens\n\nOriginal text.\n';

function patchFor(overrides: Partial<ProposedPatch> = {}): ProposedPatch {
  return {
    documentPath: 'docs/auth.md',
    sectionHeading: 'Refresh tokens',
    originalContent: '## Refresh tokens\n\nOriginal text.',
    proposedContent: '## Refresh tokens\n\nUpdated text.',
    explanation: '',
    evidence: [],
    assumptions: [],
    ...overrides,
  };
}

describe('applyPatch', () => {
  let dir: TempDir;

  beforeEach(async () => {
    dir = await createTempDir();
    await dir.writeFile('docs/auth.md', DOC);
  });

  afterEach(async () => {
    await dir.cleanup();
  });

  it('writes the resulting document when the patch is valid and not stale', async () => {
    const result = await applyPatch(patchFor(), dir.root);

    expect(result.applied).toBe(true);
    expect(result.validation.valid).toBe(true);

    const written = await readFile(`${dir.root}/docs/auth.md`, 'utf-8');
    expect(written).toContain('Updated text.');
    expect(written).not.toContain('Original text.');
    expect(written).toContain('# Authentication'); // untouched content preserved
  });

  it('refuses to write a stale patch, and leaves the file untouched', async () => {
    await dir.writeFile('docs/auth.md', '# Authentication\n\n## Refresh tokens\n\nSomeone already changed this.\n');

    const result = await applyPatch(patchFor(), dir.root);

    expect(result.applied).toBe(false);
    expect(result.validation.valid).toBe(false);
    const written = await readFile(`${dir.root}/docs/auth.md`, 'utf-8');
    expect(written).toContain('Someone already changed this.');
  });

  it('refuses to write a patch with a structurally invalid proposal', async () => {
    const result = await applyPatch(
      patchFor({ proposedContent: '## Refresh tokens\n\n```ts\nunclosed fence\n' }),
      dir.root,
    );

    expect(result.applied).toBe(false);
    const written = await readFile(`${dir.root}/docs/auth.md`, 'utf-8');
    expect(written).toBe(DOC);
  });

  it('refuses to write when the document path escapes the repository root', async () => {
    const result = await applyPatch(
      patchFor({ documentPath: '../outside.md', originalContent: '', proposedContent: 'hacked' }),
      dir.root,
    );

    expect(result.applied).toBe(false);
    expect(result.validation.issues).toEqual([
      expect.objectContaining({ check: 'document-readable' }),
    ]);
  });

  it('is idempotent to call twice: the second call sees the applied content and reports it stale', async () => {
    const first = await applyPatch(patchFor(), dir.root);
    expect(first.applied).toBe(true);

    const second = await applyPatch(patchFor(), dir.root);
    expect(second.applied).toBe(false);
    expect(second.validation.issues.some((i) => i.check === 'patch-applicability')).toBe(true);
  });
});
