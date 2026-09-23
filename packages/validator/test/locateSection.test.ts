import { describe, expect, it } from 'vitest';
import { assembleResultingDocument, locateSection } from '../src/locateSection.js';

const DOC = '# Title\n\nIntro.\n\n## Refresh tokens\n\nOld details.\n\n## Other\n\nUnrelated.\n';

describe('locateSection', () => {
  it('treats a null sectionHeading as the whole document', () => {
    const located = locateSection(DOC, null);
    expect(located?.currentText).toBe(DOC);
  });

  it('finds a section by its exact heading text', () => {
    const located = locateSection(DOC, 'Refresh tokens');
    expect(located?.currentText).toContain('## Refresh tokens');
    expect(located?.currentText).toContain('Old details.');
    expect(located?.currentText).not.toContain('Unrelated.');
  });

  it('returns null when the heading no longer exists', () => {
    expect(locateSection(DOC, 'Does Not Exist')).toBeNull();
  });
});

describe('assembleResultingDocument', () => {
  it('splices the proposed content into the located range, leaving the rest intact', () => {
    const located = locateSection(DOC, 'Refresh tokens')!;
    const patch = {
      documentPath: 'docs/a.md',
      sectionHeading: 'Refresh tokens',
      originalContent: located.currentText,
      proposedContent: '## Refresh tokens\n\nNew details.',
      explanation: '',
      evidence: [],
      assumptions: [],
    };

    const result = assembleResultingDocument(DOC, patch, located);

    expect(result).toContain('# Title');
    expect(result).toContain('New details.');
    expect(result).not.toContain('Old details.');
    expect(result).toContain('## Other');
    expect(result).toContain('Unrelated.');
  });
});
