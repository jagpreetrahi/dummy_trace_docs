# TraceDocs Architecture

## What this is

TraceDocs builds a dependency graph between source code and documentation, then
uses it to answer one question when code changes: *what documentation might
now be wrong, and why?* It is not a documentation generator — it proposes
evidence-backed, human-reviewed updates only where a real relationship exists.

## Monorepo layout

pnpm workspace, one package per pipeline stage so each is independently
testable and swappable:

```
packages/
├── core/            shared types (no runtime dependencies)
├── scanner/          repository discovery, git revision, hashing (Milestone 1 — done)
├── parser-ts/        JS/TS symbol extraction (Milestone 2 — done)
├── parser-md/        Markdown section/annotation extraction (Milestone 2 — done)
├── graph/            SQLite-backed dependency graph + migrations (Milestone 3)
├── change-analyzer/  git diff -> structured change set (Milestone 5)
├── impact-analyzer/  graph-based documentation impact rules (Milestone 6)
├── generator/        LLM provider abstraction + patch generation (Milestone 7)
├── validator/         Markdown/patch validation (Milestone 8)
├── cli/              `tracedocs` command line entry point
├── server/           Fastify API (Milestone 4)
└── web/              React/Vite graph explorer (Milestone 4)
```

Dependencies flow one way: `core` has no dependencies; every other package may
depend on `core` and on packages strictly earlier in the pipeline. This keeps
the graph engine, for instance, ignorant of the LLM provider, and the parser
ignorant of the CLI.

## Pipeline

```
scan -> parse -> build graph -> diff revisions -> impact analysis
     -> (optional) generate patch -> validate -> report / review / apply
```

Each arrow is a package boundary. A stage never reaches past its neighbors —
the impact analyzer consults the graph, not raw source files; the generator
receives a bounded context object, not the whole repository.

## Key decisions made in Milestone 1

- **Package manager: pnpm workspaces.** Chosen over npm/yarn workspaces for
  fast, disk-efficient installs and because `workspace:*` protocol makes
  internal package versioning explicit.
- **TypeScript module resolution: `Bundler`.** `NodeNext` was tried first
  (matching Node's native ESM resolution most strictly) but several
  CommonJS dependencies (e.g. `ignore`) ship `.d.ts` files that don't
  round-trip cleanly through `NodeNext`'s stricter ESM/CJS boundary
  checking. `Bundler` resolution (paired with `module: ESNext`) is what
  `vitest` and `tsx` already use internally, so switching avoids a
  dev-time/build-time resolution mismatch. Runtime output still respects
  Node's real module system: every package sets `"type": "module"` and
  relative imports keep explicit `.js` extensions.
- **Project references + `tsc -b` for building.** Packages depend on each
  other's compiled output (`dist/`), so the root `tsconfig.json` lists all
  packages as references and `pnpm run build` / `pnpm run typecheck` both
  run `tsc -b`, which builds them in dependency order and skips
  already-up-to-date packages on incremental runs.
- **No database yet.** Milestone 1 only needs to detect "did this file
  change since the last run," which a flat `.tracedocs/manifest.json` (path
  → content hash) answers without a real DB. SQLite is introduced in
  Milestone 3 once there's an actual graph to persist.
- **Git access via `simple-git`.** Chosen over hand-rolled `execFile git`
  calls for readable async APIs; it shells out to the system `git` binary
  under the hood, same as the raw approach would.

## Key decisions made in Milestone 2

- **TypeScript Compiler API instead of tree-sitter for JS/TS.** The brief
  suggests tree-sitter; `parser-ts` uses `typescript`'s own parser instead.
  Reasons: (1) tree-sitter's Node bindings are native modules requiring
  `node-gyp`/a C toolchain — a real risk flagged in Milestone 0, especially
  on Windows; the TS Compiler API is pure JS/TS with no native build step;
  (2) it's the same parser `tsc` itself uses, so JSDoc, export semantics,
  and modifier flags (`export`, `default`, `static`) are read authoritatively
  rather than re-derived from generic syntax nodes. The tradeoff: `parser-ts`
  is JS/TS-specific and cannot be reused for Python/Go. Tree-sitter (or
  another dedicated parser) remains the right choice for those, added later
  behind the same `ParsedSourceFile` shape so the graph builder doesn't care
  which parser produced it.
- **Syntactic parsing only, no type checker.** `parseTypeScriptFile` uses
  `ts.createSourceFile` directly rather than building a full `ts.Program`.
  A type checker would let us resolve `import`s and calls to their actual
  declarations, but requires a valid, resolvable `tsconfig.json` for every
  scanned repo and is much slower per file. Cross-file resolution (turning
  raw import specifiers and callee text into real edges) is deferred to the
  graph builder in Milestone 3, which can do it once, project-wide, instead
  of per-file.
- **JSDoc via public APIs only.** `ts.getLeadingCommentRanges` + manual
  `@tag` parsing, instead of the commonly-used but internal `node.jsDoc`
  property, so this doesn't break on a future TypeScript upgrade.
- **Calls are recorded as text, not resolved symbols.** A call's `calleeName`
  is the literal source text of the callee expression (e.g. `authService.refresh`),
  restricted to identifier / `this` / property-access chains — dynamic
  callees (`arr[i]()`, optional chaining, IIFEs) are skipped rather than
  guessed at. Resolving `calleeName` text to an actual symbol id is a graph
  builder concern (Milestone 3), since it requires knowing what a name
  resolves to across imports.
- **Markdown sections are non-overlapping and flat.** Each heading (at any
  depth) owns a contiguous span up to the *next* heading of any depth —
  a `##` subsection is its own section, not nested inside its parent `#`'s
  range. This avoids ambiguity about which section "owns" content when a
  document is later patched, at the cost of not modeling heading hierarchy
  explicitly (a section's parent heading can still be recovered later from
  `depth` if needed).
- **Annotation validation is syntax-only for now.** `<!-- tracedocs:documents
  <target> -->` is checked for a known directive and a non-empty target;
  whether `target` actually resolves to a real symbol requires the graph
  and is deferred to Milestone 3/6.

## Trust boundaries (see brief §12)

- The scanner never executes repository code or documentation content —
  it only reads file bytes to hash them and matches paths against
  `.gitignore`.
- Nothing is sent to a network service during scanning or indexing.
- All filesystem access in the scanner is confined to paths under the
  resolved repository root (`fast-glob`'s `cwd` + relative match results);
  no absolute or `..`-escaping paths are followed.

These hold today because Milestone 1 does no code execution and no network
I/O at all. They become load-bearing once the LLM generator (Milestone 7)
and patch application (Milestone 8) exist, and should be re-verified then.

## Current status

**Milestone 1 (repository scanning) is implemented and tested:**

- `discoverFiles` — `.gitignore`-aware discovery of `.ts/.tsx/.js/.jsx/.md/.mdx`
  files, with `node_modules`, `.git`, `dist`, `build`, `coverage` always
  excluded regardless of `.gitignore` content.
- `getCurrentRevision` — HEAD SHA, or `null` for a non-repo or a repo with
  no commits yet (never throws).
- `scanRepository` — combines discovery + git revision + SHA-256 content
  hashing into a `RepositoryScanResult`.
- `diffAgainstManifest` / `toManifest` — classify files as
  added/modified/removed/unchanged against the previous run's manifest,
  and persist a new one, enabling incremental work later without
  reprocessing unchanged files.
- CLI: `tracedocs index [path]` runs the above and prints a summary.

20 unit/integration tests cover language detection, hashing, `.gitignore`
handling, always-excluded directories, revision detection (including the
no-commits-yet case), and manifest diffing across two scans using real
temporary git repositories.

**Milestone 2 (parsing) is implemented and tested:**

- `@tracedocs/parser-ts` — `parseTypeScriptFile(repoRelativePath, sourceText)`
  extracts: functions (declarations and `const`/`let` arrow/function-expression
  assignments), classes, methods (including constructors, getters/setters,
  and arrow-function class fields), exported symbols (inline `export`
  modifiers, named/`*`/namespace re-exports, `export default`), imports
  (default/named/namespace, aliasing, type-only), statically identifiable
  calls (attributed to their enclosing function/method, or `null` for
  module-level), JSDoc (description + `@tag`s), and source locations.
  Unsupported syntax (computed method names, destructured exports,
  `export =`) is reported in `unsupportedConstructs`, never silently
  dropped or guessed at.
- `@tracedocs/parser-md` — `parseMarkdownDocument(repoRelativePath, sourceText)`
  extracts headings (with GitHub-compatible anchor slugs, including
  duplicate disambiguation), non-overlapping sections with raw content and
  source ranges, links (classified internal vs. external), fenced code
  blocks with language, a heuristic classification of inline code spans as
  symbol-like or file-path-like, and explicit `tracedocs:` annotations with
  syntactic well-formedness checks.
- Both parsers are purely syntactic and read-only: no type checker, no
  cross-file resolution, no network access — they take a string and a path
  and return structured evidence.

31 tests across both packages (functions, classes/methods, imports/exports,
calls including the anonymous-callback and dynamic-callee cases,
headings/sections, links/fences, symbol references, annotations).

**Not yet implemented:** everything from Milestone 3 onward (the persistent
dependency graph, change analysis, impact analysis, generation, validation,
UI, GitHub Action). Not yet handled even within parsing scope: routes and
configuration-declaration extraction (spec section C mentions these, but
they require framework-specific pattern matching and aren't in Milestone
2's task list); interfaces, type aliases, and enums are not extracted as
symbols since they aren't runtime code the graph needs to track relationships
for. See the milestone list in the project brief for sequencing.
