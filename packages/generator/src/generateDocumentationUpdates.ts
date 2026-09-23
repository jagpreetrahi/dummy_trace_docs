import type { ChangeSet, DocumentationProvider, GenerationResult, ImpactFinding } from '@tracedocs/core';
import { buildGeneratorContext } from './buildContext.js';

export interface PatchGenerationOutcome {
  finding: ImpactFinding;
  result: GenerationResult;
}

/**
 * Attempts patch generation only for findings the deterministic impact
 * analyzer already flagged as `REVIEW` on a `modified` symbol (brief §F:
 * "do not make the LLM the sole source of truth" applies at the routing
 * level too — we don't even ask the provider about weak or already-being-
 * addressed findings):
 * - `NEEDS_MORE_INFORMATION` findings are skipped: the affected doc was
 *   already touched in this same diff, so a generated patch could easily
 *   be redundant or wrong about what's still outstanding.
 * - `removed`/`moved` findings are skipped: see `buildGeneratorContext`
 *   for why patch generation isn't attempted for those yet.
 *
 * Every finding that *is* attempted gets an outcome — including a
 * `PROVIDER_UNAVAILABLE` one when context assembly itself fails (e.g. the
 * doc file is no longer readable) — never silently dropped.
 */
export async function generateDocumentationUpdates(
  findings: ImpactFinding[],
  changeSet: ChangeSet,
  provider: DocumentationProvider,
): Promise<PatchGenerationOutcome[]> {
  const outcomes: PatchGenerationOutcome[] = [];

  for (const finding of findings) {
    if (finding.action !== 'REVIEW' || finding.relatedChangeType !== 'modified') continue;

    const context = await buildGeneratorContext(finding, changeSet);
    if (!context) {
      outcomes.push({
        finding,
        result: {
          status: 'PROVIDER_UNAVAILABLE',
          reason:
            'Could not assemble enough context to attempt generation (matching source or documentation content was not readable).',
        },
      });
      continue;
    }

    outcomes.push({ finding, result: await provider.generatePatch(context) });
  }

  return outcomes;
}
