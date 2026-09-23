import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ProposedPatch, ValidationIssue } from '@tracedocs/core';
import { parseMarkdownDocument } from '@tracedocs/parser-md';
import { resolveSafePath } from './safePath.js';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks only the links *introduced or kept in the proposed content* —
 * a pre-existing broken link elsewhere in the document isn't something
 * this patch caused, so it isn't this patch's problem to report.
 * Anchor-only links (`#slug`) are checked against every heading in the
 * *resulting* full document (the current document with this patch
 * spliced in), not just the patch's own text — a link to another
 * section of the same doc is legitimate and shouldn't be flagged just
 * because that section isn't part of the patch. Both are `warning`
 * severity: worth a human's attention, not a reason to block applying.
 */
export async function checkLinksAndAnchors(
  resultingDocument: string,
  patch: ProposedPatch,
  repoRoot: string,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const fullParsed = parseMarkdownDocument(patch.documentPath, resultingDocument);
  const knownSlugs = new Set(fullParsed.headings.map((heading) => heading.slug));

  const proposedParsed = parseMarkdownDocument(patch.documentPath, patch.proposedContent);
  const docDir = dirname(patch.documentPath);

  for (const link of proposedParsed.links) {
    if (link.isExternal) continue;

    if (link.target.startsWith('#')) {
      const slug = link.target.slice(1);
      if (!knownSlugs.has(slug)) {
        issues.push({
          check: 'invalid-anchor',
          severity: 'warning',
          message: `Link "${link.text}" points at anchor "#${slug}", which doesn't match any heading in ${patch.documentPath}.`,
        });
      }
      continue;
    }

    const [pathPart] = link.target.split('#');
    if (!pathPart) continue;

    const relativeToRoot = join(docDir, pathPart);
    const safeTarget = resolveSafePath(repoRoot, relativeToRoot);
    if (!safeTarget) {
      issues.push({
        check: 'broken-link',
        severity: 'warning',
        message: `Link "${link.text}" points at "${link.target}", which resolves outside the repository.`,
      });
      continue;
    }

    if (!(await fileExists(safeTarget))) {
      issues.push({
        check: 'broken-link',
        severity: 'warning',
        message: `Link "${link.text}" points at "${link.target}", which does not exist relative to ${patch.documentPath}.`,
      });
    }
  }

  return issues;
}
