# CLAUDE.md — `src/`

The package's TypeScript: the CLI, the build, the toolchain installer, and the measuring that feeds
the facts file. Loaded when working under `src/`; the repository-wide rules are in the root
`CLAUDE.md`.

**`src/` is hexagonal, and the linter enforces it** (issue #76). rpp installs TeX Live, runs
pdflatex, downloads and runs banal, reads PDFs and writes the user's settings, so effects are not
one exception any more — they are most of the package, and they are where it breaks.

| layer                   | holds                                                                                    | may import                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/core/`             | pure decisions, parsers, plans; the PORTS (interfaces) it needs                          | `src/core/` only — no `node:fs`, `node:child_process`, `node:os`, network, `process`, `fetch` |
| `src/adapters/`         | the only code that touches disk, processes, network, pdf.js; each implements a core port | `src/core/`, never the app layer                                                              |
| `src/cli.ts` + commands | the composition root: read the environment, build adapters, call the core                | anything                                                                                      |

Parse at the boundary, into types that cannot hold an invalid state (a banal path that exists only
after its sha256 and probe passed; an outcome as a discriminated union, not a string); the core
never re-validates.

Enforced in `eslint.config.mjs`, both at `error`: `no-restricted-imports` + `no-restricted-globals`
ban I/O outside `src/adapters/` and the composition root, and `eslint-plugin-boundaries` forbids
core → adapter, core → app, adapter → app. Files that did I/O before the layers existed carry an
`eslint-disable-next-line … -- legacy I/O, moves behind a port in #76` above each import or use, and
unused disable directives are errors in `src/`: an exemption that no longer suppresses anything
fails lint, and a new one is a visible comment with its reason. A NEW module that needs the outside
world is an adapter, not a new disable.

⚠️ **`boundaries/root-path` is load-bearing.** Without it the plugin matches paths against
`process.cwd()`, so lint started from any other directory classifies nothing and passes.
