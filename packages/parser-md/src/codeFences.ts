import type { Code, Root } from 'mdast';
import { visit } from 'unist-util-visit';
import type { MarkdownCodeFence } from '@tracedocs/core';
import { toLocationFromPosition } from './location.js';

export function extractCodeFences(root: Root): MarkdownCodeFence[] {
  const fences: MarkdownCodeFence[] = [];

  visit(root, 'code', (node: Code) => {
    fences.push({
      language: node.lang ?? null,
      content: node.value,
      location: toLocationFromPosition(node.position),
    });
  });

  return fences;
}
