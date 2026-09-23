import type { FileChange, Report, SymbolChange } from '@tracedocs/core';

function renderFileChangeRow(change: FileChange): string {
  const label = change.changeType === 'renamed' ? `${change.previousPath} → ${change.path}` : change.path;
  return `| ${change.changeType} | ${label} |`;
}

function renderSymbolChangeRow(change: SymbolChange): string {
  const label = change.changeType === 'moved' ? `${change.previousFilePath} → ${change.filePath}` : change.filePath;
  return `| ${change.changeType} | \`${change.name}\` (${change.kind}) | ${label} |`;
}

function renderFindingSection(finding: Report['findings'][number]): string {
  const location = finding.sectionHeading ?? '(whole page)';
  const lines = [
    `### [${finding.action}] ${finding.documentPath} — ${location}`,
    '',
    `- **Certainty:** ${finding.certainty}`,
    `- **Related:** \`${finding.relatedSymbolName}\` (${finding.relatedChangeType})`,
    `- **Why:** ${finding.explanation}`,
  ];
  if (finding.graphPath.length > 0) {
    lines.push(`- **Evidence path:** ${finding.graphPath.map((step) => step.nodeName).join(' → ')}`);
  }
  return lines.join('\n');
}

function renderPatchSection(entry: Report['proposedPatches'][number]): string {
  const location = entry.finding.sectionHeading ?? '(whole page)';
  const lines = [`### ${entry.finding.documentPath} — ${location}`, ''];

  if (entry.result.status !== 'PROPOSED') {
    lines.push(`- **Status:** ${entry.result.status}`, `- **Reason:** ${entry.result.reason}`);
    return lines.join('\n');
  }

  lines.push(
    '- **Status:** PROPOSED',
    `- **Explanation:** ${entry.result.patch.explanation}`,
    `- **Validation:** ${entry.validation ? (entry.validation.valid ? 'valid' : 'INVALID') : 'not run'}`,
  );
  if (entry.validation) {
    for (const issue of entry.validation.issues) {
      lines.push(`  - [${issue.severity}] ${issue.check}: ${issue.message}`);
    }
  }
  lines.push('', '```diff', `- ${entry.result.patch.originalContent.split('\n').join('\n- ')}`, `+ ${entry.result.patch.proposedContent.split('\n').join('\n+ ')}`, '```');
  return lines.join('\n');
}

/**
 * Renders a readable, section-by-section Markdown report suitable for a
 * GitHub Actions job summary (`$GITHUB_STEP_SUMMARY`) or a PR comment.
 * Confirmed changes (git + parsing) and inferred relationships (graph-
 * based findings) are kept in visually distinct sections, never merged —
 * the heading on the findings section says outright that evidence isn't
 * proof (brief §I/§H).
 */
export function renderMarkdown(report: Report): string {
  const sections: string[] = [];

  sections.push(
    [
      '# TraceDocs Report',
      '',
      `**Repository:** ${report.repositoryRoot}`,
      `**Base revision:** \`${report.baseRevision}\``,
      `**Target revision:** ${report.targetRevision ? `\`${report.targetRevision}\`` : '(working tree)'}`,
      `**Generated:** ${report.generatedAt}`,
    ].join('\n'),
  );

  sections.push(
    [
      '## Summary',
      '',
      `- Files changed: ${report.summary.filesChanged}`,
      `- Symbols changed: ${report.summary.symbolsChanged}`,
      `- Documentation findings: ${report.findings.length}${
        report.findings.length > 0
          ? ` (${Object.entries(report.summary.findingsByAction)
              .map(([action, count]) => `${action}: ${count}`)
              .join(', ')})`
          : ''
      }`,
    ].join('\n'),
  );

  if (report.fileChanges.length > 0) {
    sections.push(
      [
        '## Changed files _(confirmed — from git)_',
        '',
        '| Change | Path |',
        '|---|---|',
        ...report.fileChanges.map(renderFileChangeRow),
      ].join('\n'),
    );
  }

  if (report.symbolChanges.length > 0) {
    sections.push(
      [
        '## Changed symbols _(confirmed — from static parsing)_',
        '',
        '| Change | Symbol | File |',
        '|---|---|---|',
        ...report.symbolChanges.map(renderSymbolChangeRow),
      ].join('\n'),
    );
  }

  if (report.findings.length > 0) {
    sections.push(
      [
        '## Documentation impact _(evidence-based, not proof of correctness — see each finding\'s evidence)_',
        ...report.findings.map(renderFindingSection),
      ].join('\n\n'),
    );
  } else {
    sections.push('## Documentation impact\n\nNo documentation impact found for this change.');
  }

  if (report.proposedPatches.length > 0) {
    sections.push(
      ['## Proposed patches _(AI-generated — review before applying)_', ...report.proposedPatches.map(renderPatchSection)].join(
        '\n\n',
      ),
    );
  }

  const hasUnresolved =
    report.unresolved.imports.length > 0 ||
    report.unresolved.annotations.length > 0 ||
    report.unresolved.danglingReferences.length > 0;

  if (hasUnresolved) {
    const lines = ['## Unresolved _(could not be determined by this analysis)_', ''];
    for (const item of report.unresolved.imports) {
      lines.push(`- Unresolved import in \`${item.filePath}\`: \`${item.specifier}\``);
    }
    for (const item of report.unresolved.annotations) {
      lines.push(`- Unresolved annotation in \`${item.filePath}\`: \`${item.target}\` — ${item.reason}`);
    }
    for (const item of report.unresolved.danglingReferences) {
      lines.push(
        `- Dangling ${item.edgeType} reference: \`${item.sourceStableId}\` → \`${item.targetStableId}\` (target no longer exists)`,
      );
    }
    sections.push(lines.join('\n'));
  }

  return `${sections.join('\n\n')}\n`;
}
