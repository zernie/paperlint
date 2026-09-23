# Paper folders and hooks — who creates them, and what the human still types

Written 2026-09-23. Two questions that turned out to be one: **what does a command do, and what is
still left to a human copying something by hand?**

> **Status, 2026-09-23 — implemented, with corrections.** The template moved into files
> (`templates/paper/`), `rpp new` exists, and `rpp init` writes the hooks into
> `.claude/settings.json` with the two-mode behaviour of § 6. An independent review returned
> HOLDS WITH CAVEATS; its corrections are applied below and marked **[corrected]**:
>
> - the cloud claim was too strong. Plugins the **user** installed or synced at account level do
>   load in a cloud session; what does not load is a plugin **declared by the repository**
>   (`enabledPlugins` / `extraKnownMarketplaces` in the repo's settings);
> - `.claude/settings.json` hooks load in the cloud in **single-repo sessions** only;
> - `rpp freeze` is **not part of this change** — it stays a later step;
> - `--hooks=local` is **deferred, not implemented**; `init` refuses it by name.
>
> Where the build differed from this text, it is listed at the end, in § 8.

1. A paper folder needs a `PIPELINE-STATUS.md`, and today nothing makes it — you copy a template.
   Should there be a command, and where should per-paper settings live: in a file in every paper
   folder, or in one config that lists the folders?
2. `rpp init` ends by printing two Claude Code commands to type. Without them the three editor
   hooks (including the blocking `paper-edit-guard`) are not active. Should `init` wire the hooks
   itself?

## The answer in five lines

- **Config topology: keep what exists.** The root config names the papers _directory_ (a scope),
  never a list of papers; each paper carries its own settings in its own folder. Every comparable
  tool does it this way, and the one that keeps an explicit list (Cargo) had to teach `cargo new`
  to edit that list so it does not drift.
- **New command `rpp new <name>`** scaffolds a paper folder the linter accepts, from a real template
  file (Hugo's "archetype" model). On an existing folder it only adds what is missing (`cargo init`).
- **Later, not in this change: `rpp freeze <paper> <stage>`** would copy the PDF and source into
  `versions/` and append the `stages` record with the byte counts. Those numbers are tool-written
  state, like a lockfile — no human should type `bytes: 305337`.
- **Hooks: `rpp init` writes them into `.claude/settings.json`** (idempotent merge, never touching
  the user's own entries), and the plugin stops being the hook carrier. A plugin the repository
  declares is not installed in a cloud session **[corrected: a user-installed plugin is]**, the
  `/plugin` route cannot be run by an agent, and its effect cannot be checked by `rpp doctor`; the
  one real consumer already wires the hooks in `settings.json` by hand.
- **`init` asks only when a human is at a terminal**, and has a stated default for everything else.

The smallest first step: `rpp new`, copying a template file that ships in the package. No rule
changes, no migration.

---

## 1. The current design, from the code

### How rpp finds papers

- **One key in the consumer's `package.json`**, `research-paper-pipeline.papers`, default `papers`
  (`lib/paper-config.mjs:24`, `:27`). `rpp.json` is still read as a deprecated fallback
  (`src/cli.ts` `findDeclaration`, and `docs/configuration.md` § "Why the key lives in
  `package.json`").
- **`rpp init` measures the papers root**: `detectPapers` (`src/doctor.ts:97`) walks two levels
  for a directory whose _children_ hold a paper marker. One hit is used, several are asked about,
  none falls back to `papers` and is labelled a guess (`src/init.ts` `choosePapers`). It then writes
  the key into `package.json` (`declarePapers`), links the skills into `.claude/skills/`
  (`src/init.ts:448`), offers a CI workflow, reports missing programs, and **prints** the two
  `/plugin` lines (`src/init.ts:257-258`). It never creates the papers directory and never creates
  a paper.
- **A directory is a paper** if it holds any of `PIPELINE-STATUS.md`, `paper.tex`, `paper.md`,
  `venue.json` (`src/build.ts:41-46`, `src/structure.ts:39`). Detection is generous.
- **`rpp lint` requires `PIPELINE-STATUS.md`** in every such directory, plus one of
  `paper.tex`/`paper.md` (`src/structure.ts:38-43`). A paper with only `paper.md` fails the very
  first `rpp lint` with `missing PIPELINE-STATUS.md` — that is the README's own "First run" example.

⚠️ **One inconsistency worth knowing.** `paper/stages` says in its header that a missing `stages`
field is _legitimate_ — "a paper that has shipped nothing owes nothing" (`eslint-rules/paper-stages.mjs:24-27`) —
while `structure` makes the _file_ that would carry the field an unconditional error. A brand-new
draft is therefore red for lacking a file whose only machine-read content would be empty. With
`rpp new` the requirement stops costing a hand-copy, so this doc does not propose relaxing it; it is
listed so nobody thinks the two are consistent.

### Which rules read which part of `PIPELINE-STATUS.md`

| rule / reader                       | where                                                             | reads                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `paper/stages` (error)              | `eslint-rules/paper-stages.mjs:91`, glob `src/cli.ts:126`         | front matter `stages[]`: `stage`, `date`, `pdf`, `bytes`; and lists `versions/*.pdf`                          |
| `paper/source` (error)              | `eslint-rules/paper-stages.mjs:377`, `:415`, `:442`               | `stages[].source`, `sourceBytes`, `sourceLost`                                                                |
| `paper/author-list` (warn)          | `eslint-rules/paper-stages.mjs:296`, marker `:325`                | `stages[]` + searches the scorecard **table cells** for the marker `bib-authors`                              |
| `paper/research-question` (warn)    | `eslint-rules/paper-research-question.mjs:142`                    | reads the status file from disk while linting `paper.tex`/`paper.md`: `stages`, `researchQuestion`            |
| `paper/typography` (warn)           | `src/cli.ts:118`                                                  | **not** the status file — its per-paper allowance lives in the ROOT key `typographyDebt`, keyed by paper path |
| `pipeline-check.mjs` (skill script) | `skills/paper-pipeline/scripts/pipeline-check.mjs:231-321`        | the `Venue:` / `Deadline:` header line, the verdict line, the five section tables                             |
| `paper-status-gates` hook           | `hooks/paper-status-gates.hook.mjs`                               | surfaces the verdict and unrun gates after an edit                                                            |
| ledger + `status.mjs`               | `skills/paper-pipeline/scripts/ledger.mjs:1-25`, `status.mjs:1-7` | **nothing** from the file — they record runs in `runs.jsonl` and derive status from it                        |

The last row matters. `ledger.mjs` opens with: _"Until 2026-08-07 the pipeline's state lived in a
hand-maintained markdown table (`PIPELINE-STATUS.md`) whose rows a human ticked. It lied constantly
and in one direction"_, and `status.mjs`: _"Everything printed here is derived from the ledger plus
the bytes currently on disk. There is no field a human can set."_ So the package has already
decided, in code, that the scorecard tables are derivable state — while the template still asks a
human to copy and tick them.

## 2. What `PIPELINE-STATUS.md` actually holds — the split

Read from the template (`skills/paper-pipeline/references/pipeline-status-template.md`), the
fixtures (`fixtures/paper-stages/*`, `fixtures/real-markdown-paper/`) and four real files in the
owner's corpus. Real sizes: 86, 95, 1 057 and 1 301 lines. In the two big ones the machine-read
part is the first 10–25 lines of front matter; the rest is a dated journal of decisions. (No
content of those files is reproduced here.)

| content                                                                         | kind                  | who should write it                                                                                                                                                       |
| ------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| paper short name / title                                                        | **config**            | human, once — `rpp new` can prefill from the folder name                                                                                                                  |
| venue, deadline, blind model (the `Venue:` header line)                         | **config**            | human; changes when the paper is re-targeted                                                                                                                              |
| `researchQuestion`                                                              | **config**            | human, once                                                                                                                                                               |
| format (`.tex` vs `.md`)                                                        | **derived**           | from which source file exists                                                                                                                                             |
| venue profile, paper kind, pdf path (a separate `venue.json` in one real paper) | **config**            | human; already a per-paper file in practice                                                                                                                               |
| typography allowance (`typographyDebt`)                                         | **config**            | human, but it sits in the root key keyed by path today                                                                                                                    |
| `stages[]`: `stage`, `date`, `venue`                                            | **state**             | **tool** at the moment of freezing (`rpp freeze`, a later step)                                                                                                           |
| `stages[]`: `pdf`, `bytes`, `source`, `sourceBytes`                             | **state (a lock)**    | **tool** — derivable at freeze time, then _kept_ as an integrity record, exactly like a lockfile hash. If it were re-derived on every run, `bytesDiffer` could never fire |
| `stages[]`: `sourceLost: true` + its explaining comment                         | **state**             | human — a declared exception, and the comment is the point                                                                                                                |
| `State:` header field                                                           | **derived**           | duplicates `stages` (the real files say so in their own comments: "the field is the carrier, the header is display")                                                      |
| `Updated:`                                                                      | **derived**           | `git log -1` on the file                                                                                                                                                  |
| which `versions/*` exist, their sizes                                           | **derived**           | the disk (`paper/stages` already lists them, `paper-stages.mjs:210`)                                                                                                      |
| table columns `id`, `Work`, `Skill`, `Requires`                                 | **derived**           | the canonical edge set in `scripts/pipeline-edges.mjs` — today copied by hand and policed by a rule for having been copied wrong                                          |
| table columns `Status`, `Date`, `Result`, `Open`                                | **state**             | the ledger already records this (`ledger.mjs record …`)                                                                                                                   |
| "stale" marks on CONTINUOUS rows                                                | **derived**           | computed from git + ledger (`pipeline-check.mjs`, `stale-continuous`)                                                                                                     |
| "Gates at a glance" line                                                        | **derived**           | from the rows                                                                                                                                                             |
| readiness verdict                                                               | **state (judgement)** | human or the reviewing skill; not derivable                                                                                                                               |
| the journal (dated sections, reasons, what was decided)                         | **record**            | human; never machine-read, and should not be                                                                                                                              |

The crux in one sentence: **the machine reads a small config block and a short list of stage
records; the human reads a long journal; and the tables in between are state the ledger already
owns.** Copying the template by hand makes a human produce all three, including the part the tool
already computes.

## 3. Prior art

### 3.1 Scaffolding a new unit from a template

| tool           | command                                             | what it creates                          | quote                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | --------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hugo           | `hugo new content posts/x.md`                       | one file from an **archetype**           | "An archetype is a template for new content." Lookup order: `archetypes/posts.md` → theme's → `archetypes/default.md` → theme's → built-in. `{{ .Date }}` is filled and `draft` set to `true` — [gohugo.io/content-management/archetypes](https://gohugo.io/content-management/archetypes/)                                                                                                          |
| Cargo          | `cargo new` / `cargo init`                          | a package dir with its own `Cargo.toml`  | "a simple template with a `Cargo.toml` manifest, sample source file, and a VCS ignore file" — [cargo-new](https://doc.rust-lang.org/cargo/commands/cargo-new.html). And: "Running `cargo new` inside a workspace also automatically adds the newly created package to the `members` key" — [the Rust book ch. 14.3](https://doc.rust-lang.org/book/ch14-03-cargo-workspaces.html)                    |
| Quarto         | `quarto create project <type> <name>`               | a project dir with `_quarto.yml`         | "Use the `quarto create project` command to create a new project, using the prompt. Or define the type and the project name as arguments" — [quarto-projects](https://quarto.org/docs/projects/quarto-projects.html). Types include `manuscript`; a manuscript "has two files: … `index.qmd`" and `_quarto.yml` — [manuscripts/authoring](https://quarto.org/docs/manuscripts/authoring/vscode.html) |
| changesets     | `changeset` (add)                                   | **one file per change** in `.changeset/` | "a new changeset will be added which is a markdown file with YAML front matter" … "Once you are happy with the changeset, commit the file to your branch." — [adding-a-changeset](https://github.com/changesets/changesets/blob/main/docs/adding-a-changeset.md)                                                                                                                                     |
| npm / create-* | `npm init -y`, `npm create vite`, `create-next-app` | a project                                | see § 5 for their non-interactive flags                                                                                                                                                                                                                                                                                                                                                              |

**What carries over:** every one of them creates the unit from a template **file** that lives
somewhere a user can override (Hugo's lookup order is the clearest). None asks the user to copy a
template out of a documentation page. rpp's template today lives _inside a fenced code block of a
reference doc_ (`pipeline-status-template.md:143-205`), so a command would have to extract it by
parsing markdown — the fix is to ship the template as its own file and have the doc point at it.

### 3.2 Where settings live: one root config, or one per unit?

| tool                          | root config                                                                                                                                               | per-unit settings                                                                                                                                                             | how units are found                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Quarto** (closest analog)   | `_quarto.yml`: "Any document rendered within the project directory will automatically inherit the metadata defined at the project level."                 | document YAML front matter; optional `_metadata.yml` per directory — "Document level options take priority, followed by directory options and finally project-level options." | "By default, all valid Quarto input files … in the project directory will be rendered" — no list. [quarto-projects](https://quarto.org/docs/projects/quarto-projects.html) |
| **Astro** content collections | one `src/content.config.ts` — "All of your build-time content collections are defined in a special src/content.config.ts file"                            | each entry's front matter, validated by a schema: "If any file violates its collection schema, Astro will provide a helpful error"                                            | a glob loader over a directory. [content-collections](https://docs.astro.build/en/guides/content-collections/)                                                             |
| **Cargo** workspace           | `[workspace] members` — "also supports globs … like `crates/*`"                                                                                           | each member's own `Cargo.toml`                                                                                                                                                | globs **or** an explicit list, which `cargo new` edits for you. [workspaces](https://doc.rust-lang.org/cargo/reference/workspaces.html)                                    |
| **Eleventy**                  | global data                                                                                                                                               | front matter, and **directory data files**: `posts/posts.json` "will configure a layout for all of the templates inside of `posts/*`"; front matter wins                      | the input directory. [data-template-dir](https://www.11ty.dev/docs/data-template-dir/)                                                                                     |
| **ESLint** flat config        | one `eslint.config.*` with `files` globs: "an array of glob patterns indicating the files that the configuration object should apply to"                  | none — per-directory cascade was removed                                                                                                                                      | globs. [configuration-files](https://eslint.org/docs/latest/use/configure/configuration-files)                                                                             |
| **Vale**                      | one `.vale.ini`: "A section header is a glob matched against a file's path … A file matches every section whose glob fits it"                             | none                                                                                                                                                                          | globs. [.vale.ini](https://docs.vale.sh/topics/.vale.ini.md)                                                                                                               |
| **markdownlint-cli2**         | `.markdownlint-cli2.jsonc` in any directory: "Settings in this file apply to the directory it is in and all subdirectories" and "merge with" the parent's | the per-directory file _is_ the mechanism                                                                                                                                     | the directory tree. [markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2)                                                                                   |

**What this says, without taste:**

1. **The root config names a SCOPE, not a roster.** Quarto, Astro, Eleventy, ESLint and Vale all
   discover units from a directory or glob. Cargo is the only one with an explicit member list, and
   it is also the only one that had to make its scaffolding command _edit_ the root file — a list
   kept by hand drifts. rpp already discovers papers by marker (`src/build.ts:41`), so a roster in
   `package.json` would be a second source of truth for a fact the disk already states.
2. **Per-unit data lives with the unit.** Quarto (document front matter / `_metadata.yml`), Astro
   (entry front matter), Cargo (member `Cargo.toml`), Eleventy (directory data). The tools that put
   per-unit settings in the root (ESLint `files`, Vale sections) are _linters of code_, where units
   have no identity of their own — a paper does.
3. **Front matter of the source itself is not available to rpp**, because half the papers are
   LaTeX, which has no YAML front matter. Quarto and Astro can use the document's own header only
   because every document is markdown. So rpp needs a per-paper **file**, and it already has one:
   `PIPELINE-STATUS.md`, whose front matter is exactly where Quarto would put these fields.
4. **Root-level keys that are really per-paper** (`typographyDebt: { "papers/my-paper": … }`,
   `src/cli.ts:104`) are the ESLint-overrides style. They work, but they break silently on a folder
   rename. Not worth moving today (one ratchet number for one rule); worth not adding more of.

### 3.3 State the tool writes vs config the human writes

| tool           | human-written                                                    | tool-written                                                                                                                                                                   | committed?                                                                                                                                 |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| release-please | `release-please-config.json` ("releaser specific configuration") | `.release-please-manifest.json` — "release-please will record a new version into the manifest file"; "Manually editing the manifest is only appropriate in the bootstrap case" | yes, both. [manifest-releaser](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md)                           |
| changesets     | the changeset message                                            | the file is _created_ by the command, _consumed_ by `changeset version`                                                                                                        | yes                                                                                                                                        |
| Quarto freeze  | document + `freeze:` option                                      | `_freeze/` — "The computational results of documents executed with `freeze` are stored in the `_freeze` directory"                                                             | "You should check the contents of `_freeze` into version control" — [code-execution](https://quarto.org/docs/projects/code-execution.html) |
| npm / Cargo    | `package.json` / `Cargo.toml`                                    | lockfile with integrity hashes                                                                                                                                                 | yes                                                                                                                                        |

**Pattern:** config and state are separate things with separate writers, the state is committed,
and a human edits the state only to bootstrap. rpp's `stages[].bytes` is textbook lock state —
written once at freeze time, then checked forever — and today a human types it.

## 4. Recommendation — paper folders

### Topology

- **Root (`package.json` key): the papers directory only.** Unchanged. It stays a scope, like
  Quarto's project dir or Astro's collection glob. No list of papers.
- **Per paper: the paper folder's `PIPELINE-STATUS.md` front matter** holds that paper's config
  (`researchQuestion`, and the venue/deadline fields that today live in a prose header line) and
  its stage records. Unchanged carrier, so every existing paper keeps working.
- **Not recommended now: a separate `paper.yml`.** It would split config from the journal cleanly
  (the 1 300-line files are 98% journal), but it moves every rule's input and every consumer's
  files for a gain nobody has hit as a bug yet. Trigger to revisit: a rule needing a per-paper
  setting that is awkward in markdown front matter, or `venue.json` growing a second reader.

### Commands

**`rpp new <name> [--format tex|md]`** — creates `<papers>/<name>/` with:

- `paper.tex` or `paper.md` (a minimal stub; `--format` defaults to `tex` — ask when interactive);
- `PIPELINE-STATUS.md` from a **template file** shipped in the package, with the name filled in,
  `researchQuestion` present but empty and commented, and **no** `stages` field (a new paper has
  shipped nothing — `paper-stages.mjs:24`).

Rules for it, each taken from a tool above:

- the name is validated (`[a-z0-9._-]+`) — it becomes a path and, via the hooks, a shell argument;
- it **never overwrites**; run on an existing folder it adds only the missing required files
  (`cargo init` semantics). That is also the migration for old folders missing the file;
- template lookup Hugo-style: a project override (e.g. `<papers>/.template/`) first, the package
  default second — so the owner can keep his own richer scorecard without forking the package;
- it prints what it created and then runs `rpp lint <that folder>`, so the first thing the user
  sees is a green report, not the current "missing PIPELINE-STATUS.md".

**Later step, NOT part of this change — `rpp freeze <paper> <stage> [--pdf <file>] [--date <iso>]`**,
the release-please move, recorded so the design is not lost:

- copies the built pdf and the source into `versions/<date>-<stage>.pdf|.tex|.md`;
- **appends** one record to `stages` with `stage`, `date`, `pdf`, `bytes`, `source`, `sourceBytes`;
- refuses a stage outside `STAGES` (`paper-stages.mjs:53`) and a date/stage pair already present.

⚠️ **Measured constraint for `freeze`: the real files carry load-bearing YAML comments inside
`stages` entries** (the `sourceLost` explanations). `js-yaml` (the dependency today) loses comments
on dump. `freeze` must therefore either append the record as text after the last entry, or use a
comment-preserving YAML document API — never parse-and-re-serialize.

**No command for scorecard rows.** Their status/date columns are what `ledger.mjs record` already
writes and `status.mjs` already derives. Converging the tables onto the ledger is a separate
decision with skill-text consequences; out of scope here. The scaffold keeps the tables, because
the skills tell agents to update them.

### Who writes what, after this

|                                            | before                    | after                                                                   |
| ------------------------------------------ | ------------------------- | ----------------------------------------------------------------------- |
| the folder and source stub                 | human                     | `rpp new`                                                               |
| `PIPELINE-STATUS.md` skeleton              | human copies a code fence | `rpp new`                                                               |
| `researchQuestion`, venue, deadline        | human                     | human (unchanged)                                                       |
| `stages` records, bytes, the frozen copies | human types byte counts   | still human; `rpp freeze` is the later step that takes it over          |
| `sourceLost` exceptions                    | human                     | human (unchanged)                                                       |
| `State:`, `Updated:`, `Requires` cells     | human                     | still human; **derivable** — candidates to drop from the template later |
| row status                                 | human ticks               | ledger (already exists); tables unchanged for now                       |
| the journal                                | human                     | human (unchanged)                                                       |

### Migration

- **Existing folders with a `PIPELINE-STATUS.md`** (the owner's four): nothing changes. Their
  front matter is already the per-paper carrier; a later `rpp freeze` would append to their lists.
- **Existing folders without one** (a draft that has only `paper.md`): `rpp new <that-name>` fills
  the missing file and touches nothing else.
- **No `rpp migrate` is needed** for this recommendation. One would be needed only if the carrier
  later moves to `paper.yml`.

### The smallest first step

Move the template out of the code fence into its own file (say
`templates/paper/PIPELINE-STATUS.md`, plus `paper.tex` and `paper.md` stubs), make
`pipeline-status-template.md` point at it instead of containing it, and add `rpp new` that copies
it. Then the README sentence "Nothing generates it and no command refreshes it" becomes "`rpp new`
creates it". No rule changes, no consumer migration. `rpp freeze` is step two; `init` offering to
call `rpp new` is step three (§ 5).

---

## 5. Recommendation — hooks: `init` writes them, the plugin stops carrying them

### What the earlier decision said, and whether it still holds

`docs/install.md:126-127`: _"Step 3 cannot be collapsed: it is typed into a different program, and
nothing on disk can type it for you."_ The premise is that hooks can only reach Claude Code through
a plugin. **They can reach it through a file on disk**, and Claude Code documents it as the
first-class way to share hooks with a team:

> | `.claude/settings.json` | Single project | Yes, can be committed to the repo |
> — [Claude Code hooks](https://code.claude.com/docs/en/hooks)

> Commit `.claude/settings.json` so everyone who clones the repository gets the same permissions,
> hooks, telemetry, and plugins. — [Claude Code settings](https://code.claude.com/docs/en/settings)

> Direct edits to hooks in settings files are normally picked up automatically by the file watcher.
> — [hooks](https://code.claude.com/docs/en/hooks)

The reasons recorded for the plugin in `docs/install.md` § "Why the plugin ships no code" are about
where the **code** lives (skills and scripts ride with the npm package, because a plugin fetched
from npm gets no `node_modules`). They are still true, and they are not reasons for the plugin:
they are the reason the plugin is **empty**. Today it carries exactly one file,
`plugin/hooks/hooks.json`, whose three commands already point into the project's own
`${CLAUDE_PROJECT_DIR}/node_modules/research-paper-pipeline/bin/rpp.mjs`. Nothing in it needs a
plugin to exist.

### Four findings that decide it

1. **A plugin the repository declares does not load in a cloud session; `.claude/settings.json`
   hooks do, in a single-repo session.** **[corrected]** The first draft said "plugins do not load
   in a cloud session" — too strong: plugins installed or synced at the user's account level do
   load there. What does not load is what the table below says, plugins declared in the
   repository's own settings. The owner works through Claude Code on the web. The
   cloud-environment docs, table "What carries over from your setup":

   > Your repo's `.claude/settings.json` hooks and permission rules — **Yes, in a session with one repository**
   >
   > Plugins and marketplaces declared in your repo's `.claude/settings.json` — **No** — A cloud
   > session doesn't install the plugins a repository turns on under `enabledPlugins`, including
   > ones from the marketplaces it lists under `extraKnownMarketplaces`.
   > — [cloud-environments](https://code.claude.com/docs/en/cloud-environments)

   So on the owner's main surface a plugin the **repository** turns on delivers **zero** hooks, and
   the blocking guard is off, silently; a plugin each **user** installs at account level would load,
   but that is per person — a collaborator or a fresh account gets nothing, and nothing on disk
   records it. This also rules out the half-way option of writing `extraKnownMarketplaces` +
   `enabledPlugins` into the project settings.

2. **An agent cannot type `/plugin …`.** Those are slash commands for a human in the Claude Code UI.
   An agent that installs rpp for the user (the common case now) finishes with no hooks and no way
   to fix it. A settings-file write is an ordinary file edit any agent can make — and `rpp init`
   can make it for them.
3. **`rpp doctor` cannot check the plugin** — it says so: _"the plugin (the hooks inside Claude
   Code) cannot be checked from a terminal — type /plugin inside Claude Code"_ (`src/doctor.ts:273-274`).
   It **can** read `.claude/settings.json`. For a guard whose success state is silence, "doctor can
   see it" is the whole point of doctor.
4. **The only real consumer already does it this way.** The owner's knowledge base does not install
   the rpp plugin (its `enabledPlugins` lists two other plugins); it wires all three rpp hooks
   directly in `.claude/settings.json`, by hand. The installer should produce what the working
   install already looks like.

Two further, smaller points: `settings.json` hooks come from the **same installed version** as the
code they call, while a marketplace plugin is fetched from the repository separately (a hook renamed
in one and not the other would fail to launch — plausible, not measured); and the plugin is one more
moving part that `install.md` has to explain.

### How other tools install hooks with zero manual steps

| tool             | how hooks get installed                                                                                                                                      | treatment of what it did not create                                           | quote / source                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| husky            | `husky init` writes `.husky/pre-commit` and edits `package.json` `prepare`, so every later `npm install` re-installs                                         | only manages `.husky/`                                                        | `husky init` "creates a `pre-commit` script in `.husky/`" and "updates the `prepare` script in `package.json`" — [husky get started](https://typicode.github.io/husky/get-started.html) |
| simple-git-hooks | hooks declared in a `package.json` key; `npx simple-git-hooks` writes them; recommended in `prepare`                                                         | removes unused hooks by default (`preserveUnused` to keep)                    | "Now git hooks will be installed automatically when `npm install` is run" — [simple-git-hooks](https://github.com/toplenboren/simple-git-hooks)                                         |
| lefthook         | `lefthook install` writes git hooks from `lefthook.yml`; the npm package runs it at postinstall (pnpm needs `onlyBuiltDependencies` or it silently does not) | backs existing hooks up as `.old`                                             | "Installs configured hooks to Git hooks." — [lefthook install](https://lefthook.dev/usage/commands/install/), [lefthook npm](https://lefthook.dev/installation/node/)                   |
| pre-commit       | `pre-commit install`; never automatic on clone unless a global template dir is set                                                                           | "migration mode which runs both your existing hooks and hooks for pre-commit" | "Every time you clone a project using pre-commit running `pre-commit install` should always be the first thing you do." — [pre-commit.com](https://pre-commit.com/)                     |

Common shape: **the tool writes the hook wiring into a file the host already reads, idempotently,
and preserves what it did not write.** Nobody asks the user to paste the wiring. The one twist for
rpp is favourable: unlike `.git/hooks/`, `.claude/settings.json` is a **committed** file, so one
`rpp init` wires the hooks for every clone and every cloud session — husky needs `prepare` to get
the same effect; rpp does not.

### The design

- **`rpp init` merges rpp's three hook commands into `<project>/.claude/settings.json`** — the
  shared, committed file (husky's analog). `--no-hooks` skips. **[corrected]** `--hooks=local`
  (write `.claude/settings.local.json` instead) is **deferred and not implemented**; `init` refuses
  the flag by name rather than reading it as the directory argument.
- **The merge is vigiles's, and it is already public.** `mergeHooksJson` (vigiles
  `src/hook-install.ts:292`) is not in vigiles's `exports` map, but it is reachable as
  `claudeCodeHookProtocol.mergeRegistrations(existing, compiled, managedBy)` from the exported
  `vigiles/claude-code` entry (`src/adapters/claude-code/hook-protocol.ts:64-70`, re-exported at
  `src/claude-code.ts:66`). rpp already depends on vigiles. (Re-checked against the installed
  31.0.0 before building on it: the export and the signature
  `mergeRegistrations(existing, compiled, managedBy)` are unchanged.) Probe run 2026-09-23 against
  the installed vigiles 30.0.2, with `compiled` = the three entries from `plugin/hooks/hooks.json` and
  `managedBy = "node_modules/research-paper-pipeline/bin/rpp.mjs"`, over a settings object holding
  a user hook in the same `Edit|Write|MultiEdit` matcher plus a `permissions` block:

  ```
  rpp commands after 1st merge: 3  after 2nd: 3
  idempotent: true
  user hook kept: true  permissions kept: true
  ```

  Ownership is decided per **command** by the path token (quotes and `${CLAUDE_PROJECT_DIR}/`
  stripped), so a user's command sharing a matcher block survives — the defect that merge was
  written to fix. Because all three rpp commands share one path token, a hook renamed or removed in
  a later version is cleaned up by the next `init` (simple-git-hooks' "unused hooks removed").

- **`hooks.json` stays the one source of the wiring**; `init` reads it rather than a second copy.
- **Refuse to duplicate a hook wired under another spelling.** The owner's knowledge base wires the
  same three hooks through `vigiles … hook-runtime run-program …/hooks/<name>.hook.mjs`, not through
  `bin/rpp.mjs`. The merge above would not recognise those as rpp's and would add a second copy —
  and Claude Code dedupes only _identical_ handlers ("If you define the same handler in more than
  one settings file, it runs once. A plugin's or skill's copy of the same handler stays separate").
  So before merging, `init` checks every existing command for the three hook **names** under
  `node_modules/research-paper-pipeline/`; if any is found under a different spelling, it reports
  "already wired" and writes nothing.
- **`doctor` reads the file** and reports: wired / wired twice / not wired / wired via the plugin
  as well (the project's `enabledPlugins` can show the last one; a user-scope plugin it cannot see,
  and it should say so).
- **The plugin**: deprecate as the hook carrier. Keep the marketplace entry for one release so
  existing plugin users are not broken; `init` and `doctor` tell a plugin user to
  `/plugin uninstall`, because plugin + settings would run every hook twice (the docs quote above).
  The `/plugin` lines disappear from `nextSteps` (`src/init.ts:252-265`).

**What this does not solve, named so it is not mistaken for solved:**

- A **multi-repository** cloud session reads neither plugins nor `settings.json` hooks from the
  repositories ("starts above the clones and reads only the `enabledPlugins` and
  `extraKnownMarketplaces` keys … not permission rules, hooks" — [settings](https://code.claude.com/docs/en/settings)).
  No install route reaches it; that is the platform, not rpp.
- A **fresh clone before `npm install`**: the hook command names `node_modules/…/rpp.mjs`, which
  does not exist yet. This is identical under the plugin. vigiles has an explicit policy for it
  (`hookRuntimeMissingExit`: a gate fails closed, a nudge exits 0, `src/hook-install.ts:147-183`);
  whether rpp's emitted commands should adopt it is a separate question.

## 6. `rpp init` in two modes — a human at a terminal, or an agent/CI

### The convention, from three sources

- clig.dev: _"Only use prompts or interactive elements if `stdin` is an interactive terminal (a
  TTY)."_ · _"If `--no-input` is passed, don't prompt or do anything interactive."_ · _"Never
  *require* a prompt. Always provide a way of passing input with flags or arguments."_ —
  [clig.dev](https://clig.dev/)
- npm: `npm init -y` / `--yes` — _"skip the questionnaire altogether"_ —
  [npm-init](https://docs.npmjs.com/cli/v10/commands/npm-init)
- Vite: _"To create a project without interactive prompts, you can use the `--no-interactive`
  flag"_, and every answer has a flag (`--template vue`) — [vite guide](https://vite.dev/guide/)
- create-next-app: `--yes` — _"Use previous preferences or defaults for all options"_, and each
  prompt has a matching flag — [create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app)

`init` already follows half of this: it asks only when `process.stdin.isTTY`
(`src/init.ts:355`) and takes a stated default otherwise. Missing: a `--yes` flag, a check of
**stdout** too (an agent that pipes output has a TTY-less stdout), and the `CI` environment
variable. Proposed rule: _interactive = stdin is a TTY **and** stdout is a TTY **and** `CI` is
unset **and** no `--yes`._

### What `init` asks, and what it does without asking

| decision          | human at a terminal                                                                                         | agent / CI / `--yes`                                                                              | flag                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| papers directory  | asked only if several candidates (today)                                                                    | first candidate, said so (today)                                                                  | `init <dir>` then the key               |
| **hooks**         | "Wire the three paper hooks into `.claude/settings.json` (committed, shared)? **[Y/n]**"                    | **yes** — the guard is what the package is for, the edit is idempotent and shows up in `git diff` | `--no-hooks` (`--hooks=local` deferred) |
| CI workflow       | "Add a GitHub Actions workflow? **[y/N]**" (today)                                                          | **no** (today) — it writes into `.github/` and spends Actions minutes, which are metered          | `--ci` / `--no-ci`                      |
| first paper       | only when the papers dir holds no paper: "Create a first paper? name: [skip]" then "format: tex / md [tex]" | **no**, unless `--paper <name>` is given                                                          | `--paper <name> --format tex\|md`       |
| external programs | reported (today)                                                                                            | reported (today)                                                                                  | —                                       |

Why the hooks default is "yes" even without asking, while CI is "no": the rule `install.md` already
adopted from Playwright is _"ask only about what cannot be guessed or is expensive"_. Installing a
package whose purpose includes an edit guard makes "yes" guessable; a reviewable, idempotent edit
to one committed file is cheap. A workflow costs money on every push. husky's `init` edits
`package.json` without a single prompt for the same reason.

Every line `init` prints for a default it took names the flag that changes it — that output is
what an agent reads instead of a separate agent manual (next section).

## 7. One README or two?

**One README, and the difference between agent and human installs lives in the CLI's TTY
behaviour** — the coordinator's position holds. AGENTS.md defines itself as the file for agents
working **on** a repository: _"README.md files are for humans: quick starts, project descriptions,
and contribution guidelines. AGENTS.md complements this by containing the extra … context coding
agents need: build steps, tests, and conventions"_ ([agents.md](https://agents.md/)). An agent
_installing_ rpp into another project never reads rpp's AGENTS.md or CLAUDE.md; it reads the README
and the output of `rpp init`. llms.txt is likewise an index that _points at_ the human pages rather
than replacing them — _"The detail lives behind the links, and is fetched only when needed"_
([llmstxt.org](https://llmstxt.org/)). The one related move worth noting is create-next-app's
`--agents-md` (default on): it writes an AGENTS.md **into the new project**, i.e. into the consumer,
where that project's agents will read it. That is a possible later feature for `rpp init`, not an
argument for a second README here.

## 8. What the build did differently from this text

Recorded so the design and the code do not quietly disagree.

- **`rpp freeze` and `--hooks=local`: not built** (see the status block at the top).
- **The "another spelling" check covers more spellings than § 5 named.** Besides a
  `…/research-paper-pipeline/hooks/<name>.hook.mjs` path it recognises `npx rpp hook <name>`,
  `node_modules/.bin/rpp hook <name>`, and `rpp.mjs` reached by an **absolute** path — vigiles'
  merge owns only the relative `node_modules/research-paper-pipeline/bin/rpp.mjs` token, so each of
  those would otherwise be duplicated. A hand-wired project that is missing some hooks gets them
  named, and nothing written; `doctor` then gives that remedy instead of "run `rpp init`", which
  would loop.
- **The hook names are derived from `plugin/hooks/hooks.json`**, not listed a second time.
- **A second `init` does not rewrite the file at all** when the merge changes nothing — so an
  already-wired file in the user's own formatting stays byte-identical, not only equal as JSON.
- **`rpp doctor`'s hooks section is advisory** (it never changes the exit code): `--no-hooks` is a
  legitimate choice, and "wired twice" is a warning with the count. It reads
  `.claude/settings.json` only; a user-scope plugin it cannot see, and it says so.
- **The template lookup is per FILE**, not per directory: a project may override only
  `PIPELINE-STATUS.md` and still get the package's source stub. `{{name}}` is the one substitution.
- **A name starting with a dot is refused**, on top of the `[a-z0-9._-]+` charset: discovery skips
  dot-directories, so such a paper would be created and never linted. The same rule is why the
  override lives at `<papers>/.template/`; `rpp lint` additionally ignores that directory for
  ESLint (flat config does not skip dot-directories by default), and `detectPapers` no longer
  counts a `.template` child as a paper.
- **`rpp new` lints the new folder itself** (`rpp lint <papers>/<name>`), so the structure check —
  which looks at the subdirectories of the path it is given — does not run there; the folder was
  just made with the required files, so there is nothing for it to find.
- **Interactive `init` asks "Create a first paper? name: [skip]" and then the format** only when the
  name was given and `--format` was not.

## Sources checked

Fetched 2026-09-23:
[Hugo archetypes](https://gohugo.io/content-management/archetypes/) ·
[cargo new](https://doc.rust-lang.org/cargo/commands/cargo-new.html) ·
[Cargo workspaces](https://doc.rust-lang.org/cargo/reference/workspaces.html) ·
[Rust book 14.3](https://doc.rust-lang.org/book/ch14-03-cargo-workspaces.html) ·
[Quarto projects](https://quarto.org/docs/projects/quarto-projects.html) ·
[Quarto manuscripts](https://quarto.org/docs/manuscripts/authoring/vscode.html) ·
[Quarto freeze](https://quarto.org/docs/projects/code-execution.html) ·
[Astro content collections](https://docs.astro.build/en/guides/content-collections/) ·
[Eleventy directory data](https://www.11ty.dev/docs/data-template-dir/) ·
[ESLint config files](https://eslint.org/docs/latest/use/configure/configuration-files) ·
[Vale .vale.ini](https://docs.vale.sh/topics/.vale.ini.md) ·
[markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2) ·
[changesets](https://github.com/changesets/changesets/blob/main/docs/adding-a-changeset.md) ·
[release-please manifest](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md) ·
[Claude Code hooks](https://code.claude.com/docs/en/hooks) ·
[Claude Code settings](https://code.claude.com/docs/en/settings) ·
[Claude Code cloud environments](https://code.claude.com/docs/en/cloud-environments) ·
[husky](https://typicode.github.io/husky/get-started.html) ·
[simple-git-hooks](https://github.com/toplenboren/simple-git-hooks) ·
[lefthook install](https://lefthook.dev/usage/commands/install/) ·
[lefthook npm](https://lefthook.dev/installation/node/) ·
[pre-commit](https://pre-commit.com/) ·
[clig.dev](https://clig.dev/) ·
[npm init](https://docs.npmjs.com/cli/v10/commands/npm-init) ·
[Vite guide](https://vite.dev/guide/) ·
[create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app) ·
[AGENTS.md](https://agents.md/) ·
[llms.txt](https://llmstxt.org/)

Not verified from a primary page: whether Cargo skips editing `members` when a glob already covers
the new path (the Rust book states the auto-add; the glob case was not found), and lefthook's `.old`
backup (seen only in search snippets; the fetched `install` page does not state it).
