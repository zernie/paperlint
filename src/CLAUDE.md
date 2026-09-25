# CLAUDE.md — `src/`

The package's TypeScript: the CLI, the build, the toolchain installer, and the measuring that feeds
the facts file. Loaded when working under `src/`; the repository-wide rules are in the root
`CLAUDE.md`.

**`src/` is hexagonal on two axes, and the linter enforces both** (`eslint.config.mjs`; fixtures in
`test/fixtures/layers/`, run by `test/eslint-layers.test.ts`; issue #76).

**Axis A — knowledge. Core means the DOMAIN, not "no I/O".** A file belongs to an adapter when it
exists because of one external program or format: _if banal / pdf.js / TeX Live / ESLint / Claude
Code disappeared tomorrow, which files would change? Those are its adapter, wherever they sit
today._ The domain is what would not change if every one of them were swapped. Purity is not the
test — a parser for banal's JSON is pure and is still banal's.

| element   | where                  | holds                                                                                                                                                              | may import                                                                                                              |
| --------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `domain`  | `src/domain/`          | values and decisions in the paper's vocabulary                                                                                                                     | `domain`; `ts-essentials`, `node:path`, `node:crypto`                                                                   |
| `port`    | `src/ports/`           | interfaces **shaped by what the inside needs**, never by what a tool does (Graça: "created to fit the Application Core needs and not simply mimic the tools APIs") | `domain`, `port`; the same three externals                                                                              |
| `app`     | `src/*.ts`             | use cases over ports; **no I/O defaults** — a use case without its deps does not compile                                                                           | `domain`, `port`, `app`, the package's `.mjs`; Node's `util`/`url`/`module`                                             |
| `adapter` | `src/adapters/<tool>/` | everything that knows `<tool>` exists, pure parsers included; used through its `index.ts`                                                                          | `domain`, `port`, its own folder, its tool's packages, the package's `.mjs`. **Never** `app`, **never** another adapter |
| `root`    | `src/cli.ts`           | reads `process.*`, builds adapters, wires ports                                                                                                                    | anything                                                                                                                |

Folders are ELEMENTS of `eslint-plugin-boundaries`, single files are CATEGORIES (`root`, `app`,
`test`, `io`): v7 matches element patterns as folders. Everyone — tests included — reaches an
adapter through its `index.ts`; the files inside one adapter import each other freely.

**Axis B — purity.** An effect (disk, process, network, env, clock, TTY) may be written only in
`src/adapters/<tool>/<x>.io.ts` and `src/cli.ts`. Every other file, adapters' parsers included,
takes a port. Test: _can a call here fail for a reason not in its arguments?_ Imports are checked
through the `io` file category in `boundaries/dependencies`; the `process` and `fetch` globals by
`no-restricted-globals`.

**The legacy app files are held by a ratchet, not exempted.** A site that still breaks either axis
carries `// eslint-disable-next-line <rule> -- legacy <I/O|layer>, moves behind a port in #76`.
Unused directives are errors (`reportUnusedDisableDirectives`), so a fixed site must drop its
comment; the per-file counts are frozen in `scripts/layer-legacy.frozen.json` and checked by
`scripts/layer-legacy-frozen.mjs` (`npm run check`, CI), which counts ESLint's own
`suppressedMessages` and fails when a file's count grows, a file not in the list carries one, or
anything under `src/domain/`, `src/ports/` or `src/adapters/` does. A NEW module that needs the
world is a new `*.io.ts` in the adapter of the program it talks to — never a new directive.

Parse at the boundary, into types that cannot hold an invalid state (a banal path that exists only
after its sha256 and probe passed; a `Ready` only an installer mints; an outcome as a discriminated
union, not a string); the inside never re-validates.

⚠️ **Two settings are load-bearing.** `boundaries/root-path`: without it the plugin matches paths
against `process.cwd()`, so lint started from any other directory classifies nothing and passes.
`checkAllOrigins: true`: without it no `module:` policy is evaluated, so axis B and the library bans
report nothing — dropping it turns the fixtures `src/domain/reads-disk.ts` and
`src/adapters/one/disk.ts` clean (measured).
