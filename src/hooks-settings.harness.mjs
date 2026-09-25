/**
 * Both halves for `hooks-settings.ts` — the three hooks written into `.claude/settings.json`.
 *
 * The merge under test is vigiles' REAL one (`vigiles/claude-code`), not a stand-in: the claims
 * that matter — a user's hook in the same matcher survives, a second run is byte-identical — are
 * claims about that function meeting our wiring, and a fake would only test the fake.
 *
 * What each block defends against, in real life:
 *   - a SECOND copy of a hook wired by hand under another spelling: Claude Code dedupes only
 *     identical handlers, so the guard would run twice and nothing would say so;
 *   - a rewrite on every `init`: the settings file is committed, so churn is a diff someone reviews
 *     for nothing — and a reformat of the user's own file is a change they did not ask for;
 *   - a doctor that says "wired" over nothing, or offers a remedy `init` then refuses to apply.
 *
 * ⚠️ Assertions at the TOP LEVEL: `vigiles test` imports the file and counts "did not throw"
 * as a pass.
 */
import assert from "node:assert/strict";
import { recordCheck } from "vigiles";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const {
  hookRun,
  shippedWiring,
  wireHooks,
  wiredCounts,
  pluginEnabledHere,
  doctorHooks,
  readSettings,
  MANAGED_BY,
  SETTINGS_PATH,
} = await import(join(HERE, "hooks-settings.ts"));
const { claudeCodeHookProtocol } = await import("vigiles/claude-code");
const merge = (e, c, m) => claudeCodeHookProtocol.mergeRegistrations(e, c, m);

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, label);
  recordCheck(label);
};

// ── the contract with vigiles, checked before anything relies on it ──────────────────────
check(
  "🔴 vigiles/claude-code exports claudeCodeHookProtocol.mergeRegistrations — the merge init calls",
  typeof claudeCodeHookProtocol?.mergeRegistrations === "function",
);

// ── the one source: plugin/hooks/hooks.json ─────────────────────────────────────────────
const wiring = shippedWiring();
check(
  "the hook names are DERIVED from hooks.json — three, in its order",
  wiring.names.join() ===
    "paper-edit-guard,paper-skills-nudge,paper-status-gates",
);
const work = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-hooks-")));
try {
  const empty = join(work, "empty-hooks.json");
  writeFileSync(empty, '{"hooks":{}}');
  let threw = false;
  try {
    shippedWiring(empty);
  } catch {
    threw = true;
  }
  check(
    "a wiring file naming no hook THROWS — wiring nothing must not read as wired",
    threw,
  );

  // ── which spelling runs which hook ─────────────────────────────────────────────────────
  const ours = `node "\${CLAUDE_PROJECT_DIR}/${MANAGED_BY}" hook paper-edit-guard`;
  const cases = [
    [ours, { name: "paper-edit-guard", ours: true, legacy: false }],
    [
      `node "$CLAUDE_PROJECT_DIR/${MANAGED_BY}" hook paper-status-gates`,
      { name: "paper-status-gates", ours: true, legacy: false },
    ],
    // Guards: what an older install wrote is recognised as ours-but-stale. Spelled literally, not
    // built from a constant: these are what 1.x and 2.0.0 actually put in users' settings files.
    [
      `node "$CLAUDE_PROJECT_DIR/node_modules/research-paper-pipeline/bin/rpp.mjs" hook paper-edit-guard`,
      { name: "paper-edit-guard", ours: false, legacy: true },
    ],
    [
      `node "\${CLAUDE_PROJECT_DIR}/node_modules/paperlint/bin/rpp.mjs" hook paper-status-gates`,
      { name: "paper-status-gates", ours: false, legacy: true },
    ],
    [
      `node "$CLAUDE_PROJECT_DIR/node_modules/vigiles/dist/cli.js" hook-runtime run-program "$CLAUDE_PROJECT_DIR/node_modules/paperlint/hooks/paper-edit-guard.hook.mjs"`,
      { name: "paper-edit-guard", ours: false, legacy: false },
    ],
    [
      `npx paperlint hook paper-skills-nudge`,
      { name: "paper-skills-nudge", ours: false, legacy: false },
    ],
    [
      `npx paperlint hook paper-skills-nudge`,
      { name: "paper-skills-nudge", ours: false, legacy: false },
    ],
    [
      `node /abs/proj/node_modules/paperlint/bin/paperlint.mjs hook paper-edit-guard`,
      { name: "paper-edit-guard", ours: false, legacy: false },
    ],
    [`node my-own-lint.mjs`, null],
    [`node node_modules/paperlint/bin/paperlint.mjs lint`, null],
  ];
  for (const [cmd, want] of cases)
    check(
      `hookRun(${cmd.slice(0, 60)}…) → ${JSON.stringify(want)}`,
      JSON.stringify(hookRun(cmd)) === JSON.stringify(want),
    );

  const project = (name, settings) => {
    const dir = join(work, name);
    mkdirSync(join(dir, ".claude"), { recursive: true });
    if (settings !== undefined)
      writeFileSync(
        join(dir, SETTINGS_PATH),
        typeof settings === "string"
          ? settings
          : JSON.stringify(settings, null, 2) + "\n",
      );
    return dir;
  };
  const text = (dir) => readFileSync(join(dir, SETTINGS_PATH), "utf8");

  // ── a fresh project ────────────────────────────────────────────────────────────────────
  {
    const dir = join(work, "fresh");
    mkdirSync(dir);
    const r = wireHooks(dir, merge, wiring);
    const s = JSON.parse(text(dir));
    check(
      "no settings file → it is created with the three hooks",
      r.status === "written" &&
        [...wiredCounts(s, wiring.names).values()].every(
          (c) => c.ours === 1 && c.other === 0,
        ),
    );
    const before = text(dir);
    const again = wireHooks(dir, merge, wiring);
    check(
      "🔴 a second run changes NOTHING — byte-identical, status `present`",
      again.status === "present" && text(dir) === before,
    );
  }

  // ── what an older install wrote is migrated, the user's own command kept ─────────────────
  // Two real histories, spelled literally: 1.x wrote the old package directory, 2.0.0 wrote the
  // new directory with the old entry file name. Neither file exists after an upgrade.
  for (const [release, stale] of [
    ["1.x", "node_modules/research-paper-pipeline/bin/rpp.mjs"],
    ["2.0.0", "node_modules/paperlint/bin/rpp.mjs"],
  ]) {
    const legacyWired = JSON.parse(
      JSON.stringify(merge({}, wiring.compiled, MANAGED_BY)).replaceAll(
        MANAGED_BY,
        stale,
      ),
    );
    legacyWired.hooks.PostToolUse[0].hooks.push({
      type: "command",
      command: "node my-own-lint.mjs",
    });
    const dir = project(`legacy-${release}`, legacyWired);
    const before = doctorHooks(dir, wiring).join("\n");
    check(
      `🔴 doctor names hook commands ${release} left behind — the missing file, and the fix`,
      before.includes(`run ${stale}, which this version does not install`) &&
        /npx paperlint init` replaces them/.test(before),
    );
    const r = wireHooks(dir, merge, wiring);
    const s = JSON.parse(text(dir));
    const counts = [...wiredCounts(s, wiring.names).values()];
    check(
      `🔴 init replaces what ${release} wrote: every hook wired once, none left at the old path`,
      r.status === "written" &&
        r.replaced === wiring.names.length &&
        counts.every((c) => c.ours === 1 && c.legacy === 0 && c.other === 0) &&
        !text(dir).includes(stale),
    );
    check(
      `and the user's own command in the same matcher survives the ${release} migration`,
      text(dir).includes("node my-own-lint.mjs"),
    );
  }

  // ── the user's own hooks and keys survive ──────────────────────────────────────────────
  {
    const dir = project("user", {
      permissions: { allow: ["Bash(ls:*)"] },
      hooks: {
        PostToolUse: [
          {
            matcher: "Edit|Write|MultiEdit",
            hooks: [{ type: "command", command: "node my-own-lint.mjs" }],
          },
        ],
      },
    });
    wireHooks(dir, merge, wiring);
    const s = JSON.parse(text(dir));
    check(
      "🔴 the user's own hook in the SAME matcher survives",
      JSON.stringify(s).includes("node my-own-lint.mjs"),
    );
    check(
      "and every other key is kept (permissions)",
      s.permissions?.allow?.[0] === "Bash(ls:*)",
    );
    check(
      "and ours are there, once each",
      [...wiredCounts(s, wiring.names).values()].every((c) => c.ours === 1),
    );
  }

  // ── already wired, in someone else's formatting → the file is not touched ──────────────
  {
    const wired = merge({}, wiring.compiled, MANAGED_BY);
    const fourSpaces = JSON.stringify(wired, null, 4);
    const dir = project("formatted", fourSpaces);
    const r = wireHooks(dir, merge, wiring);
    check(
      "🔴 wired already → nothing is rewritten, not even to our indentation",
      r.status === "present" && text(dir) === fourSpaces,
    );
  }

  // ── another spelling of the same hook → write NOTHING ──────────────────────────────────
  {
    const handWired = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command:
                  'node "$CLAUDE_PROJECT_DIR/node_modules/vigiles/dist/cli.js" hook-runtime run-program "$CLAUDE_PROJECT_DIR/node_modules/research-paper-pipeline/hooks/paper-edit-guard.hook.mjs"',
              },
            ],
          },
        ],
      },
    };
    const dir = project("foreign", handWired);
    const before = text(dir);
    const r = wireHooks(dir, merge, wiring);
    check(
      "🔴 a hook wired by hand under another spelling → `foreign`, and the file is untouched",
      r.status === "foreign" && text(dir) === before,
    );
    check(
      "the report names the hook and the command it found",
      r.found.length === 1 && r.found[0].name === "paper-edit-guard",
    );
    check(
      "and names the hooks that are not wired in ANY form",
      r.missing.join() === "paper-skills-nudge,paper-status-gates",
    );
    // The control: without the check, vigiles' merge WOULD add a second copy. This is the
    // reason the check exists, measured rather than asserted.
    const merged = merge(handWired, wiring.compiled, MANAGED_BY);
    const c = wiredCounts(merged, wiring.names).get("paper-edit-guard");
    check(
      "(control) vigiles' merge alone would wire paper-edit-guard TWICE here",
      c.ours === 1 && c.other === 1,
    );
  }

  // ── a file that does not parse is reported, never overwritten ──────────────────────────
  {
    const dir = project("broken", "{ not json");
    const r = wireHooks(dir, merge, wiring);
    check(
      "an unparsable settings.json → `unparsable`, bytes untouched",
      r.status === "unparsable" && text(dir) === "{ not json",
    );
    check(
      "an array is not a settings object either",
      readSettings(project("array", "[]\n")).status === "unparsable",
    );
  }

  // ── the plugin, enabled by the project ─────────────────────────────────────────────────
  check(
    "the project's enabledPlugins entry for this package is found",
    pluginEnabledHere({
      enabledPlugins: {
        "research-paper-pipeline@research-paper-pipeline": true,
        "other@x": true,
      },
    }).join() === "research-paper-pipeline@research-paper-pipeline",
  );
  check(
    "a disabled entry does not count",
    pluginEnabledHere({
      enabledPlugins: {
        "research-paper-pipeline@research-paper-pipeline": false,
      },
    }).length === 0,
  );

  // ── doctor's section ───────────────────────────────────────────────────────────────────
  const doc = (settings) => {
    const dir = project(`doc-${String(n)}`, settings);
    return doctorHooks(dir, wiring).join("\n");
  };
  const wiredOnce = merge({}, wiring.compiled, MANAGED_BY);
  check(
    "wired once each → ✓ wired, with the fresh-clone consequence",
    /✓ wired — paper-edit-guard, paper-skills-nudge, paper-status-gates, once each/.test(
      doc(wiredOnce),
    ) && /cannot run until `npm install`/.test(doc(wiredOnce)),
  );
  check(
    "nothing wired → ⚠ not wired, with the remedy",
    /⚠ not wired — none of the 3 hooks/.test(doc({})),
  );
  const twice = JSON.parse(JSON.stringify(wiredOnce));
  twice.hooks.PreToolUse[0].hooks.push({
    type: "command",
    command: "npx paperlint hook paper-edit-guard",
  });
  const twiceText = doc(twice);
  check(
    "🔴 the same hook under two spellings → ⚠ wired TWICE, naming it with its count",
    /wired TWICE/.test(twiceText) &&
      /paper-edit-guard ×2/.test(twiceText) &&
      !/✓ wired/.test(twiceText),
  );
  const handPartial = doc({
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [
            { type: "command", command: "npx paperlint hook paper-edit-guard" },
          ],
        },
      ],
    },
  });
  check(
    "🔴 partly wired BY HAND → the remedy is NOT `npx paperlint init`, which would refuse to write",
    /partly wired — missing: paper-skills-nudge, paper-status-gates/.test(
      handPartial,
    ) && /writes nothing then/.test(handPartial),
  );
  const pluginText = doc({
    ...wiredOnce,
    enabledPlugins: { "research-paper-pipeline@research-paper-pipeline": true },
  });
  check(
    "the project also enabling the plugin → told to uninstall it, with the command",
    /ALSO enables the plugin/.test(pluginText) &&
      /\/plugin uninstall research-paper-pipeline@research-paper-pipeline/.test(
        pluginText,
      ),
  );
  check(
    "🔴 and it says it cannot see a USER-scope plugin, rather than implying there is none",
    /USER scope is not visible from here/.test(doc({})),
  );
  check(
    "an unparsable file is named in doctor, not crashed on",
    /does not parse/.test(
      doctorHooks(project("doc-broken", "{"), wiring).join("\n"),
    ),
  );
  check(
    "(the scratch projects exist — nothing above was vacuous)",
    existsSync(work),
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(
  `✓ ${String(n)} assertions passed — the hooks land in .claude/settings.json once`,
);
