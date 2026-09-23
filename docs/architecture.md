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
├── parser-ts/        JS/TS symbol extraction (Milestone 2)
├── parser-md/        Markdown section/annotation extraction (Milestone 2)
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

**Not yet implemented:** everything from Milestone 2 onward (parsing,
graph, change analysis, impact analysis, generation, validation, UI, GitHub
Action). See the milestone list in the project brief for sequencing.
