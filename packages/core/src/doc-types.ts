/**
 * Types produced by the Markdown parser (Milestone 2).
 */

import type { SourceLocation } from './code-types.js';

export interface MarkdownHeading {
  depth: number;
  text: string;
  /** GitHub-compatible anchor slug, e.g. "refresh-tokens". */
  slug: string;
  location: SourceLocation;
}

/**
 * The span of content owned by one heading, up to (but not including) the
 * next heading of equal or shallower depth. The section before the first
 * heading has `heading: null`.
 */
export interface MarkdownSection {
  heading: MarkdownHeading | null;
  location: SourceLocation;
  /** Raw markdown text for this section's range, for patch generation (Milestone 7). */
  content: string;
}

export interface MarkdownLink {
  text: string;
  target: string;
  isExternal: boolean;
  location: SourceLocation;
}

export interface MarkdownCodeFence {
  language: string | null;
  content: string;
  location: SourceLocation;
}

export type SymbolReferenceKind = 'symbol-like' | 'file-path';

/**
 * An inline code span (`` `like this` ``) that looks like it refers to a
 * code symbol or file path. Heuristic — not a resolved relationship.
 */
export interface SymbolReference {
  raw: string;
  kind: SymbolReferenceKind;
  location: SourceLocation;
}

/**
 * An explicit `<!-- tracedocs:documents <target> -->` annotation. Only
 * syntactic well-formedness is checked here; whether `target` actually
 * resolves to a real code symbol is decided later against the graph
 * (Milestone 3/6).
 */
export interface TraceDocsAnnotation {
  directive: string;
  target: string;
  location: SourceLocation;
  wellFormed: boolean;
  issues: string[];
}

export interface ParsedMarkdownDocument {
  repoRelativePath: string;
  headings: MarkdownHeading[];
  sections: MarkdownSection[];
  links: MarkdownLink[];
  codeFences: MarkdownCodeFence[];
  symbolReferences: SymbolReference[];
  annotations: TraceDocsAnnotation[];
}
