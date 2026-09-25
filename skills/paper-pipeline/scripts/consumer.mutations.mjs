/**
 * consumer.mutations.mjs — plant each defect `consumer.harness.mjs` claims to catch, and require
 * it to die BY ITS OWN assertion.
 *
 * Run: `node skills/paper-pipeline/scripts/consumer.mutations.mjs` (it rewrites `consumer.mjs` and
 * restores it, so it is not part of the plain test run).
 *
 * 🔴 WHY THIS ONE MATTERS MORE THAN MOST. Every resolution in `consumer.mjs` fails toward SILENCE:
 * a ledger under `node_modules` still accepts appends, a main guard that never fires still exits 0,
 * a root that does not exist still hashes to a stable value. That is exactly the shape a harness
 * cannot be seen catching — so the four cases below are the only evidence that its assertions can
 * fail at all. Each `expect` is the harness's OWN message for that defect, not a generic failure
 * string: a case killed by somebody else's assertion says nothing about the defect it planted.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMutations } from "../../../lib/mutation-driver.mjs";
import { consumerRoot } from "./consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "consumer.mjs");
const HARNESS = join(HERE, "consumer.harness.mjs");

const MUTATIONS = [
  [
    "a declared `null` is read as an absence",
    [
      [
        SRC,
        "if (declared !== undefined) {",
        "if (declared !== undefined && declared !== null) {",
      ],
    ],
    'a `"ledger": null` was accepted',
    "the absence/keystroke distinction — a typed null silently picks a different file",
  ],
  [
    "`node_modules` is detected by substring instead of by path segment",
    [
      [
        SRC,
        'return dir.split(sep).includes("node_modules");',
        'return dir.includes("node_modules");',
      ],
    ],
    "naming coincidence",
    "a consumer whose own directory merely contains the word is refused its ledger",
  ],
  [
    "the ledger default inside node_modules is no longer refused",
    [
      [
        SRC,
        "  if (insideNodeModules(hereDir))",
        "  if (false && insideNodeModules(hereDir))",
      ],
    ],
    "ledgerPath RETURNED A PATH INSIDE node_modules",
    "the one guard against silent data loss: appends succeed until `npm ci` deletes them",
  ],
  [
    "the main guard stops resolving the entry point's realpath",
    [[SRC, "    real = realpathSync(entry);", "    real = entry;"]],
    "isMain is false through a symlink",
    "every CLI in this directory when a consumer runs it at the path its skills document",
  ],

  // ── the fourth carrier. Its defects are worse than the three above: the value is a PREFIX a
  // caller filters prose with, so a wrong one matches nothing and every check built on it
  // reports zero findings — the green zero this package has a dedicated guard against.
  [
    "a declared `null` scripts path is read as an absence",
    [
      [
        SRC,
        "const rel = declared === undefined ? DEFAULT_SCRIPTS_ROOT : declared;",
        "const rel = declared ?? DEFAULT_SCRIPTS_ROOT;",
      ],
    ],
    'a `"scripts": null` was accepted',
    "the absence/keystroke distinction — a typed null is ignored and the default silently wins",
  ],
  [
    "a scripts path inside node_modules is no longer refused",
    [
      [
        SRC,
        "  if (insideNodeModules(abs))",
        "  if (false && insideNodeModules(abs))",
      ],
    ],
    "scriptsRoot ACCEPTED a path inside node_modules",
    "the guard against naming a path `npm ci` deletes and git does not track",
  ],
  [
    "a scripts path that is not on disk is no longer refused",
    [[SRC, "  if (!existsSync(abs))", "  if (false && !existsSync(abs))"]],
    "scriptsRoot accepted a path that does not exist",
    "the only net under the wrong prefix, whose symptom is zero findings and exit 0",
  ],
  [
    "the scripts root is returned resolved instead of as declared",
    [[SRC, "  return rel;", "  return abs;"]],
    "scriptsRoot returned an ABSOLUTE path",
    "prose comparison — every `startsWith` against a SKILL.md becomes false",
  ],
  [
    "a declared trailing slash is no longer normalised",
    [[SRC, 'const base = root.replace(/\\/+$/, "");', "const base = root;"]],
    "a declared trailing slash doubled the separator",
    "the one input a consumer types by habit, whose doubled prefix matches nothing",
  ],
  [
    "the prefix loses its trailing separator",
    [[SRC, "    prefix: `${base}/`,", "    prefix: `${base}`,"]],
    "the prefix matched a sibling directory sharing the root's name",
    "the boundary between the pipeline's scripts and a directory merely named like them",
  ],

  // ── `installedSkills` (rpp#62). Its defects fail toward a WRONG ROSTER, not an error: a reader
  // that does not follow links sees zero skills in every consumer; one that skips a dangling link
  // reports a broken install as "not installed"; one that counts it hands out an unreadable skill.
  [
    "installed skills are listed by `Dirent.isDirectory()` again, which does not follow links",
    [
      [
        SRC,
        "  for (const name of readdirSync(dir)) {",
        "  for (const dirent of readdirSync(dir, { withFileTypes: true })) {\n    const name = dirent.name;",
      ],
      [
        SRC,
        '    if (st.isDirectory() && existsSync(join(entry, "SKILL.md")))',
        '    if (dirent.isDirectory() && existsSync(join(entry, "SKILL.md")))',
      ],
    ],
    "a SYMLINKED skill was not counted as installed",
    "every installed skill in every consumer — `paperlint init` makes links, and the evals refuse to start",
  ],
  [
    "a dangling skill link is skipped silently",
    [
      [
        SRC,
        '      dangling.push({\n        name,\n        target: readlinkOr(entry),\n        cause: e.code ?? "error",\n      });',
        "",
      ],
    ],
    "a DANGLING skill link was silently accepted",
    "the report of a broken install — a retired skill's stale link reads as one never installed",
  ],
  [
    "a dangling skill link is counted as installed",
    [
      [
        SRC,
        '      dangling.push({\n        name,\n        target: readlinkOr(entry),\n        cause: e.code ?? "error",\n      });',
        "      names.push(name);",
      ],
    ],
    "a DANGLING skill link was silently accepted",
    "the guarantee that every name returned has a SKILL.md a caller can open",
  ],
  [
    "any directory counts as an installed skill",
    [
      [
        SRC,
        '    if (st.isDirectory() && existsSync(join(entry, "SKILL.md")))',
        "    if (st.isDirectory())",
      ],
    ],
    "installedSkills must return exactly the entries that lead to a directory holding SKILL.md",
    "the definition of a skill — a helper directory beside the skills joins the roster",
  ],
];

process.exit(
  runMutations({
    root: consumerRoot(),
    runner: "vigiles",
    cases: MUTATIONS.map(([name, edits, expect, disables]) => ({
      name,
      disables,
      edits,
      harness: HARNESS,
      expect,
    })),
  }),
);
