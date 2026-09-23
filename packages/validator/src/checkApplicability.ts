import type { ProposedPatch, ValidationIssue } from '@tracedocs/core';
import { locateSection, type LocatedSection } from './locateSection.js';

export interface ApplicabilityResult {
  issues: ValidationIssue[];
  located: LocatedSection | null;
}

/**
 * The staleness check: does the section this patch targets still exist,
 * and does its current text still match what the patch was generated
 * against? Both are `error`-severity — applying a patch against content
 * that has since changed could silently discard someone else's edit.
 */
export function checkApplicability(patch: ProposedPatch, docContent: string | null): ApplicabilityResult {
  if (docContent === null) {
    return {
      issues: [
        {
          check: 'document-readable',
          severity: 'error',
          message: `Document ${patch.documentPath} no longer exists, could not be read, or its path escapes the repository.`,
        },
      ],
      located: null,
    };
  }

  const located = locateSection(docContent, patch.sectionHeading);
  if (!located) {
    return {
      issues: [
        {
          check: 'patch-applicability',
          severity: 'error',
          message: `Section "${patch.sectionHeading}" was not found in ${patch.documentPath} — it may have been renamed or removed since this patch was generated.`,
        },
      ],
      located: null,
    };
  }

  if (located.currentText !== patch.originalContent) {
    return {
      issues: [
        {
          check: 'patch-applicability',
          severity: 'error',
          message: `The content of this section in ${patch.documentPath} has changed since this patch was generated — regenerate the patch before applying.`,
        },
      ],
      located,
    };
  }

  return { issues: [], located };
}
