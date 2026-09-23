import type { ProposedPatch, ValidationCheck, ValidationIssue, ValidationResult } from '@tracedocs/core';
import type { GraphStore } from '@tracedocs/graph';
import { checkAccidentalDeletion } from './checkAccidentalDeletion.js';
import { checkAnnotationTargets } from './checkAnnotationTargets.js';
import { checkApplicability } from './checkApplicability.js';
import { checkLinksAndAnchors } from './checkLinksAndAnchors.js';
import { checkStructure } from './checkStructure.js';
import { assembleResultingDocument } from './locateSection.js';
import { readDocument } from './safePath.js';

export interface ValidatePatchOptions {
  /** When provided together with `repositoryId`, enables the annotation-target-resolution check against the live graph. */
  store?: GraphStore;
  repositoryId?: number;
}

/**
 * Runs every deterministic check the brief lists (§H) against one
 * proposed patch: staleness/applicability, Markdown structure, code
 * fence integrity, annotation well-formedness, broken links, invalid
 * anchors, accidental deletion, and (when a graph is available)
 * annotation target resolution. Never executes anything from the patch
 * or the repository — every check here is static analysis.
 */
export async function validatePatch(
  patch: ProposedPatch,
  repoRoot: string,
  options: ValidatePatchOptions = {},
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const checksNotPerformed: ValidationCheck[] = [];

  const docContent = await readDocument(repoRoot, patch.documentPath);
  const applicability = checkApplicability(patch, docContent);
  issues.push(...applicability.issues);

  issues.push(...checkStructure(patch.proposedContent));
  issues.push(...checkAccidentalDeletion(patch));

  if (applicability.located && docContent !== null) {
    const resultingDocument = assembleResultingDocument(docContent, patch, applicability.located);
    issues.push(...(await checkLinksAndAnchors(resultingDocument, patch, repoRoot)));
  } else {
    checksNotPerformed.push('broken-link', 'invalid-anchor');
  }

  if (options.store && options.repositoryId !== undefined) {
    issues.push(...checkAnnotationTargets(patch.proposedContent, options.store, options.repositoryId));
  } else {
    checksNotPerformed.push('annotation-target-resolution');
  }

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
    checksNotPerformed,
  };
}
