# How a package finds its own installed files, and its own bin

**Question this file answers:** `scripts/install-e2e.mjs` inspects the tree it just installed by
spelling the layout out — `node_modules/research-paper-pipeline` (line 172),
`node_modules/.bin/rpp` (line 276), and `node_modules/.../plugin/hooks/hooks.json` (line 135).
`contentDelivery()` separately tries THREE candidate base directories for a path written as prose
inside a skill. Both are guesses. What is the supported way, and does using it buy anything?

**Verdict, in two parts, because the two hardcodes are not the same kind of thing:**

1. **The package directory: replace the three spellings with ONE resolved anchor** —
   `dirname(createRequire(pathToFileURL(join(consumer, "__placeholder__.js")).href)
   .resolve("research-paper-pipeline/package.json"))`. Not because the hardcode is currently
   wrong: it is not, under either manager measured. Because resolution additionally *asserts the
   package is reachable by name from the consumer*, which is what the README's documented import
   depends on and which `existsSync` cannot see — demonstrated by a mutation below.
2. **The `.bin` launch: keep it.** `node_modules/.bin/rpp` is not the script guessing where a
   file is; it is the script checking that the manager created the shim, which is a real property
   of the install and the one thing resolution cannot tell you. Read the bin's *real* path from
   the resolved manifest as well, and launch both — they answer different questions.

**Yarn PnP is unaffected by any of this**, and for a harder reason than
[`test-tooling.md`](test-tooling.md) currently records. See § "Correcting the PnP note".

**The doc-relative base (`contentDelivery`): declare it, do not add a fourth candidate.** One of
the three candidates is measurably dead (0 hits of 104). The other two are disjoint by spelling,
so today the ladder hides nothing — but the package already declares this base once, in
`.claude-plugin/plugin.json` (`"skills": "./skills/"`), and the platform exposes
`${CLAUDE_PLUGIN_ROOT}` for exactly this.

Everything below was measured on this machine on 2026-09-19: Node v22.22.2 (CI pins
`node-version: 22`, `.github/workflows/ci.yml`), npm 10.9.7, pnpm 10.33.0, Yarn 4.9.2 via
corepack. Scripts: [`repro/`](repro/README.md), CLAIM 4–6.

---

## 1. The three APIs, and which one this script can use

| API | available on Node 22 | anchored at | our package | `exports`-closed package |
| --- | --- | --- | --- | --- |
| `createRequire(url).resolve("<pkg>/package.json")` | yes, since v12.2.0, stable | **the URL you pass** | ✅ npm + pnpm | ❌ `ERR_PACKAGE_PATH_NOT_EXPORTED` |
| `require.resolve(spec, { paths: [dir] })` | yes, stable | the `paths` array | ✅ npm + pnpm | ❌ same |
| `import.meta.resolve(spec)` | yes — sync and unflagged since v20.6.0/v18.19.0, Stability **1.2 Release candidate** | **the calling file, always** | ✅ only if the caller sits in the consumer | ❌ same |
| `import.meta.resolve(spec, parent)` | **flagged** — `--experimental-import-meta-resolve` | the `parent` you pass | — | — |
| `module.findPackageJSON(spec, base)` | v22.14.0, Stability **1.1 Active development** | the `base` you pass | ✅ npm + pnpm | ✅ **ignores `exports`** |

Sources for the version and stability columns, fetched 2026-09-19:
<https://nodejs.org/docs/latest-v22.x/api/module.html> ·
<https://nodejs.org/docs/latest-v22.x/api/esm.html>. The Node docs are explicit that the second
argument of `import.meta.resolve` is the non-standard part:

> **v20.6.0, v18.19.0** — No longer behind `--experimental-import-meta-resolve` CLI flag, except
> for the non-standard `parentURL` parameter

### 🔴 `import.meta.resolve` is the wrong tool here, and it fails SILENTLY

`install-e2e.mjs` runs from the repository and inspects a consumer somewhere in `os.tmpdir()`.
`import.meta.resolve` always resolves from **the file that calls it** — `cwd` is irrelevant and
the `parent` argument is ignored without the flag rather than rejected:

```console
$ node docs/prior-art/repro/claim4-parent-arg.mjs <WORK>/consumer-npm
running from: file:///home/user/research-paper-pipeline/docs/prior-art/repro/claim4-parent-arg.mjs
  1-arg FAIL: ERR_MODULE_NOT_FOUND Cannot find package 'research-paper-pipeline' imported from …/claim4-parent-arg.mjs
  2-arg FAIL: ERR_MODULE_NOT_FOUND Cannot find package 'research-paper-pipeline' imported from …/claim4-parent-arg.mjs
  require.resolve(..., {paths:[consumer]}) -> <WORK>/consumer-npm/node_modules/research-paper-pipeline/package.json
  createRequire(consumer/x.js).resolve(...) -> <WORK>/consumer-npm/node_modules/research-paper-pipeline/package.json
```

Note the second line: the parent URL pointed at the consumer, and the error still names the
*script's own path*. With the flag, the same line answers correctly:

```console
$ node --experimental-import-meta-resolve docs/prior-art/repro/claim4-parent-arg.mjs <WORK>/consumer-npm
  import.meta.resolve(..., parent=consumer) -> file://<WORK>/consumer-npm/node_modules/research-paper-pipeline/package.json
```

**A flag that turns a wrong answer into a right one, rather than an error into an answer, is
exactly the shape this repository keeps writing tests against.** `createRequire` takes its anchor
as an argument and has no such mode.

### The same probe, proving the anchor is the FILE and not the process

`claim4-resolve-apis.mjs` is kept as it was run: it must be **copied into the consumer** and run
there. Run from the repository instead, every name-based row fails — which is the point:

```console
$ (cd <WORK>/consumer-npm && node claim4-resolve-apis.mjs)      # copied in — as run
  OK   createRequire.resolve('<pkg>/package.json')
         -> <WORK>/consumer-npm/node_modules/research-paper-pipeline/package.json

$ node docs/prior-art/repro/claim4-resolve-apis.mjs             # run from the repo
  FAIL createRequire.resolve('<pkg>/package.json')
         MODULE_NOT_FOUND Cannot find module 'research-paper-pipeline/package.json'
```

## 2. Why `<pkg>/package.json` and not the bare name — and it is NOT the usual reason

The textbook trap is that `exports` blocks `./package.json`. **For this package it falls the
other way**, and the bare name is the spelling that fails:

```console
  OK   createRequire.resolve('<pkg>/package.json')
         -> …/node_modules/research-paper-pipeline/package.json
  FAIL createRequire.resolve('<pkg>')
         MODULE_NOT_FOUND Cannot find module 'research-paper-pipeline'
  FAIL import.meta.resolve('<pkg>')
         ERR_MODULE_NOT_FOUND Cannot find package '…/node_modules/research-paper-pipeline/index.js'
```

The cause is in our own manifest, printed by `claim4-package-dir.mjs`:

```console
manifest.main    : undefined
manifest.exports : undefined
manifest.bin     : {"research-paper-pipeline":"bin/rpp.mjs","rpp":"bin/rpp.mjs"}
```

No `main`, no `exports`, so the bare specifier falls through to `index.js`, which does not exist.
`./package.json` is not blocked because there is no map to block it.

**The textbook trap is real, though — it is our own dependency.** In the same run:

```console
  FAIL createRequire.resolve('vigiles/package.json')
         ERR_PACKAGE_PATH_NOT_EXPORTED Package subpath './package.json' is not defined by "exports"
  OK   createRequire.resolve('vigiles')
         -> …/node_modules/vigiles/dist/test.js
  FAIL createRequire.resolve('vigiles/dist/cli.js')
         ERR_PACKAGE_PATH_NOT_EXPORTED Package subpath './dist/cli.js' is not defined by "exports"
```

which is precisely the reason `src/cli.ts` (`runHook`, the comment above the injected `resolve`)
resolves `"vigiles"` and puts `cli.js` beside the result rather than naming the file. That note is
correct and this run confirms it.

🔴 **`module.findPackageJSON` is the API that does not have this problem.** Same tree, same
moment, `claim4-find-package-json.mjs`:

```console
findPackageJSON('research-paper-pipeline', consumer/x.js) -> …/node_modules/research-paper-pipeline/package.json
findPackageJSON('vigiles', consumer/x.js)                 -> …/node_modules/vigiles/package.json
```

It returned `vigiles/package.json` where `require.resolve` threw. The Node docs do not state that
it bypasses `exports`; this run does. ⚠️ It is Stability 1.1 and Node ≥22.14 only, so it is
recorded as the right long-term answer and **not** recommended for a gate that must run on the
`>=22.13` this package declares in `engines`.

## 3. What pnpm and npm actually return, and why it does not matter here

```console
# npm
=> package dir        : <WORK>/consumer-npm/node_modules/research-paper-pipeline
   isSymbolicLink?    : false
   SAME as resolved?  : true

# pnpm
=> package dir        : <WORK>/consumer-pnpm/node_modules/.pnpm/research-paper-pipeline@file+…/node_modules/research-paper-pipeline
literal node_modules/ : <WORK>/consumer-pnpm/node_modules/research-paper-pipeline
   isSymbolicLink?    : true -> .pnpm/research-paper-pipeline@file+…/node_modules/research-paper-pipeline
   SAME as resolved?  : true
```

Under pnpm the hardcode addresses the **symlink** and resolution addresses the **store realpath**
(Node realpaths by default; `--preserve-symlinks` flips it, and `resolve-package-path` carries
`lib/should-preserve-symlinks.js` for exactly that). `realpathSync` of one equals the other, so
every `existsSync` / `readdirSync` / `readFileSync` in `install-e2e.mjs` gives the same answer
either way. Two interesting asymmetries, both measured:

- `module.findPackageJSON` returns the **symlink** path under pnpm, not the store path — the
  opposite of `createRequire`.
- `findPackageJSON('vigiles', …)` **fails** under pnpm from the consumer root, because pnpm does
  not hoist transitive dependencies. That is the same fact that broke the hook wiring and is
  recorded in `src/cli.ts`; this is an independent reproduction of it.

## 4. The mutation: what resolution catches that `existsSync` cannot

A directory existing and a package being **reachable by name** are different claims. Add a closed
`exports` map to the installed manifest and the two diverge:

```console
$ node docs/prior-art/repro/claim5-exports-mutation.mjs <WORK>/consumer-npm
MUTATION applied: exports = {".":"./bin/rpp.mjs"} (no ./package.json, no ./bin/rpp.mjs)
1) the HARDCODE still sees everything:
   dir exists          : true
   plugin/hooks/h.json : true
   skills/             : true
2) the documented public import is BROKEN:
   import FAILS: ERR_PACKAGE_PATH_NOT_EXPORTED Package subpath './bin/rpp.mjs' is not defined by "exports"
3) resolution-based location reports it:
   resolve FAILS: ERR_PACKAGE_PATH_NOT_EXPORTED Package subpath './package.json' is not defined by "exports"
4) node:module.findPackageJSON, same mutation:
   findPackageJSON -> /tmp/rpp-mutation-X4jYrD/node_modules/research-paper-pipeline/package.json
```

`bin/rpp.mjs` documents `import { buildConfig } from "research-paper-pipeline/bin/rpp.mjs"` as a
public contract. Row 1 is the current test: green. Row 2 is the contract: broken. Row 3 is the
proposed replacement: red, for the right reason.

⚠️ **Row 4 is the honest caveat on the recommendation.** `findPackageJSON` is the better locator
and the *worse* canary: it answers past a broken map. Use `createRequire` for the gate.

**This is the whole case for the change.** Without this mutation the swap is cosmetic, and this
repository's rule is that a working tool is replaced when it is shown not to work, not when it
looks inelegant.

## 5. The bin — keep launching the shim, and also resolve the real file

The recorded reason for not using `node <path>` is exact, and reproduces:

```console
$ node docs/prior-art/repro/claim5-bin-launch.mjs <WORK>/consumer-pnpm
  <.bin shim> --help                 rc=0      253ms
  node <.bin shim> --help            rc=1       46ms   …/node_modules/.bin/rpp:2  basedir=$(dirname …)
  node <manifest bin> --help         rc=0      244ms
  npx --no-install rpp --help        rc=0      524ms
```

Under npm the shim is a symlink (`.bin/rpp -> ../research-paper-pipeline/bin/rpp.mjs`); under
pnpm it is a `#!/bin/sh` wrapper, and `node` chokes on its second line. But the `bin` value in the
resolved manifest is the **real file under both**, so `node <that>` works everywhere.

| way to get the bin | uniform across npm/pnpm? | cost | what it proves |
| --- | --- | --- | --- |
| `join(consumer, "node_modules/.bin", "rpp")` — today | yes (both managers write it) | none | **the manager created the shim** |
| `join(installed, manifest.bin.rpp)` | yes | one JSON read already being done | the file the manifest promises exists and runs |
| `npx --no-install <name>` | yes | ~0.5 s, one process | resolution by name through npm |
| `npm exec` / `pnpm exec` / `yarn bin` | per-manager commands | ~0.3–0.5 s each | nothing extra |
| `npm bin` | **gone** — `Unknown command: "bin"` on npm 10.9.7 | — | — |
| `npm ls <name> --parseable` | prints the path but exits `ELSPROBLEMS` on a pnpm tree | one process | npm's view only |

So the shim is not a guess to be removed; it is the only row that observes the manager's own
work. **What the manifest buys is the second row, free**, plus independence from the bin's *name*
(`rpp` versus `research-paper-pipeline`, and `.cmd` on Windows — a suffix `netlify/cli` has to
spell out and this script would not).

## 6. Named prior art

### Does exactly this

| project | file | mechanism |
| --- | --- | --- |
| **Playwright** | `playwright/lib/util.js:73` | `path.dirname(require.resolve("playwright-core/package.json"))` — the literal recommendation, in a shipped product |
| **ESLint** | `lib/shared/relative-module-resolver.js:24` | `createRequire(relativeToPath).resolve(moduleName)`, documented as *"This must be a file rather than a directory, but the file need not actually exist"*; the caller is `getPlaceholderPath(cwd) => path.join(cwd, "__placeholder__.js")` (`lib/eslint/eslint-helpers.js:648`) |
| **resolve-pkg 3.0.1** | `index.js:24–51` | the three-tier ladder: `resolve("<pkg>/package.json")`, else `resolve("<pkg>")` and walk **up** until the directory ends with `node_modules/<pkg>` or its manifest `name` matches, else `findUpSync("node_modules/<pkg>/package.json")`. The ladder exists *because* tier 1 dies on a closed `exports` map |
| **resolve-from 4.0.0** | `index.js:27` | the same placeholder trick, spelled `noop.js`, via `Module._resolveFilename` |
| **lint-staged 17.5.1** | `lib/resolveConfig.js:7` | `createRequire(import.meta.url)` with the comment *"require() does not exist for ESM, so we must create it to use require.resolve()"* |
| **resolve-package-path 4.0.3** | `lib/index.js:93` | `pnp ? pnp.resolveToUnqualified(target + "/package.json", baseDir) : …` — the only one of these that handles PnP, and it does so by `require("pnpapi")`, which only exists inside a PnP process |

### Adjacent — finds *a* package root, not *that* package

`pkg-dir` (4.2.0 and 8.0.0) and `read-package-up` are both one line of `findUp("package.json")`
plus `dirname`. They answer "which package am I inside", walking **up** from a directory. The
question here is "where did package X land", which walks **down** a resolution path. Different
question; neither is a candidate.

### Solves it by not asking — worth more than the rest

**husky 9.1.7**, `index.js:21`:

```js
f.copyFileSync(new URL('husky', import.meta.url), _('h'))
```

husky's git hooks never address `node_modules/husky/…`. On install it **copies its runtime out of
the package** into `.husky/_/h` and points `core.hooksPath` there, so the hook resolves nothing at
run time. That is the structural answer to the same problem `plugin/hooks/hooks.json` has, and it
is the reason husky works under PnP while our hook wiring does not.

### Self-location from INSIDE is not the hard case

`new URL("…", import.meta.url)` — husky above, `lint-staged/lib/version.js:4`, and our own
`bin/rpp.mjs:27` (`new URL("../dist/cli.js", import.meta.url)`). No resolution needed. The hard
case is only the one this script has: locating a package from a **third-party observer process**.

## 7. What other packages' own install e2e tests do — they hardcode

This is the closest analogue and the answer is plain: **they all hardcode**, and none of them
resolve.

- **netlify/cli**, `e2e/install.e2e.ts:256` — publishes to a local registry, installs under npm,
  pnpm and yarn (classic), then:
  ```ts
  const binary = path.resolve(path.join(cwd, `./node_modules/.bin/netlify${platform() === 'win32' ? '.cmd' : ''}`))
  ```
  Same three-manager matrix as `WANTED`, same `.bin` hardcode, plus the Windows suffix.
  <https://github.com/netlify/cli/blob/main/e2e/install.e2e.ts>
- **nestjs/terminus**, `tools/pack-check.mjs:32` — `npm pack` → install into `mkdtempSync` →
  ```js
  const installed = join(dir, 'node_modules', '@nestjs', 'terminus');
  ```
  and it verifies the public surface by running `node --input-type=module -e "import …"` **with
  `cwd` set to the consumer**, letting Node resolve. That is the resolution check recommended in
  § 4, arrived at from the other direction.
  <https://github.com/nestjs/terminus/blob/master/tools/pack-check.mjs>
- **npm/cli** smoke tests, `smoke-tests/test/fixtures/setup.js:22` —
  `const GLOBAL_NODE_MODULES = join(WINDOWS ? '' : 'lib', 'node_modules')`.
  <https://github.com/npm/cli/blob/latest/smoke-tests/test/fixtures/setup.js>
- A GitHub code search for `"npm pack" "node_modules" "tmpdir" extension:mjs` returns **4 552**
  files; every one sampled builds the path with `join(tmp, "node_modules", …)`.

**So the hardcode is the industry norm and is not, by itself, a defect.** The case for changing it
rests entirely on § 4, not on this section.

## 8. Correcting the PnP note in `test-tooling.md`

[`test-tooling.md`](test-tooling.md) § "One known limit" says:

> **Yarn Berry (PnP) cannot be supported as things stand.** `plugin/hooks/hooks.json` addresses
> `${CLAUDE_PROJECT_DIR}/node_modules/research-paper-pipeline/bin/rpp.mjs` literally, and PnP has
> no `node_modules` directory at all. Adding a third `managers()` row for it would be a red test,
> not a feature.

**The conclusion holds. The reason given is incomplete in three ways**, all measured by
`claim4-yarn-pnp.mjs`:

```console
$ node docs/prior-art/repro/claim4-yarn-pnp.mjs
yarn add: ok
node_modules present? NO
1) plain node, inside the PnP project (no PnP runtime):
  resolve FAILS: MODULE_NOT_FOUND Cannot find module 'research-paper-pipeline/package.json'
2) yarn node (PnP runtime loaded):
  resolve(pkg/package.json) -> …/.yarn/__virtual__/…/.yarn/berry/cache/research-paper-pipeline-file-919de88475-10c0.zip/node_modules/research-paper-pipeline/package.json
3) can the OUTSIDE process read the path PnP handed back?
   plain node existsSync: false
   yarn node  existsSync: true
4) `yarn bin rpp`:
   …/cache/research-paper-pipeline-file-919de88475-10c0.zip/node_modules/research-paper-pipeline/bin/rpp.mjs
5) does the CLI itself run under PnP?
   research-paper-pipeline — machine-checkable gates for a paper kept in git
```

1. 🔴 **The package is not PnP-incompatible — line 5 runs the CLI under PnP and it answers.** The
   note reads as if the package could not work there; what cannot work is one wiring file.
2. 🔴 **The blocker the note names is the MOVABLE one.** Claude Code exposes
   `${CLAUDE_PLUGIN_ROOT}` — *"Absolute path to the plugin's installation directory … Use it for
   scripts, binaries, and config files bundled with the plugin"*, exported to hook processes
   (<https://code.claude.com/docs/en/plugins-reference>). Rewriting the hook command with it
   removes the literal `node_modules` from `hooks.json`. Whether that is *desirable* is a separate
   question — the variable is only set when the package is loaded through the plugin channel, and
   today the npm channel is the one that delivers the runnable code — but it is not impossible.
3. 🔴 **The blocker the note does NOT name is the immovable one, and no resolution API fixes it.**
   PnP resolves to a path **inside a zip**. Line 3: the outside process gets `existsSync: false`
   for the very path PnP just handed it; only PnP's patched `fs` can open it. `install-e2e.mjs`
   inspects the installed tree with `existsSync`, `readdirSync` and `readFileSync` **from its own
   process**. Under PnP those read nothing, whatever API produced the path — and `yarn bin rpp`
   (line 4) hands back the same unreadable path, so the supported bin lookup does not help either.

**Supporting PnP therefore means re-executing the inspection half of the e2e under `yarn node`**,
not swapping a path for a resolve call. That is a real piece of work with a real payoff question,
and it should be recorded as such rather than as "PnP has no node_modules".

## 9. The second guess: the base directory for a path written in prose

`contentDelivery()` (`scripts/install-e2e.mjs:192–198`) tries three bases per reference.
Measured over the real corpus with `claim6-doc-path-candidates.mjs`:

```console
skills        : 24
distinct raw spellings: .claude/skills/paper-pipeline/scripts/announce.mjs
                        …
                        scripts/pipeline-check.mjs
                        ../verify-citations/scripts/verify-cites.mjs
which candidate resolved: {"c1":0,"c2":15,"c3":89,"none":0}
```

and `claim6-candidate-ambiguity.mjs`:

```console
total refs 104 ambiguous 0 {"c3":89,"c2":15}
```

- **Candidate 1 (`join(installed, raw)`) is dead: 0 of 104.** No skill writes a package-root
  relative path, and none has since the corpus existed.
- **Candidates 2 and 3 are disjoint by spelling**, zero references resolve under both. So the
  `some()` is not currently masking a wrong-base reference — an honest negative.
- The corpus carries **two conventions at once**: project-root-relative
  (`.claude/skills/paper-pipeline/scripts/x.mjs`, 89 refs) and skill-relative (`scripts/x.mjs`
  and `../other-skill/scripts/x.mjs`, 15 refs).

### Prior art for validating file references inside markdown

There is essentially one pattern, and it is not a ladder of candidates.

- **remark-validate-links 13.1.0** resolves every link against the **file's own directory** —
  `lib/index.js:282`, `base: absolute ? path.dirname(absolute) : file.cwd` — and takes the one
  thing it cannot derive as an explicit option: `root` *("path to Git root folder; if both `root`
  and `repository` are nullish, the Git root is detected")*. Detection is a single documented
  fallback with a stated failure mode, not a list of guesses.
  <https://github.com/remarkjs/remark-validate-links>
- **Claude Code plugins** declare it: *"All paths must be relative to the plugin root and start
  with `./`"*, plus `${CLAUDE_PLUGIN_ROOT}` for scripts.
  <https://code.claude.com/docs/en/plugins-reference>
- **This package already declares it once** — `.claude-plugin/plugin.json`:
  `"skills": "./skills/"`.

**What declaring it would look like here:** one convention for the prose — skill-relative, since
that is what survives both channels — and the test resolving against exactly one base, with
candidate 1 deleted and candidate 3 kept only as an explicitly named legacy spelling with its own
counter, so that "89 references still use the retired spelling" is a number the run prints rather
than a fact it hides behind an `||`. That is the same shape as the `managers()` rewrite: a
declared skip beats a silent one.

---

## Status

Written 2026-09-19. Every table cell above is either a pasted run from [`repro/`](repro/README.md)
or a quotation from the URL named beside it. Nothing here is recalled.

**What is NOT measured, and so not claimed:** behaviour on Windows (the `.cmd` shim, the pnpm
`.ps1`/`.cmd` wrappers); npm workspaces, where a hoisted install would put the package at the
workspace root rather than in the consumer — the e2e builds a standalone temp project, so this is
untested and merely plausible; yarn *classic*, which has a `node_modules` layout and is one
`managers()` row away but was not run.
