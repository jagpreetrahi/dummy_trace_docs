import { writeFile } from 'node:fs/promises';
import type { ProposedPatch, ValidationResult } from '@tracedocs/core';
import { assembleResultingDocument, locateSection } from './locateSection.js';
import { readDocument, resolveSafePath } from './safePath.js';
import { validatePatch, type ValidatePatchOptions } from './validatePatch.js';

export interface ApplyPatchResult {
  applied: boolean;
  validation: ValidationResult;
}

/**
 * Applies a patch to disk — but only after re-validating it, right here,
 * immediately before writing. This is deliberate, not redundant with a
 * validation the caller may have already run: the whole point of the
 * staleness check is that the file can change between "review" and
 * "apply," and the brief is explicit that the check has to happen right
 * before the write, not just at review time. A patch with any
 * `error`-severity issue (stale content, unparseable proposal, ...) is
 * never written — `applied: false`, with the validation result explaining
 * why, so the caller can show that to the user instead of silently no-op'ing.
 */
export async function applyPatch(
  patch: ProposedPatch,
  repoRoot: string,
  options: ValidatePatchOptions = {},
): Promise<ApplyPatchResult> {
  const validation = await validatePatch(patch, repoRoot, options);
  if (!validation.valid) {
    return { applied: false, validation };
  }

  const target = resolveSafePath(repoRoot, patch.documentPath);
  const docContent = target ? await readDocument(repoRoot, patch.documentPath) : null;
  const located = docContent !== null ? locateSection(docContent, patch.sectionHeading) : null;

  // Validation passed, so these should always succeed — but never write
  // blind if something about the environment changed underneath us.
  if (!target || docContent === null || !located) {
    return { applied: false, validation };
  }

  const resultingDocument = assembleResultingDocument(docContent, patch, located);
  await writeFile(target, resultingDocument, 'utf-8');
  return { applied: true, validation };
}
