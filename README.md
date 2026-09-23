# TraceDocs

A documentation intelligence and synchronization system: it builds a
dependency graph between source code and documentation, detects when a code
change may have made documentation stale, and proposes reviewable,
evidence-backed fixes. It never auto-merges generated documentation.

See [`docs/architecture.md`](docs/architecture.md) for the system design and
current implementation status.

## Status

Early, incremental build. **Implemented so far: Milestone 1 (repository
scanning), Milestone 2 (JS/TS + Markdown parsing), and Milestone 3 (the
persistent dependency graph).** Change analysis against arbitrary git
revisions, impact analysis, generation, validation, the graph explorer UI,
and GitHub integration are not built yet.

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
| `@tracedocs/cli` | `tracedocs` command line entry point |

More packages (`change-analyzer`, `impact-analyzer`, `generator`,
`validator`, `server`, `web`) are added as their milestones land.
