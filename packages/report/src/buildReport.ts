import type {
  Certainty,
  ChangeSet,
  ImpactAction,
  ImpactFinding,
  Report,
  ReportProposedPatchEntry,
  UnresolvedItems,
} from '@tracedocs/core';

export interface BuildReportInput {
  changeSet: ChangeSet;
  findings: ImpactFinding[];
  unresolved: UnresolvedItems;
  /** Omit entirely (or pass `[]`) when patch generation wasn't requested — never fabricated to fill the section. */
  proposedPatches?: ReportProposedPatchEntry[];
}

/**
 * Assembles a `Report` from the outputs of the earlier pipeline stages.
 * Pure data assembly — no I/O, no git, no graph access — so it's testable
 * with plain literal inputs.
 */
export function buildReport(input: BuildReportInput): Report {
  const proposedPatches = input.proposedPatches ?? [];

  const findingsByAction: Partial<Record<ImpactAction, number>> = {};
  const findingsByCertainty: Partial<Record<Certainty, number>> = {};
  for (const finding of input.findings) {
    findingsByAction[finding.action] = (findingsByAction[finding.action] ?? 0) + 1;
    findingsByCertainty[finding.certainty] = (findingsByCertainty[finding.certainty] ?? 0) + 1;
  }

  return {
    repositoryRoot: input.changeSet.repositoryRoot,
    baseRevision: input.changeSet.baseRevision,
    targetRevision: input.changeSet.targetRevision,
    generatedAt: new Date().toISOString(),
    fileChanges: input.changeSet.fileChanges,
    symbolChanges: input.changeSet.symbolChanges,
    findings: input.findings,
    unresolved: input.unresolved,
    proposedPatches,
    summary: {
      filesChanged: input.changeSet.fileChanges.length,
      symbolsChanged: input.changeSet.symbolChanges.length,
      findingsByAction,
      findingsByCertainty,
    },
  };
}
