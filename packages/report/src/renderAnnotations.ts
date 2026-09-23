import type { Report } from '@tracedocs/core';

/** Workflow commands treat these characters specially and must be percent-escaped in the message text. */
function escapeMessage(text: string): string {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(text: string): string {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/,/g, '%2C').replace(/:/g, '%3A');
}

/**
 * Renders GitHub Actions workflow commands (`::warning file=...,line=...::message`).
 * GitHub turns these into inline annotations on the PR's "Files changed"
 * tab automatically, for the run that printed them — no `pull-requests:
 * write` permission needed, unlike posting a PR comment (brief §J: "the
 * initial implementation should not require write permissions").
 * `HIGH`-certainty findings become `warning`; everything else becomes the
 * quieter `notice`, since a lower-certainty finding is explicitly weaker
 * evidence and shouldn't visually compete with a strong one.
 */
export function renderAnnotations(report: Report): string {
  const lines: string[] = [];

  for (const finding of report.findings) {
    const level = finding.certainty === 'HIGH' ? 'warning' : 'notice';
    const properties = [`file=${escapeProperty(finding.documentPath)}`];
    if (finding.sectionLocation) {
      properties.push(`line=${finding.sectionLocation.startLine}`);
      if (finding.sectionLocation.endLine !== finding.sectionLocation.startLine) {
        properties.push(`endLine=${finding.sectionLocation.endLine}`);
      }
    }
    const title = `TraceDocs: ${finding.action} (${finding.certainty})`;
    properties.push(`title=${escapeProperty(title)}`);

    lines.push(`::${level} ${properties.join(',')}::${escapeMessage(finding.explanation)}`);
  }

  return lines.join('\n');
}
