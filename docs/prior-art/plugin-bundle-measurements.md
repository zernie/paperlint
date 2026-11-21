# Can the hooks run from a plugin with no `node_modules`? Measured

Measured 2026-11-21 on Node 22, Linux x64, paperlint at 6882efa (the published 18.6.0 for the
install timing), esbuild 0.25.12. It answers the questions [plugin-delivery.md](plugin-delivery.md)
left as reading: which dependencies each hook needs and when, whether a bundle removes the 60-second
dependency install, and what a bundle breaks. The research on how other plugins do it is
[plugin-heavy-deps-research.md](plugin-heavy-deps-research.md).

## Verdict

1. **Every hook loads the whole CLI today: 104 packages, 787 files**, because each one starts at
   `dist/cli.js`, which imports everything. A hook needs far less, but nothing separates it.
2. **The 60-second install is not the blocker it looked like.** A cold-cache production install of
   paperlint 18.6.0 took **16.7 s** here (197 packages, 180 MB). A slow laptop network could still
   miss 60 s; this container's could not.
3. **A bundle removes the install entirely.** Five of the six hooks ran from esbuild bundles in a
   consumer with no `node_modules`, and gave the same verdicts as the installed package, firing and
   quiet. The sixth needs a one-line change (below).
4. **A bundle breaks four things, all fixable in this repository**, and two that only a layout
   fixes. They are the table under "What broke".
5. **None of this changes cloud sessions**: what loads there is the clone (plugin-delivery.md, 5a–5d).
   An account-saved plugin is the open question, and only a save from the person's account answers
   it (end of this file).

## 1. What each hook loads today

A Node resolve hook (`module.register`) logged every URL each hook resolved. It was passed through
`NODE_OPTIONS`, so a hook spawned through the vigiles runtime was traced too. The consumer was a
throwaway git repository with one paper, `papers/p/` (`paper.tex`, `paperlint.json` turning
`tex/max-sentence-words` on, `PIPELINE-STATUS.md`), and `node_modules/paperlint` linked to this
checkout.

| hook                  | event            | exit | wall time      | files | packages |
| --------------------- | ---------------- | ---- | -------------- | ----- | -------- |
| `paper-edit-guard`    | PreToolUse Bash  | 0    | 4056 ms (cold) | 788   | 104      |
| `submission-confirm`  | PreToolUse Bash  | 0    | 922 ms         | 787   | 104      |
| `paper-folder-layout` | PreToolUse Write | 0    | 911 ms         | 787   | 104      |
| `paper-skills-nudge`  | PostToolUse Read | 0    | 1242 ms        | 789   | 104      |
| `paper-status-gates`  | PostToolUse Edit | 0    | 1238 ms        | 789   | 104      |
| `lint-edited`         | PostToolUse Edit | 0    | 849 ms         | 787   | 104      |

The 104 packages are the same for every hook: eslint, `@eslint/markdown`, the 18
`@unified-latex/*` packages, the micromark and mdast families, ajv, zod, remeda, vigiles, mp4box,
srt-parser-2, katex and their own dependencies. `typescript` and `unpdf` are not among them: only
`paperlint build` and the PDF readers load those.

Three hooks run inside the CLI's process (`IN_PROCESS_HOOKS` in `src/cli.ts`: `lint-edited`,
`paper-folder-layout`, `submission-confirm`). The other three are `hooks/<name>.hook.mjs` files that
the CLI hands to `vigiles hook-runtime run-program`, in a second Node process.

## 2. How long a production install takes

```sh
npm install paperlint@18.6.0 --omit=dev --ignore-scripts --no-audit --no-fund --cache <empty dir>
```

| measure                    | value                                                                       |
| -------------------------- | --------------------------------------------------------------------------- |
| wall time, empty cache     | **16.7 s**                                                                  |
| packages in `node_modules` | 197                                                                         |
| size on disk               | 180 MB                                                                      |
| largest                    | vigiles 30 MB, typescript 24 MB, `@vscode` 22 MB, paperlint 19 MB, zod 9 MB |

This is the install a plugin's automatic `npm ci` would run, without the lockfile it needs. One
machine, one network: it shows the limit is not crossed by the tree's size alone, not that no
author's network crosses it.

## 3. The bundle, and what broke

Bundles built:

```sh
# the three in-process hooks: an entry that calls runHook, and nothing else
esbuild hook-entry.mjs --bundle --platform=node --format=esm --target=node22 \
  --external:jiti --external:@ast-grep/napi \
  --banner:js="import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import { dirname as __dn } from 'node:path'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);" \
  --outfile=plug/dist/hook.mjs
# each file hook, with its vigiles imports inlined
esbuild hooks/<name>.hook.mjs --bundle --platform=node --format=esm ... --outfile=plug/hooks/<name>.hook.mjs
# the vigiles runtime the CLI spawns
esbuild node_modules/vigiles/dist/cli.js --bundle --platform=node --format=cjs ... --outfile=plug/node_modules/vigiles/dist/cli.js
```

`hook-entry.mjs`:

```js
import { readFileSync } from "node:fs";
import { runHook } from "<paperlint>/dist/cli.js";
process.exitCode = await runHook(process.argv[3], {
  stdin: () => readFileSync(0, "utf8"),
});
```

Each defect below was seen, then fixed in the experiment, then the hooks were run again.

| #   | what broke                                                                                                   | seen as                                                                          | class                                                                                                               | fixed in the experiment by                                                                                                                                                                   | the fix in this repository                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `jiti` (ESLint's loader for TypeScript configs) and `@ast-grep/napi` (a native `.node` binary, from vigiles) | esbuild: `Could not resolve "jiti"`, `No loader is configured for ".node" files` | optional or native dependency                                                                                       | `--external` for both                                                                                                                                                                        | the same; no hook reaches either                                                                                                                                                                    |
| 2   | `bin/paperlint.mjs` refuses to start                                                                         | `paperlint: not built — …/dist/cli.js missing`                                   | a guard that checks a file, not a capability                                                                        | an entry that calls `runHook`                                                                                                                                                                | a bundle entry of its own                                                                                                                                                                           |
| 3   | `verify-cites.mjs`'s `main()` runs inside every hook                                                         | `error: could not read input — ENOENT … open 'hook'`                             | `isMain(import.meta.url)`: in a bundle every module has the bundle's URL, so every main guard is true               | a launcher file, so `argv[1]` is not the bundle                                                                                                                                              | 8 files carry such a guard; a hook bundle must not import a script with one, or the guard must compare something a bundle keeps apart                                                               |
| 4   | a schema read beside its module                                                                              | `ENOENT … bin/review-frontmatter.schema.json`                                    | data read relative to `import.meta.url`                                                                             | the bundle in `dist/`, the data folders at the root beside it                                                                                                                                | 10 such reads in `dist/`; 8 are `../X` from `dist/`, the package root, so a bundle in `dist/` with the folders the package already ships keeps them; the two `./X.schema.json` are copied beside it |
| 5   | `lint-edited` did not run: `__dirname is not defined`                                                        | one stderr line, exit 0, **and no block**                                        | CommonJS code inside an ES-module bundle                                                                            | `__filename` and `__dirname` in the banner                                                                                                                                                   | the same banner                                                                                                                                                                                     |
| 6   | `lint-edited` did not run: `There was a problem loading formatter: …/cli-engine/formatters/stylish.js`       | as 5                                                                             | ESLint loads its formatter by a path relative to its own folder, and that file `require`s `../../shared/text-table` | ESLint's `lib/cli-engine/formatters/` and `lib/shared/` copied beside the bundle (136 KB), each with `{"type":"commonjs"}`, because the plugin root's `package.json` says `"type": "module"` | pass a formatter function, not a name, so ESLint loads no file                                                                                                                                      |
| 7   | `paper-status-gates` exits 127                                                                               | `Cannot find module 'paperlint/hooks/paper-status-gates.sh'`                     | the hook finds its own script through the CONSUMER's `node_modules` (`hooks/paper-status-gates.hook.mjs`, line 137) | not fixed                                                                                                                                                                                    | resolve the script from the hook's own location                                                                                                                                                     |

Defects 5 and 6 are the dangerous kind: `lint-edited` is "never in the way", so a hook that cannot
run says one stderr line and exits 0. On a clean edit it looks the same as a hook that works. Only
the planted defect showed it.

## 4. The bundled hooks against the installed ones

Same consumer, `node_modules` removed. Each row is one payload run through both.

| hook                  | payload                                                | installed                                                 | bundle                                                                                                    |
| --------------------- | ------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `paper-folder-layout` | Write `papers/p/stray.md`                              | deny: "`stray.md` is at the root of a paper folder"       | the same deny                                                                                             |
| `submission-confirm`  | Bash `ls papers/p`                                     | quiet                                                     | quiet                                                                                                     |
| `submission-confirm`  | Bash `npx paperlint submission update papers/p --save` | —                                                         | deny: "Not run: this sends the paper to the venue's portal, and paperlint cannot find the PDF it uploads" |
| `lint-edited`         | Edit writing a 64-word sentence (snapshot cleared)     | block: "a sentence of 64 words, over 55"                  | the same block                                                                                            |
| `lint-edited`         | Edit writing `Short one.`                              | quiet                                                     | quiet                                                                                                     |
| `paper-edit-guard`    | Bash `echo x > papers/p/paper.tex`                     | exit 2                                                    | exit 2                                                                                                    |
| `paper-edit-guard`    | Bash `mv papers/p/paper.tex /tmp/elsewhere.md`         | exit 2                                                    | exit 2                                                                                                    |
| `paper-edit-guard`    | Bash `ls papers/p`                                     | exit 0                                                    | exit 0                                                                                                    |
| `paper-skills-nudge`  | Read `papers/p/paper.tex`                              | "📄 Working on paper "p"…"                                | the same text                                                                                             |
| `paper-status-gates`  | Edit `papers/p/paper.tex`                              | "PIPELINE-STATUS.md has NO '**Readiness verdict:**' line" | exit 127 (defect 7)                                                                                       |

`lint-edited` keeps the errors of its last run in `<paper>/_build/edit-lint.json` and blocks only on
an error that is new. A second run on the same text is quiet by design, so every planted run here
started with that file removed.

## 5. Size and time of the bundle

| part                                                         | size      | gzip   |
| ------------------------------------------------------------ | --------- | ------ |
| `dist/hook.mjs` (the three in-process hooks, unminified)     | 16 MB     | 2.8 MB |
| `node_modules/vigiles/dist/cli.js` (the runtime, unminified) | 25 MB     | 4.2 MB |
| `hooks/*.hook.mjs`, three bundles                            | 9.5 MB    | —      |
| ESLint's formatters and `shared/`                            | 136 KB    | —      |
| the plugin folder in all                                     | **51 MB** | —      |

Warm wall time per call, from the bundle: the in-process hooks **0.46–0.59 s** (installed: 0.85–0.92
s); the file hooks **1.78–1.87 s** (installed: 1.24 s). The file hooks got slower because the
bundled vigiles `cli.js` is one 25 MB file: vigiles keeps its bin import-free so that a hook loads
only `hook-program.js`, and bundling the bin throws that away. A bundle of the hook runtime alone
would keep it.

## 6. Mods: what the docs of this build say

A mod is a plugin whose `hooks/hooks.json` names a hooks module (`register(on)`), run by the engine
in its own sandbox with no Node and no DOM; it reaches files and processes through `$.fs` and
`$.process`. From this build's plugin-authoring reference and `claude-code.d.ts` (Claude Code
2.1.330):

| question                                              | answer                                                                                                                                                | where                                                                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| block a tool call before it runs, like PreToolUse     | yes: `on('tool.call', { tool }, hook)` returning `{ deny }`                                                                                           | SKILL.md table; `'tool.call': ToolCallInput`                                                                      |
| add context after a tool call                         | yes: the settings events are hookable as `classic.<Event>`, and PostToolUse's result takes `additionalContext`                                        | reference.md "What a plugin of function hooks is"; `PostToolUse: 'additionalContext' \| 'updatedToolOutput' \| …` |
| run a program                                         | yes: `$.process.spawn({ argv })`                                                                                                                      | `claude-code.d.ts`                                                                                                |
| one plugin with a module AND command hooks AND skills | yes: a refused plugin loses "its hooks module, command hooks, MCP servers, LSP servers, skills, commands, agents…", so one plugin carries all of them | `plugin.register` input doc                                                                                       |
| a saved plugin with `bin/`                            | refused: "a plugin with a `bin/` folder is refused"                                                                                                   | reference.md "Packaging a mod in a chat", step 4                                                                  |

So a mod could carry these hooks: a `tool.call` hook spawning `node ${plugin root}/dist/hook.mjs`,
or the plain command hooks in the same plugin. The question that decides it is not what a mod can
do but whether it reaches a cloud session at all.

## 7. Does an account-saved plugin reach a cloud session?

Seen in one cloud session on 2026-11-21:

```text
$ ls -la ~/.claude/plugins/synced
-rw-r--r-- … Nov 10 22:56 .bucket-<org id>_<account id>
drwxr-xr-x … Nov 10 22:56 <org id>_<account id>        (empty)
```

`ListPlugins` (the account's enabled plugins) returned `{"results":[]}`. So the container has a
synced-plugins folder keyed to the account, made when the container was, and it is empty because
the account has no saved plugin. That is evidence the channel exists here, not that a saved plugin
loads: the docs list synced plugins for terminal and Cowork sessions only.

The two open issues say it depends on how the session started (read 2026-11-21, no maintainer
reply on either):

- anthropics/claude-code#92031, "Account-level plugins never sync to Claude Code on the web
  (plugins_sync count: 0) while account skills sync fine", opened 2026-09-04: the body's log reads
  "[DEBUG] Registered 0 hooks from 0 plugins". A user's comment of 2026-11-18 gives a table by
  session origin: for the desktop app, `claude --cloud` and routines, "Loaded before the first
  turn, SessionStart hooks ran"; for a session created by another cloud session's tool, "None",
  and "the synced plugins folder is created (with its `.bucket-*` marker) but stays empty".
- anthropics/claude-code#103409, "Plugins synced into new claude.ai cloud conversations never load
  (hooks and agents missing)", opened 2026-10-19: "Plugins load before the first sync finishes, and
  the downloaded plugin is never loaded." / "The plugin files ARE present in
  ~/.claude/plugins/synced/.../router-probe/."

The research note's line that "open issues show synced plugins never loading on claude.ai/code"
is wider than these: the 2026-11-18 table reports origins where they load. These are user reports,
not documentation.

The test that settles it: save one small plugin to the account (a `.plugin` file's Save plugin, then
Continue, from a desktop browser or the desktop app), start a new cloud session, and check that
`~/.claude/plugins/synced/<org>_<account>/` holds it and that its hook or system-prompt line is
there.

## 8. Does a plugin load from configuration alone, with nobody clicking?

Measured 2026-11-21 with Claude Code 2.1.330 (`claude -p`), in throwaway git repositories with a
throwaway `HOME`. The probe plugin's only part is a SessionStart command hook that writes a marker
file. Each run made one small model call.

| route | how                                                                                                                                                                               | marker     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A     | `CLAUDE_CODE_PLUGIN_DIRS=<plugin folder>` in the environment                                                                                                                      | ✅ written |
| B     | the repository's `.claude/settings.json` declares a marketplace inside the repository (`extraKnownMarketplaces`, a `directory` source) and turns the plugin on (`enabledPlugins`) | ❌ absent  |
| C     | control: no plugin                                                                                                                                                                | ❌ absent  |
| D     | `claude plugin marketplace add <repo>` and `claude plugin install probe@local` from a shell, then a new session                                                                   | ✅ written |

B fails as the install docs say: "Committing that entry turns the plugin on for your collaborators
but doesn't download it to their machines", and each collaborator "runs `claude plugin install
<name>@<marketplace> --scope project` once per clone"
(https://code.claude.com/docs/en/plugins/install). In D the hook that ran was the repository's own
copy, not the cache's: a plugin from a marketplace added from a local folder, with a relative
source, is read from that folder.

A and D need no click and no claude.ai account. A cloud session runs its environment's setup
script before Claude starts, so a setup script that runs D, or writes A's variable into the
`env` block of `~/.claude/settings.json`, should load the plugin there. That has not been run in a
cloud session yet.

What the mods docs say about cloud sessions (read 2026-11-21): the install page, "A cloud session,
including the browser at claude.ai/code, has no plugin browser and doesn't load the plugins you
installed on your own machine or the ones your repository's `.claude/settings.json` turns on"; the
mods overview's cloud row, "Yes, for a plugin that reaches the cloud session" and "Not in every
session" (https://code.claude.com/docs/en/plugins/mods/overview). Mods are on by default from
v2.1.286; the overview's only early-access line is "If you set `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`
during early access, remove it."

### In a cloud session: measured 2026-11-21

The cloud environment's setup script ran a section that wrote the probe plugin to
`/opt/plugin-probe` and ran `claude plugin marketplace add` and `claude plugin install` (route D).
Fresh cloud sessions on that environment then reported, verbatim:

```text
$ cat /tmp/plugin-probe-setup.log
claude: /opt/node22/bin/claude 2.1.330 (Claude Code)
Adding marketplace…√ Successfully added marketplace: probe-local (declared in user settings)
Installing plugin "probe@probe-local"...√ Successfully installed plugin: probe@probe-local (scope: user)
plugin probe installed

$ cat /tmp/plugin-probe-sessionstart
2026-11-21T21:41:10Z
2026-11-21T21:50:43Z

$ claude plugin list
  > probe@probe-local
    Version: 0.1.0
    Read from: /opt/plugin-probe/plugins/probe
    Scope: user
    Status: √ enabled
```

and its skill list held the line "- probe:plugin-probe: Probe skill from the setup-script plugin
test. Never use it." So a plugin installed by the setup script loads in a cloud session: its
SessionStart hook ran at two session starts in the same container (21:41 and 21:50, one install at
21:41), and its skill was listed under the plugin's namespace.
