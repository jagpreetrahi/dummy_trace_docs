import type ts from 'typescript';
import type {
  CallReferenceInfo,
  CodeSymbol,
  ExportDeclarationInfo,
  ImportDeclarationInfo,
  UnsupportedConstruct,
} from '@tracedocs/core';

export interface WalkContext {
  sourceFile: ts.SourceFile;
  repoRelativePath: string;
  symbols: CodeSymbol[];
  imports: ImportDeclarationInfo[];
  exports: ExportDeclarationInfo[];
  calls: CallReferenceInfo[];
  unsupportedConstructs: UnsupportedConstruct[];
}

/** Identifies the class a method/property belongs to, for qualified names and parent links. */
export interface ClassContext {
  id: string;
  name: string;
}
