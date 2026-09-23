# Reproduction scripts for the platform measurements

These are the probes behind the verdicts in
[`../../package-shape-options.md`](../../package-shape-options.md) § "Premise corrections".
They are kept because a measurement without its script is a number nobody can re-run: the next
person who doubts a verdict here should be able to disagree with a program, not with prose.

They are **not** part of the package's test suite and are not wired into any gate. Each is a
standalone script run by hand.

## How the CLAIM 1 probes work

They use `runHarnessTest` from vigiles, which spawns the **real** `claude` CLI against a
**scripted mock model**. Nothing reaches a paid endpoint, and `r.modelRequests` exposes exactly
what text arrived at the model — which is what a substitution question is actually asking.

```console
$ node docs/prior-art/repro/claim1-crosschannel.mjs
```

| script | what it decides |
| --- | --- |
| `claim1-project-skill.mjs` | does `${CLAUDE_SKILL_DIR}` substitute in a **project** skill's body? |
| `claim1-plugin-skill.mjs` | the same in a **plugin-provided** skill, with cwd elsewhere |
| `claim1-crosschannel.mjs` | the table that decides the design: which variables resolve in **both** doors |
| `claim1-allowedtools.mjs`, `claim1-at2.mjs` | does it substitute in `allowed-tools`? (`at2` is the rebuild after the first version turned out vacuous — Bash was broadly granted, so the permit proved nothing; it now carries an identically shaped decoy) |
| `claim1-frontmatter.mjs`, `claim1-plugin-frontmatter.mjs` | frontmatter `hooks:` — in both channels |
| `claim1-hook-payload-reporter.mjs` | the hook the two probes above install; reports argv and env separately, so "not substituted" is distinguishable from "not run" |
| `claim3-imports.mjs` | transitive third-party closure of the scripts SKILL.md files actually reference |

**Every CLAIM 1 probe carries positive controls** (the skill resolved · a literal body sentinel
reached the model · a granted tool succeeded). Without them a silent empty result reads as a
finding, which is the failure mode this repository keeps re-measuring.

## The CLAIM 2 fixtures

Five marketplace manifests, flattened to files here so that no directory in this repository looks
like a real plugin. To run one, put it back where the CLI expects it:

```console
$ mkdir -p /tmp/m/.claude-plugin
$ cp docs/prior-art/repro/claim2-marketplace-nested-range.json /tmp/m/.claude-plugin/marketplace.json
$ claude plugin validate /tmp/m --strict; echo "RC=$?"
```

| fixture | RC | why it is kept |
| --- | --: | --- |
| `nested-range` | 0 | the accepted shape — `source` is an object whose own `source` key names the type |
| `nested-exact`, `nested-noversion` | 0 | `version` is optional and takes an exact version or a range |
| `flat-asclaimed` | 1 | the shape the design note originally recorded. It is **rejected** |
| `negative-control` | 1 | `"source": "nosuchsourcetype"`. Without it, `nested-range` passing would only show the validator is permissive |

⚠️ **Capture the real exit code, not a pipeline's.** `claude plugin validate … \| head` reports
`head`'s status. Both the measurement and its first re-run got this wrong before it was caught.

## The CLAIM 4–6 probes — where an installed package is, and how to find it

These back [`../package-location.md`](../package-location.md). They measure the two hardcodes in
`scripts/install-e2e.mjs` (`node_modules/<name>` and `node_modules/.bin/rpp`) against the
resolution APIs Node actually offers, under npm, pnpm and Yarn Berry (PnP).

Build the consumer trees once — it packs this repository and installs the SAME tarball twice:

```console
$ node docs/prior-art/repro/claim4-setup-consumers.mjs /tmp/loc
/tmp/loc/consumer-npm
/tmp/loc/consumer-pnpm
```

| script | how to run it | what it decides |
| --- | --- | --- |
| `claim4-setup-consumers.mjs` | `node … [workdir]` | builds the two consumers; prints their paths. The only one of these that is not evidence — re-run it freely |
| `claim4-resolve-apis.mjs` | **copy into a consumer**, then `cd` there and `node claim4-resolve-apis.mjs` | the matrix: which of `createRequire.resolve`, `require.resolve(…,{paths})` and `import.meta.resolve` answer, for the bare name and for `<pkg>/package.json`, plus the `exports`-closed control (`vigiles`) |
| `claim4-package-dir.mjs` | same — copy in, run there | resolved dir vs the literal `node_modules/<name>`; symlink status; `main`/`exports`/`bin` of the installed manifest |
| `claim4-find-package-json.mjs` | same — copy in, run there | `module.findPackageJSON` (Node ≥22.14, Stability 1.1), including that it answers past a closed `exports` map where `require.resolve` throws |
| `claim4-parent-arg.mjs` | `node … <consumer-dir>` from ANYWHERE else | that `import.meta.resolve`'s second argument is **ignored, not rejected**, without `--experimental-import-meta-resolve`. Run it twice, with and without the flag |
| `claim4-yarn-pnp.mjs` | `node … [workdir]` — needs the network | builds a PnP consumer and asks whether the path PnP resolves to can be read by the process that asked. Corrects `../test-tooling.md` § "One known limit" |
| `claim5-resolved-location-and-bin.mjs` | `node … <consumer-dir>` | the proposed replacement for lines 135/172/276, exercised end to end |
| `claim5-bin-launch.mjs` | `node … <consumer-dir>` | four ways to launch the installed bin, with exit codes and wall time |
| `claim5-exports-mutation.mjs` | `node … <consumer-dir>` | **the case for the change.** Copies a consumer, adds a closed `exports` map, and shows the hardcode staying green while the documented public import breaks |
| `claim6-doc-path-candidates.mjs` | `node … <consumer-dir>` | which of `contentDelivery()`'s three candidate base directories actually fires, over the real 104 references |
| `claim6-candidate-ambiguity.mjs` | `node … <installed-package-dir>` | whether any reference resolves under more than one candidate — i.e. whether the `some()` can hide a wrong base |

🔴 **`claim4-resolve-apis.mjs`, `claim4-package-dir.mjs` and `claim4-find-package-json.mjs` must
be COPIED INTO the consumer**, because `createRequire(import.meta.url)` and `import.meta.resolve`
anchor at the calling FILE, not at `cwd`. Run from the repository they report `MODULE_NOT_FOUND`
for every name-based row — which is itself one of the findings, and is shown both ways in
`../package-location.md` § 1. Do not "fix" them by taking a directory argument: the anchoring is
the measurement.

⚠️ `claim5-exports-mutation.mjs` and `claim4-yarn-pnp.mjs` leave their trees on disk and print
where, so a disputed line can be re-read rather than re-derived.
