import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProposedPatch } from '@tracedocs/core';
import { checkLinksAndAnchors } from '../src/checkLinksAndAnchors.js';
import { createTempDir, type TempDir } from './helpers/tempDir.js';

function patchFor(proposedContent: string): ProposedPatch {
  return {
    documentPath: 'docs/a.md',
    sectionHeading: 'Refresh tokens',
    originalContent: '',
    proposedContent,
    explanation: '',
    evidence: [],
    assumptions: [],
  };
}

describe('checkLinksAndAnchors', () => {
  let dir: TempDir;

  beforeEach(async () => {
    dir = await createTempDir();
    await dir.writeFile('docs/other.md', '# Other\n');
  });

  afterEach(async () => {
    await dir.cleanup();
  });

  it('accepts an anchor link to a heading present in the resulting document', async () => {
    const resultingDocument = '# Title\n\n## Refresh tokens\n\nSee [setup](#setup).\n\n## Setup\n\nDetails.\n';
    const patch = patchFor('## Refresh tokens\n\nSee [setup](#setup).\n');

    const issues = await checkLinksAndAnchors(resultingDocument, patch, dir.root);

    expect(issues).toEqual([]);
  });

  it('flags an anchor link with no matching heading anywhere in the resulting document', async () => {
    const resultingDocument = '# Title\n\n## Refresh tokens\n\nSee [ghost](#ghost).\n';
    const patch = patchFor('## Refresh tokens\n\nSee [ghost](#ghost).\n');

    const issues = await checkLinksAndAnchors(resultingDocument, patch, dir.root);

    expect(issues).toEqual([expect.objectContaining({ check: 'invalid-anchor', severity: 'warning' })]);
  });

  it('accepts a relative link to a file that exists', async () => {
    const patch = patchFor('## Refresh tokens\n\nSee [other](./other.md).\n');
    const issues = await checkLinksAndAnchors('irrelevant', patch, dir.root);
    expect(issues).toEqual([]);
  });

  it('flags a relative link to a file that does not exist', async () => {
    const patch = patchFor('## Refresh tokens\n\nSee [missing](./missing.md).\n');
    const issues = await checkLinksAndAnchors('irrelevant', patch, dir.root);
    expect(issues).toEqual([expect.objectContaining({ check: 'broken-link', severity: 'warning' })]);
  });

  it('flags a relative link that escapes the repository root', async () => {
    const patch = patchFor('## Refresh tokens\n\nSee [escape](../../../../etc/passwd).\n');
    const issues = await checkLinksAndAnchors('irrelevant', patch, dir.root);
    expect(issues).toEqual([expect.objectContaining({ check: 'broken-link' })]);
  });

  it('never checks external links', async () => {
    const patch = patchFor('## Refresh tokens\n\nSee [external](https://example.com/does-not-exist).\n');
    const issues = await checkLinksAndAnchors('irrelevant', patch, dir.root);
    expect(issues).toEqual([]);
  });
});
