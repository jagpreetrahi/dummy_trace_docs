import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProposedPatch } from '@tracedocs/core';
import { GraphStore } from '@tracedocs/graph';
import { validatePatch } from '../src/validatePatch.js';
import { createTempDir, type TempDir } from './helpers/tempDir.js';

const DOC = '# Authentication\n\n## Refresh tokens\n\nOriginal text.\n';

function patchFor(overrides: Partial<ProposedPatch> = {}): ProposedPatch {
  return {
    documentPath: 'docs/auth.md',
    sectionHeading: 'Refresh tokens',
    originalContent: '## Refresh tokens\n\nOriginal text.',
    proposedContent: '## Refresh tokens\n\nUpdated text.',
    explanation: 'because it changed',
    evidence: ['evidence'],
    assumptions: [],
    ...overrides,
  };
}

describe('validatePatch', () => {
  let dir: TempDir;

  beforeEach(async () => {
    dir = await createTempDir();
    await dir.writeFile('docs/auth.md', DOC);
  });

  afterEach(async () => {
    await dir.cleanup();
  });

  it('is valid for a clean, non-stale patch', async () => {
    const result = await validatePatch(patchFor(), dir.root);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('is invalid when the patch is stale', async () => {
    await dir.writeFile('docs/auth.md', '# Authentication\n\n## Refresh tokens\n\nSomeone changed this.\n');
    const result = await validatePatch(patchFor(), dir.root);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({ check: 'patch-applicability' })]);
  });

  it('is invalid for an unclosed code fence in the proposal', async () => {
    const result = await validatePatch(
      patchFor({ proposedContent: '## Refresh tokens\n\n```ts\nconst x = 1;\n' }),
      dir.root,
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.check === 'code-fence-integrity')).toBe(true);
  });

  it('records annotation-target-resolution as not performed when no graph store is given', async () => {
    const result = await validatePatch(patchFor(), dir.root);
    expect(result.checksNotPerformed).toContain('annotation-target-resolution');
  });

  it('performs the annotation-target-resolution check when a graph store is given', async () => {
    const store = GraphStore.open(':memory:');
    const repositoryId = store.upsertRepository(dir.root);
    store.upsertNode(repositoryId, {
      stableId: 'src/a.ts#foo:function',
      type: 'function',
      name: 'foo',
      qualifiedName: 'foo',
      filePath: 'src/a.ts',
    });

    const result = await validatePatch(
      patchFor({ proposedContent: '## Refresh tokens\n\n<!-- tracedocs:documents src/a.ts#missing -->\n' }),
      dir.root,
      { store, repositoryId },
    );

    expect(result.checksNotPerformed).not.toContain('annotation-target-resolution');
    expect(result.issues.some((i) => i.check === 'annotation-target-resolution')).toBe(true);
    store.close();
  });

  it('records link checks as not performed when the section cannot be located', async () => {
    const result = await validatePatch(patchFor({ sectionHeading: 'Gone' }), dir.root);
    expect(result.checksNotPerformed).toContain('broken-link');
    expect(result.checksNotPerformed).toContain('invalid-anchor');
  });
});
