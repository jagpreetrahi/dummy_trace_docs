import type { Html, Root } from 'mdast';
import { visit } from 'unist-util-visit';
import type { TraceDocsAnnotation } from '@tracedocs/core';
import { toLocationFromPosition } from './location.js';

const ANNOTATION_PATTERN = /<!--\s*tracedocs:(\S+)\s+(.*?)\s*-->/;
const KNOWN_DIRECTIVES = new Set(['documents']);

/**
 * Parses explicit `<!-- tracedocs:documents <target> -->` maintainer
 * annotations. Only syntactic well-formedness is checked here — whether
 * `target` resolves to a real code symbol is decided against the
 * dependency graph later (Milestone 3/6).
 */
export function extractAnnotations(root: Root): TraceDocsAnnotation[] {
  const annotations: TraceDocsAnnotation[] = [];

  visit(root, 'html', (node: Html) => {
    const match = ANNOTATION_PATTERN.exec(node.value);
    if (!match) return;

    const directive = match[1] ?? '';
    const target = match[2] ?? '';
    const issues: string[] = [];

    if (!KNOWN_DIRECTIVES.has(directive)) {
      issues.push(`Unknown tracedocs directive "${directive}"`);
    }
    if (!target) {
      issues.push('Annotation is missing a target');
    }

    annotations.push({
      directive,
      target,
      location: toLocationFromPosition(node.position),
      wellFormed: issues.length === 0,
      issues,
    });
  });

  return annotations;
}
