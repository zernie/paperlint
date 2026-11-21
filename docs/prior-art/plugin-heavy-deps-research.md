# Shipping a heavy-dependency npm CLI inside a Claude Code plugin: prior art

Research date: 2026-11-21. Method: WebFetch of code.claude.com docs, GitHub code/issue search, raw file reads. Quotes are verbatim from the fetched text. Anything marked UNVERIFIED was not confirmed from a primary source.

Our package: npm CLI, ~22 runtime deps (eslint, typescript, unpdf, zod, remeda, unified-latex parsers, ajv, markdown-it, vigiles, ...), 3-6 hooks, ~30 skills with helper `.mjs` scripts.

## Summary of findings

1. Automatic `npm ci` exists but has hard limits (60 s, no scripts, lockfile in the tarball). On failure the plugin still loads without `node_modules`. A heavy dep tree (eslint + typescript + unpdf) is the case where the 60 s limit is most likely to bite (UNVERIFIED for our tree; nobody has measured it in the sources found).
2. The pattern that survives "no node_modules, any environment" is a committed esbuild bundle (`dist/*.js`/`.cjs`) that `require`s only Node builtins. Seen in ai-sdlc, OpenThrottle, context-mode, claude-mem, memvid.
3. The SessionStart-installs-into-`${CLAUDE_PLUGIN_DATA}` pattern is the documented one and is used in the wild (narai-primitives, linq-team imessage channel). Known problem: first-run race (hook runs before the install it depends on has finished; hook timeouts).
4. In cloud (web) sessions the docs say plugins from repo `enabledPlugins` and user-scoped plugins do NOT load. For `@synced` plugins the docs list Cowork and terminal only; web is not mentioned. Open issues show synced plugins never loading on claude.ai/code. Do not rely on any plugin being present in a cloud session.
   - _Corrected 2026-11-21 on re-reading #92031:_ "never" is too wide. A user's comment there (2026-11-18) reports synced plugins loading, SessionStart hooks included, in cloud sessions started from the desktop app, `claude --cloud` and routines, and an empty synced folder in sessions created by another session's tool. Quotes in [plugin-bundle-measurements.md](plugin-bundle-measurements.md), section 7.
5. ESLint: no example found of bundling ESLint with plugin-by-name loading into one file. Plugins that run ESLint call the project's own (`npx --no-install eslint`, or `$PKG_RUNNER eslint` after checking the project has an eslint config).

---

## 3. Do plugins load in Claude Code on the web / cloud sessions?

(Answered first because it decides the design.)

### Repo-declared and user-scoped plugins: NO

Source: https://code.claude.com/docs/en/cloud-environments (section "What carries over from your setup").

> | Plugins and marketplaces declared in your repo's `.claude/settings.json` | No | A cloud session doesn't install the plugins a repository turns on under [`enabledPlugins`](...), including ones from the marketplaces it lists under [`extraKnownMarketplaces`](...) |

> | Plugins enabled only in your user settings | No | User-scoped `enabledPlugins` lives in `~/.claude/settings.json` on your machine |

Source: https://code.claude.com/docs/en/plugins/loading (section "Plugins shared through a repository"):

> A cloud session doesn't add the marketplaces a repository lists under [`extraKnownMarketplaces`](...), because that requires the workspace trust dialog, which a cloud session never shows.

Source: https://code.claude.com/docs/en/settings (section "Settings in cloud sessions"):

> **Shared project settings with several repositories**: in an Anthropic-hosted environment, a session with several repositories starts above the clones and reads only the `enabledPlugins` and `extraKnownMarketplaces` keys from each repository's `.claude/settings.json`, not permission rules, hooks, `env`, or other keys. The marketplaces and plugins those two keys declare still [don't load in a cloud session](...).

### What DOES load in cloud: repo `.claude/skills/`, repo `.claude/settings.json` hooks (one repo)

Source: https://code.claude.com/docs/en/cloud-environments:

> | Your repo's `.claude/settings.json` hooks and permission rules | Yes, in a session with one repository | Part of the clone. ...

> | Your repo's `.claude/skills/`, `.claude/agents/`, `.claude/commands/` | Yes | Part of the clone |

> | Your user `~/.claude/skills/`, `~/.claude/agents/`, `~/.claude/commands/` | No | Live on your machine, not in the repo. Commit them to the repo's `.claude/` directory instead. Cloud sessions automatically load [skills you enable on claude.ai](...) |

Source: https://code.claude.com/docs/en/settings, "Settings in cloud sessions": "**User and project local settings** (`~/.claude/settings.json` and `.claude/settings.local.json`): not read."

Also from cloud-environments: "**SessionStart hooks**: ... **One repository per session**: in an Anthropic-hosted environment, a session with several repositories doesn't load hooks from any repository's `.claude/settings.json`" and "**Requires network access**: install commands need to reach package registries. If your environment uses **None** network access, these hooks fail."

Setup-script alternative (cached): "Use a setup script to provision the VM itself ... Use a [SessionStart hook] for project setup that should run everywhere, cloud and local, like `npm install`." and "keep the script's total runtime under roughly five minutes so the environment cache can build."

### `@synced` (claude.ai account) plugins: docs list terminal and Cowork; web NOT IN DOCS

Source: https://code.claude.com/docs/en/plugins/loading (section "Plugins synced from claude.ai"):

> A plugin you turn on for your claude.ai account also loads in Claude Code, alongside the plugins you install from marketplaces. ... Each of these plugins loads as `<name>@synced`, with no marketplace and no install record.

> In terminal sessions, a synced plugin's skills, agents, hooks, MCP servers, and LSP servers all load, with the same trust as a marketplace plugin you installed.

> Synced plugins load in Cowork sessions and in terminal sessions where you sign in with your claude.ai account:
>
> - **Cowork**: Claude Code downloads them into the session's own environment when the session starts
> - **Terminal sessions**: each time you start Claude Code, it syncs once in the background ... Syncing in terminal sessions requires Claude Code v2.1.273 or later

Not synced in terminal when: "A session where `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, or an `apiKeyHelper` script supplies the credential", "A session in bare mode", etc.

Claude Code on the web page (https://code.claude.com/docs/en/claude-code-on-the-web): the only plugin text found is "Plugin suggestions in the conversation": "Select **Add** on a plugin to turn it on for your claude.ai account, where it stays on after the session ends." and "Commands that only run in the terminal interface, such as `/plugin` or `/resume`, aren't available." The page does NOT say that synced plugins (or their hooks) load in web cloud sessions. Verdict: NOT IN DOCS for claude.ai/code web specifically; the loading page says "Cowork" and "terminal".

The cloud-environments page does say skills sync ("Cloud sessions automatically load skills you enable on claude.ai") but says nothing equivalent for plugins.

### Issues that contradict "synced plugins load in cloud"

Fetched via WebFetch (the `gh api` route to anthropics/claude-code issue bodies is blocked in this session; issue search listing worked).

- https://github.com/anthropics/claude-code/issues/103409 (open, labels `area:plugins`, `has repro`, `area:claude-code-web`): "[BUG] Plugins synced into new claude.ai cloud conversations never load (hooks and agents missing)". Body: "The plugin files ARE present in ~/.claude/plugins/synced/.../router-probe/." and "Plugins load before the first sync finishes, and the downloaded plugin is never loaded." Contrast: "in a conversation whose disk already had the plugin (plugins_sync_no_changes, had_manifest: true), hooks load at startup". Comment: "Anthropic's own hookify plugin (claude-plugins-official) reproduces it". No maintainer reply. Claude Code 2.1.302.
- https://github.com/anthropics/claude-code/issues/92031 (open): "[BUG] Account-level plugins never sync to Claude Code on the web (plugins_sync count: 0) while account skills sync fine". Body: "Plugins installed at the account level ... never reach Claude Code on the web / remote cloud sessions." and "Account-level SKILLS sync into the same session correctly, so the transport works. Only the plugin half comes back empty." Commenter (2.1.327, Nov 18): plugins load for "sessions started from the desktop app, `claude --cloud`, and claude.ai routines", not for sessions created by another cloud session's MCP tool; "It stayed that way on later turns, so it's not a timing race." Another commenter quotes the docs as saying the opposite ("In Cowork and cloud sessions, Claude Code downloads them into the session's own environment when the session starts"); that wording is not in the current page text I fetched.
- https://github.com/anthropics/claude-code/issues/78119 (open): "[BUG] Repo-committed extraKnownMarketplaces + enabledPlugins never processed in claude.ai/code cloud sandboxes (hooks from the same settings.json work)". Body: "The `hooks` key from this file IS honored ... The `extraKnownMarketplaces` key is never processed: `~/.claude/plugins/known_marketplaces.json` does not exist at any point in the session." This matches the docs table above.
- Titles only (not opened): #88248 "Org-plugin 'Installed by Default' plugins missing from a fresh Claude Code on the web session", #93857 "Org-required plugin marketplaces are not resolved in web, mobile or remote sessions", #107077 "Cowork cloud sessions keep launching in a 'deprecated mode' (tool server only): plugin hooks and slash commands never run". UNVERIFIED beyond titles.
- First-run SessionStart race (older, closed as not planned): https://github.com/anthropics/claude-code/issues/10997 "[BUG] SessionStart hooks don't execute on first run with GitHub marketplace plugins" (v2.0.32): "The SessionStart hook fires before the asynchronous marketplace fetch completes on first run." Reporter: "prevents me from using plugins in a variety of environments, including Claude Code on the web."

Implication for paperlint: in a cloud session the reliable carrier is the repo itself (`.claude/skills/`, `.claude/settings.json` hooks, `npm install` as a devDependency or a setup script), not a plugin. A plugin can be an additive channel for terminal users only.

---

## 2. GitHub issues on anthropics/claude-code: dependency install, timeout, missing node_modules

- https://github.com/anthropics/claude-code/issues/84939 (closed as completed Aug 11, locked): "Docs: plugin installation silently runs `bun install`/`npm ci` — automatic dependency installation is undocumented". Quotes: "Installing the `qmd` plugin 'produced a cache directory of ~230 MB / 9,000+ items ... 212 MB of which is a `node_modules` created by an automatic `bun install` within a minute of install. No user or session ran the install.'" and "The install runs with a 60-second timeout; `--ignore-scripts` means no lifecycle/postinstall scripts execute." and "`yarn-test` was 'silently skipped; `plugin install` still reports success with no warning shown to the user.'" Resolution: the docs section "Node.js package dependencies" now covers it (confirmed by reporter Aug 12).
- https://github.com/anthropics/claude-code/issues/87603 (closed "not planned" by stale bot, Sep 21): "[BUG] npm-distributed plugins fail to resolve dependencies — cache directory lacks node_modules". Quote: "When the plugin executes from the cache directory, Node.js cannot resolve bare module imports ... because there's no `node_modules` in the resolution path." Log: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'clibuilder' imported from ~/.claude/plugins/cache/cyberplace/buddy-agent-harness/0.6.0/dist/cli.mjs`. Version 2.1.234, source type `npm`. No maintainer reply. (Predates or is independent of the current docs; whether it still reproduces is UNVERIFIED.)
- https://github.com/anthropics/claude-code/issues/103960 (open, title only): "[BUG] Plugin dependency installer warns for optional peerDependencies when package.json has overrides". Not opened. UNVERIFIED body.
- Titles only: #47634 "[DOCS] Plugin marketplace docs missing dependency auto-install behavior" (closed), #51398 "Cowork Desktop: ${CLAUDE_PLUGIN_DATA} is not persistent across conversations (MCP plugin tokens lost on every new conversation)" (closed). Not opened.
- No issue found that reports the 60 s timeout actually being hit by a real plugin (searches: "plugin dependency install timed out 60" returned unrelated results). UNVERIFIED that anyone has hit it.

Official troubleshooting text (https://code.claude.com/docs/en/plugins/troubleshooting.md, "The packages it lists are not installed"):

> `/plugin` and `claude plugin list` show one of these notes on a plugin whose dependency install left no `node_modules` directory. The plugin loads, but the parts that need the missing packages may not work.
>
> - **`are not installed`**: the install can run for this plugin but didn't finish, for example because it failed or timed out. To retry the install, run the `claude plugin update` command that the note gives ...

Official limits (https://code.claude.com/docs/en/plugins/loading, "Limits on the dependency install"): "**60-second timeout**: Claude Code stops an install that runs longer and treats it as failed"; "**No lifecycle scripts**"; "**Registry packages only**"; "**No overrides or patches**: a plugin whose `package.json` sets npm `overrides` gets no install from an npm lockfile"; "You can't turn the automatic install off." And: "When the automatic install can't provide a dependency, install it from a hook into the persistent data directory."

Also: in-place (local-path marketplace) plugins get no install: "For a relative-path plugin loaded in place from a marketplace you added from a local path, Claude Code doesn't install the dependencies into the source directory."

---

## 1. How plugin authors ship JS with heavy deps (real examples)

Raw files were read from raw.githubusercontent.com on the default branch on 2026-11-21.

### Pattern A: committed prebuilt bundle (esbuild/bun build), zero node_modules

Works without the 60 s install, offline, in any environment where the repo or plugin is present.

- ai-sdlc-framework/ai-sdlc, `ai-sdlc-plugin/mcp-server/scripts/bundle.mjs` (https://github.com/ai-sdlc-framework/ai-sdlc/blob/main/ai-sdlc-plugin/mcp-server/scripts/bundle.mjs). Header comment, verbatim: "When the marketplace clones the plugin source it does NOT run `pnpm install`, so `node_modules/` is absent. A plain `tsc` build emits ESM imports that resolve at runtime against `node_modules` — which fails silently in the marketplace clone and leaves SessionStart, PreToolUse, PostToolUse hooks plus every `/ai-sdlc:*` MCP tool returning skill text only (AISDLC-75). Esbuild rolls every runtime dep (`@modelcontextprotocol/sdk`, `zod`, etc.) into one file so `node dist/bin.js` works with zero installed packages. We commit the bundled artifact (see .gitignore exception) and CI gates that the committed bundle is fresh + still self-contained."
- OpenThrottle/monorepo, `packages/agentic-hooks/scripts/bundle-hooks.ts` (https://github.com/OpenThrottle/monorepo/blob/main/packages/agentic-hooks/scripts/bundle-hooks.ts). Verbatim: "bundles each one into a self-contained CommonJS `.cjs` under its payload's `dist/`. The bundle `require`s nothing outside node builtins — the neutral core is inlined — so hooks run as bare `node x.cjs` with no `node_modules`." and the `--check` mode: "regenerate in-memory and diff against the committed files; exit non-zero on any drift". Deterministic build (pinned esbuild, `minify:false`, no timestamp banner) so the drift check is byte-stable.
- thedotmack/claude-mem, `plugin/scripts/mcp-server.cjs` (948,460 bytes at https://raw.githubusercontent.com/thedotmack/claude-mem/main/plugin/scripts/mcp-server.cjs), loaded by `plugin/.mcp.json` via a `node -e` locator. Note: claude-mem ALSO has `plugin/package.json` "Runtime dependencies for claude-mem bundled hooks" with `sharp`, `better-auth`, many `tree-sitter-*` grammars: the bundle covers pure-JS code, native/heavy packages are installed separately. Shows the limit of the bundle approach (native modules cannot be bundled).
- memvid/claude-brain, `.gitignore` line 4-5: "# Build output (dist is included for GitHub plugin installation)" then `# dist/` (commented out). `hooks/hooks.json` runs `node "${CLAUDE_PLUGIN_ROOT}/dist/hooks/session-start.js"`. Its `dist/hooks/smart-install.js` runs `npm install --production` with `timeout: 12e4` (2 minutes) in a hook, i.e. a hybrid: committed dist plus a runtime install of the one native dep (`@memvid/sdk`).
- mksglu/context-mode, `docs/architecture/DEVIATIONS.md` (https://github.com/mksglu/context-mode/blob/main/docs/architecture/DEVIATIONS.md), entry D-TOML-PARSER-1: "devDependency toml-eslint-parser 1.0.3, bundled by esbuild; the npm package still has no dependencies". Also records that Claude Code "copies the plugin to `plugins/cache/<marketplace>/context-mode/<version>`".
- kenryu42/cc-safety-net: `hooks/hooks.json` runs `node "${CLAUDE_PLUGIN_ROOT}/dist/bin/cc-safety-net.js" hook --coding-cli`; `package.json` build is `bun run clean && bun scripts/project-bun.ts scripts/build.ts`. That `dist/` is committed was NOT confirmed (the `.gitignore` excerpt I read did not mention `dist`). UNVERIFIED whether the bundle is single-file.

Known problems of Pattern A: bundle size in git (claude-mem's single file is ~0.9 MB); needs a CI freshness gate (OpenThrottle, ai-sdlc both added one); native modules and anything that loads code by name at runtime (see section 4) do not bundle cleanly; `dist` must be exempted from `.gitignore` for git-source plugins (memvid comment).

### Pattern B: SessionStart hook runs `npm install` into `${CLAUDE_PLUGIN_DATA}` (the documented pattern)

Documented at https://code.claude.com/docs/en/plugins/components ("Install dependencies into the data directory"):

> `diff -q "${CLAUDE_PLUGIN_ROOT}/package.json" "${CLAUDE_PLUGIN_DATA}/package.json" >/dev/null 2>&1 || (cd "${CLAUDE_PLUGIN_DATA}" && cp "${CLAUDE_PLUGIN_ROOT}/package.json" . && npm install) || rm -f "${CLAUDE_PLUGIN_DATA}/package.json"`

> After the first session, `~/.claude/plugins/data/<id>/node_modules` exists. An MCP server can then set `NODE_PATH` to `${CLAUDE_PLUGIN_DATA}/node_modules` in its `env`.

Real repos:

- narailabs/narai-primitives, `plugins/github-connector/hooks/hooks.json` (and sibling db/git/aws/gcp/jira/linear/gitlab connectors): the SessionStart command is the documented diff/npm install with `--no-audit --no-fund` and `mkdir -p`, followed in the same hook list by `node "${CLAUDE_PLUGIN_DATA}/node_modules/narai-primitives/plugin-hooks/dispatcher.mjs" session-start`; PreToolUse/PostToolUse hooks also run that dispatcher out of `${CLAUDE_PLUGIN_DATA}/node_modules`. (Hooks in the same event array run in parallel per one search-result snippet, so the second command racing the first is possible: UNVERIFIED.)
- linq-team/claude-code-imessage-channel, `hooks/hooks.json`: same pattern, copying `package.json` and `package-lock.json` into the data dir and running `npm install --no-summary`.
- memvid/claude-brain: `smart-install.js` in SessionStart with `timeout: 30` in hooks.json but an inner `npm install` with 2 minute timeout (inconsistent; see above).

Known problems:

- First-run latency and race: the hook that needs `node_modules` may run before the install ends. In claude-mem (https://github.com/thedotmack/claude-mem/issues/2125): "The hook's `timeout: 60` is the most plausible cause" ... "when `bun-runner.js` has to bootstrap bun (slow network / first run) plus the 20s health-poll runs, the hook can exceed 60 s." A web result states claude-mem then moved installation out of the hook to `npx claude-mem install` (from a mintlify docs page snippet; UNVERIFIED by me).
- SessionStart may not run on the very first session for a freshly added marketplace plugin: https://github.com/anthropics/claude-code/issues/10997 (closed not planned): "The SessionStart hook fires before the asynchronous marketplace fetch completes on first run."
- Cloud: hooks run in cloud only if the plugin loads there (section 3), and need registry network access: "If your environment uses **None** network access, these hooks fail."
- Hook startup cost each session: cloud-environments: "**Adds startup latency**: hooks run each time a session starts or resumes ... Keep install scripts fast by skipping work that's already done".
- Official default for SessionStart command hooks in cloud: "Claude Code cancels a `command` hook after 600 seconds unless you set `timeout`" (cloud-environments page).

### Pattern C: `npx -y <pkg>` at runtime (MCP servers mostly)

- bytebase/dbhub, `plugin/.mcp.json` (https://github.com/bytebase/dbhub/blob/main/plugin/.mcp.json): `"command": "npx", "args": ["-y", "@bytebase/dbhub@2.1.0", "--transport", "stdio", "--config", "${CLAUDE_PLUGIN_ROOT}/dbhub.toml"]` (version pinned).
- pinecone-io/pinecone-claude-code-plugin, `.mcp.json`: `"command": "npx", "args": ["-y", "@pinecone-database/mcp"]` (unpinned, `cwd` = `${CLAUDE_PLUGIN_ROOT}`).
- Other hits from code search (paths only, not opened): nimbalyst/nimbalyst `plugins/nimbalyst-wiki/.mcp.json`, 8beeeaaat/touchdesigner-mcp `plugin/touchdesigner/.mcp.json`, microsoft/GitHub-Copilot-for-Azure `plugins/foundry-iq-skills/.mcp.json`.

Known problems: network required at first use and (per one blog-style source) re-resolution on each call: DEV Community post (https://dev.to/pponali/i-ran-a-health-check-on-my-claude-code-setup-heres-what-was-actually-slowing-it-down-6oa), as summarized by search: "swapping `npx -y @invariance/gps brief` for an installed `gps brief` dropped the call from about 1.6s to about 0.7s" (one anecdote; I did not open the page, UNVERIFIED). Unpinned `-y` means supply-chain drift. Fits MCP servers (long-lived) better than per-tool-call hooks. For hooks, an `npx` cold start on every PreToolUse/PostToolUse is the cost to avoid.

### Pattern D: bun

- thedotmack/claude-mem uses bun (`bun-runner.js`, per issue 2125) and the plugin docs support a `bun.lock` for the automatic install ("`bun.lock` | Bun"). Hook JSON `plugin/hooks/hooks.json` runs a `claude-mem` binary (`"command": "claude-mem", "args": ["start"]`, `"timeout": 60, "async": true`) plus a `Setup` hook with `"timeout": 300` running `scripts/version-check.js`. So claude-mem installs a global command out of band instead of using the automatic install.
- Cloud caveat from official docs (cloud-environments, installed-tools footnote): "Bun is installed but has known proxy compatibility issues for package fetching."
- joescharf/cc-joescharf-marketplace `plugins/enforce-bun`, ThisisYoYoDev/claude-rag, glommer/memelord: appear in the `CLAUDE_PLUGIN_ROOT bun run` code search (paths only, not opened). UNVERIFIED how they handle deps.

### Pattern E: Python `uv run --script`

- basicmachines-co/basic-memory, `plugins/claude-code/hooks/hooks.json`: `"command": "uv run --quiet --script \"${CLAUDE_PLUGIN_ROOT}/hooks/session_start.py\"", "timeout": 45` (PreCompact: timeout 120). PEP 723 inline deps resolved by `uv` at first run.
- piercelamb/deep-plan, `hooks/hooks.json`: `uv run ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/capture-session-id.py`.
- Also from code search (paths only): cisco-ai-defense/project-quarry, svenroth-ai/shipwright, kenneth-liao/ai-launchpad-marketplace.

Known problems: requires `uv` on PATH (not a plugin-guaranteed binary; UNVERIFIED for cloud images); first run downloads deps (network). The official docs explicitly name Python deps as something the automatic install cannot provide: "That includes packages that need their lifecycle scripts to build, Python dependencies, plugins locked with Yarn or pnpm, and dependencies that aren't registry packages, such as git dependencies."

---

## 4. ESLint inside bundled hooks

ESLint resolves plugins and configs by name at runtime (`import()` of `eslint-plugin-*`, flat config files read from disk), which is why it does not bundle cleanly. What exists:

- No example found of a Claude Code plugin that bundles ESLint plus plugin-by-name loading into one file. A web search ("bundle ESLint into a single file esbuild ... plugins loaded by name") returned only: `eslint4b` (https://www.npmjs.com/package/eslint4b, "Linter class adapted for browsers, with the dependency to fs eliminated" per search summary), `eslint-solid-standalone` ("a bundle with eslint and eslint-plugin-solid that can be used in the browser", per search summary), and esbuild plugins that run ESLint at build time (not bundle it). The search summary itself says: "none of the results show how to register plugins by name ... inside a bundled browser Linter". These are browser-oriented; whether they work for a Node CLI that reads a project flat config is UNVERIFIED.
- The in-process `Linter` class takes rules/plugins as objects, so a bundle that imports every plugin statically and passes them in works in principle (UNVERIFIED for our rule set; the repo's own harness would have to measure it). This is also the route `eslint4b` implies.
- Plugins that call the project's own ESLint:
  - eli0shin/cli-lsp-client, `claude-plugins/eslint-plugin/hooks/hooks.json` (https://github.com/eli0shin/cli-lsp-client/blob/main/claude-plugins/eslint-plugin/hooks/hooks.json): PostToolUse on `Edit|Write|MultiEdit` runs `bash ${CLAUDE_PLUGIN_ROOT}/hooks/eslint-check.sh`. The script (raw, read) checks `has_eslint_config "$PROJECT_DIR"`, exits with `{}` if the project has no config or a local override, then runs `cd "$PROJECT_DIR" && $PKG_RUNNER eslint "$FILE_PATH"` (runner chosen by `get_package_runner`).
  - AratKruglik/claude-sdlc, `plugins/nodejs-plugin/hooks/hooks.json` (https://github.com/AratKruglik/claude-sdlc/blob/main/plugins/nodejs-plugin/hooks/hooks.json): runs `npx --no-install eslint --fix "$f"` only when `package.json` declares eslint, via `run-tool.sh` ("local node_modules/.bin first, then a running Docker Compose service, skipped silently when neither has the tool"). Same file has a PreToolUse config-protection hook for `eslint.config.js`/`.eslintrc*`.
  - darian-deng/agent-plugins `plugins/ts-eslint-lsp/hooks/hooks.json` appeared in search (not opened).

Implication: the common design is "hook shells out to the consumer's installed eslint and config, silent no-op if absent". That matches paperlint's consumer model (paperlint installed as a devDependency next to eslint) and avoids carrying eslint in the plugin at all.

---

## What this means for paperlint (options, with evidence)

| Option                                                                               | Evidence for                                                                   | Evidence against                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin relies on automatic `npm ci` (ship `npm-shrinkwrap.json` in tarball)          | Official, zero hook code; plugin loads even if it fails                        | 60 s hard limit, `--ignore-scripts`, no `overrides`, no way to disable; 22 deps incl. eslint/typescript/unpdf not measured against 60 s (UNVERIFIED); issue #87603 shows a case with no node_modules in cache (npm source) |
| Hooks as committed esbuild bundles for the pure-JS parts, eslint stays the project's | ai-sdlc, OpenThrottle, context-mode, claude-mem; CI drift check pattern exists | ESLint plugin-by-name loading not shown bundled anywhere; native deps (if any) cannot bundle (claude-mem needs separate install for `sharp`/tree-sitter)                                                                   |
| SessionStart installs into `${CLAUDE_PLUGIN_DATA}`                                   | Documented; used by narai-primitives, linq imessage channel                    | Race with other hooks on the first session; 600 s default cloud limit, `npm` needs registry access; issue 10997 first-run skip                                                                                             |
| `npx -y paperlint ...` per hook                                                      | Used by MCP plugins (dbhub pinned)                                             | Network and per-call latency on every tool call (anecdote only)                                                                                                                                                            |
| Rely on plugin in cloud sessions                                                     | none                                                                           | Docs: repo and user plugins "No" in cloud; synced plugins on web reported not loading (#103409, #92031); do not depend on it                                                                                               |

The cloud/web carrier that docs support is the repository itself: committed `.claude/skills/`, `.claude/settings.json` hooks (single-repo sessions), `npm install` of paperlint as a devDependency, optionally a cloud setup script.

## Not verified / gaps

- Whether the automatic install of paperlint's real tree completes in under 60 s: not measured (needs `npm ci` timing on a clean cache in a proxy-limited container).
- Whether `${CLAUDE_PLUGIN_DATA}` hook installs work in claude.ai/code cloud sessions: NOT IN DOCS; blocked by plugin loading anyway.
- Bodies of anthropics/claude-code issues #103960, #47634, #51398, #88248, #93857, #107077 not read.
- ESLint bundle feasibility: no primary-source example.
- `gh api repos/anthropics/claude-code/issues/<n>` returned 403 in this session ("GitHub access to this repository is not enabled for this session"); issue contents above came from WebFetch of github.com HTML pages and may be summarized by the fetch model's paraphrase layer. Quotes marked verbatim were requested as verbatim but WebFetch can paraphrase; absence is not proof.
