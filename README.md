# TraceDocs

A documentation intelligence and synchronization system: it builds a
dependency graph between source code and documentation, detects when a code
change may have made documentation stale, and proposes reviewable,
evidence-backed fixes. It never auto-merges generated documentation.

See [`docs/architecture.md`](docs/architecture.md) for the system design and
current implementation status, and
[`docs/lessons-learned.md`](docs/lessons-learned.md) for real bugs found
along the way (and how), plus the key decisions behind the current design.

## Status

Early, incremental build. **Implemented so far: Milestone 1 (repository
scanning), Milestone 2 (JS/TS + Markdown parsing), Milestone 3 (the
persistent dependency graph), Milestone 4 (an HTTP API and a React graph
explorer over it), Milestone 5 (git change analysis), Milestone 6
(documentation impact analysis), and Milestone 7 (documentation patch
generation).** Validation/patch application and GitHub integration are
not built yet.

## Requirements

- Node.js >= 22.5.0 (the graph package uses the built-in `node:sqlite`
  module, which needs 22.5+)
- pnpm (`corepack enable` or `npm i -g pnpm`)
- git

## Setup

```sh
pnpm install
pnpm run build
pnpm test
```

## Usage (current)

Index a repository — discovers `.ts/.tsx/.js/.jsx/.md/.mdx` files (respecting
`.gitignore`), parses them, and builds/updates a persistent dependency graph:

```sh
node packages/cli/dist/index.js index <path-to-repo>
node packages/cli/dist/index.js graph <path-to-repo>   # print node/edge counts by type
```

This writes `.tracedocs/graph.db` (SQLite) inside the scanned repository.
Re-running `index` only reprocesses files that changed since the last run —
an unchanged repository produces no new nodes or edges. That directory is
safe to delete — it will be rebuilt from scratch on the next `index` run.

### Graph explorer (API + web UI)

In one terminal, start the API server (defaults to `.tracedocs/server.db`
in the current directory; override with `TRACEDOCS_DB`, and the port with
`PORT`, default 4000):

```sh
pnpm --filter @tracedocs/server run dev
```

In another terminal, start the web app:

```sh
pnpm --filter @tracedocs/web run dev
```

Open the printed URL (default `http://localhost:5173`). From there you can
index a repository by path directly in the UI (this indexes it into the
*server's* database, separately from any `.tracedocs/graph.db` you created
via the CLI — see `docs/architecture.md` for why), then explore it: search,
click nodes, expand neighbors, filter by type, and highlight the path
between two nodes.

### Analyzing what changed

Compare an arbitrary base revision against another revision, or against
the current working tree (uncommitted changes) by omitting `--target`:

```sh
node packages/cli/dist/index.js analyze <path-to-repo> --base <revision> [--target <revision>]
```

Reports added/modified/deleted/renamed files and, for JS/TS files, which
functions/classes/methods were added, removed, modified, or moved to a
different file. Renames and moves are only reliably detected when the
relevant side is committed (or staged) — see `docs/architecture.md` for
why an uncommitted rename can't be told apart from an unrelated delete+add.

### Finding documentation that might be affected by a change

```sh
node packages/cli/dist/index.js impact <path-to-repo> --base <revision>
```

Compares `--base` against the current working tree and reports
documentation that may need a look — a doc that explicitly annotates a
symbol that was modified, or a doc pointing at a symbol that was deleted
or moved elsewhere, with the graph relationship and reasoning behind each
finding. Uses only graph-based rules (no AI involved yet) and stays silent
for anything with no discoverable relationship, rather than flagging
everything a file touched. For the most reliable results on deleted/moved
symbols, index the repository once at `--base` before making changes (see
`docs/architecture.md` for why); findings for modified symbols don't
depend on this.

### Generating a proposed documentation patch

```sh
node packages/cli/dist/index.js generate <path-to-repo> --base <revision> [--provider mock|anthropic]
```

Runs impact analysis, then attempts to generate a concrete patch for each
`REVIEW`-level finding on a *modified* symbol (deleted/moved symbols and
findings already downgraded to `NEEDS_MORE_INFORMATION` are skipped — see
`docs/architecture.md`). Defaults to a fully offline mock provider, so
this works with no API key and no network access; pass `--provider
anthropic` for real generation, which needs an Anthropic API key
available the way the SDK normally resolves one (`ANTHROPIC_API_KEY`, or
`ant auth login`). Every outcome is printed, including
`NEEDS_MORE_INFORMATION` and `PROVIDER_UNAVAILABLE` ones — nothing is
silently skipped. Never writes to disk; that's Milestone 8.

## Development

```sh
pnpm test          # run all tests once
pnpm run test:watch
pnpm run lint
pnpm run typecheck # builds project references and reports type errors
```

## Packages

| Package | Purpose |
|---|---|
| `@tracedocs/core` | Shared types |
| `@tracedocs/scanner` | Repository discovery, git revision, content hashing |
| `@tracedocs/parser-ts` | JS/TS symbol, import/export, call, and JSDoc extraction |
| `@tracedocs/parser-md` | Markdown heading/section/link/annotation extraction |
| `@tracedocs/graph` | SQLite-backed dependency graph: schema, migrations, storage, traversal |
| `@tracedocs/indexer` | Wires the scanner and both parsers into the graph |
| `@tracedocs/server` | Fastify HTTP API over the graph |
| `@tracedocs/web` | React/Vite/Cytoscape.js graph explorer |
| `@tracedocs/change-analyzer` | Git-revision comparison and symbol-level change detection |
| `@tracedocs/impact-analyzer` | Graph-based documentation impact findings for a change set |
| `@tracedocs/generator` | LLM provider abstraction + patch generation (mock + Anthropic adapters) |
| `@tracedocs/cli` | `tracedocs` command line entry point |

More packages (`validator`) are added as their milestones land.
