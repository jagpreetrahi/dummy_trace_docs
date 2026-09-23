import { toString as mdastToString } from 'mdast-util-to-string';
import type { Link, Root } from 'mdast';
import { visit } from 'unist-util-visit';
import type { MarkdownLink } from '@tracedocs/core';
import { toLocationFromPosition } from './location.js';

const EXTERNAL_SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*:)?\/\//i;

export function extractLinks(root: Root): MarkdownLink[] {
  const links: MarkdownLink[] = [];

  visit(root, 'link', (node: Link) => {
    const isExternal = EXTERNAL_SCHEME_PATTERN.test(node.url) || node.url.startsWith('mailto:');
    links.push({
      text: mdastToString(node),
      target: node.url,
      isExternal,
      location: toLocationFromPosition(node.position),
    });
  });

  return links;
}
