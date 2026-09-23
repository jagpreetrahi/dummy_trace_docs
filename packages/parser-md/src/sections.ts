import type { Root, RootContent } from 'mdast';
import type { MarkdownSection } from '@tracedocs/core';
import type { HeadingEntry } from './headings.js';

/**
 * Partitions the document into non-overlapping sections, each owned by one
 * heading and running up to (but not including) the *next* heading of any
 * depth. Content before the first heading forms a section with `heading:
 * null`. This deliberately does not nest subsections inside their parent
 * heading's range — each heading, including nested ones, gets its own
 * contiguous span.
 */
export function buildSections(
  root: Root,
  sourceText: string,
  headingEntries: HeadingEntry[],
): MarkdownSection[] {
  const headingByNode = new Map<RootContent, MarkdownSection['heading']>(
    headingEntries.map((entry) => [entry.node, entry.heading]),
  );
  const children: RootContent[] = root.children;
  const sections: MarkdownSection[] = [];

  let currentHeading: MarkdownSection['heading'] = null;
  let rangeStart = 0;

  const flush = (endExclusive: number): void => {
    if (endExclusive <= rangeStart) return;
    const startChild = children[rangeStart];
    const endChild = children[endExclusive - 1];
    if (!startChild?.position || !endChild?.position) return;

    const startOffset = startChild.position.start.offset ?? 0;
    const endOffset = endChild.position.end.offset ?? sourceText.length;

    sections.push({
      heading: currentHeading,
      location: {
        startLine: startChild.position.start.line,
        startColumn: startChild.position.start.column,
        endLine: endChild.position.end.line,
        endColumn: endChild.position.end.column,
      },
      content: sourceText.slice(startOffset, endOffset),
    });
  };

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]!;
    const heading = headingByNode.get(child);
    if (heading) {
      flush(index);
      currentHeading = heading;
      rangeStart = index;
    }
  }
  flush(children.length);

  return sections;
}
