import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Root } from 'mdast';
import type { ParsedMarkdownDocument } from '@tracedocs/core';
import { extractAnnotations } from './annotations.js';
import { extractCodeFences } from './codeFences.js';
import { extractHeadings } from './headings.js';
import { extractLinks } from './links.js';
import { buildSections } from './sections.js';
import { extractSymbolReferences } from './symbolReferences.js';

const processor = unified().use(remarkParse).use(remarkGfm);

export function parseMarkdownDocument(
  repoRelativePath: string,
  sourceText: string,
): ParsedMarkdownDocument {
  const root = processor.parse(sourceText) as Root;
  const headingEntries = extractHeadings(root);

  return {
    repoRelativePath,
    headings: headingEntries.map((entry) => entry.heading),
    sections: buildSections(root, sourceText, headingEntries),
    links: extractLinks(root),
    codeFences: extractCodeFences(root),
    symbolReferences: extractSymbolReferences(root),
    annotations: extractAnnotations(root),
  };
}
