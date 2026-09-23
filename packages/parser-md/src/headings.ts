import GithubSlugger from 'github-slugger';
import { toString as mdastToString } from 'mdast-util-to-string';
import type { Heading, Root } from 'mdast';
import type { MarkdownHeading } from '@tracedocs/core';
import { toLocationFromPosition } from './location.js';

export interface HeadingEntry {
  node: Heading;
  heading: MarkdownHeading;
}

/**
 * Only considers headings that are direct children of the document root
 * (standard ATX/Setext headings). Headings nested inside blockquotes or
 * list items are not modeled in Milestone 2.
 */
export function extractHeadings(root: Root): HeadingEntry[] {
  const slugger = new GithubSlugger();
  const entries: HeadingEntry[] = [];

  for (const child of root.children) {
    if (child.type !== 'heading') continue;
    const text = mdastToString(child);
    entries.push({
      node: child,
      heading: {
        depth: child.depth,
        text,
        slug: slugger.slug(text),
        location: toLocationFromPosition(child.position),
      },
    });
  }

  return entries;
}
