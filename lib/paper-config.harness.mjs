/**
 * Both halves for `lib/paper-config.mjs` — and, more broadly, for the SET of places that
 * publish these two constants.
 *
 * 🔴 WHY THIS CHECK MOVED HERE FROM `hooks/hooks.harness.mjs`. There it compared three hooks
 * against each other — and was right only as far as its COVERAGE was right. Measured
 * 2026-09-18: there were eight declarations across five files, four per constant, and for each
 * constant exactly one copy sat OUTSIDE the comparison (`eslint-rules/papers.mjs`,
 * `skills/paper-pipeline/scripts/consumer.mjs`). Had they drifted, nobody would have noticed. A
 * check that lives with the hooks could, by construction, never see the non-hooks; moving it
 * next to the subject itself fixes that.
 *
 * 🔴 THE VALUES ARE IMPORTED. The previous version read them with a regex over the source, and
 * adding `export` — an edit that changed nothing about behavior — turned it red. A pattern over
 * code is the shadow of a declaration, and a shadow has spellings; an import gives you the
 * value itself.
 *
 * ⚠️ WHERE THE RISK REMAINS, NAMED RATHER THAN HIDDEN. The carrier list below is explicit. A
 * sixth file with its own copy will show up with nothing to compare it against. That is why a
 * second check exists below, for COMPLETENESS: it searches the whole corpus for declarations
 * and requires every file it finds to be on the list. Its subject is different — "is there a
 * file I don't know about" — and a text search is legitimate for that: it looks for CANDIDATES,
 * while the value itself is still taken by import.
 *
 * Run:    npx vigiles test lib/paper-config.harness.mjs
 * Killed by: lib/paper-config.mutations.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, label);
};

/**
 * Every place that publishes at least one of the two constants. The three hooks duplicate them
 * out of necessity (a compiled hook is forbidden to import anything but `vigiles/hook`); the
 * rest re-export from `lib/paper-config.mjs` and are kept in this list for exactly one reason:
 * so a re-export that is one day swapped back for its own declaration gets caught.
 */
const CARRIERS = [
  "lib/paper-config.mjs",
  "hooks/paper-edit-guard.hook.mjs",
  "hooks/paper-skills-nudge.hook.mjs",
  "hooks/paper-status-gates.hook.mjs",
  "eslint-rules/papers.mjs",
  "skills/paper-pipeline/scripts/consumer.mjs",
];

const loaded = await Promise.all(
  CARRIERS.map(async (rel) => {
    const mod = await import(pathToFileURL(join(ROOT, rel)).href);
    return {
      rel,
      key: mod.CONFIG_KEY,
      def: mod.DEFAULT_PAPERS_ROOT,
      field: mod.PAPERS_DIR_FIELD,
      old: mod.OLD_PAPERS_DIR_FIELD,
    };
  }),
);

// ── I. THE SOURCE SAYS WHAT IT SHOULD ───────────────────────────────────────────────────────
{
  // 🔴 THERE IS NO KEY LITERAL HERE, AND THAT IS DELIBERATE. The first version compared
  // `src.key` against "research-paper-pipeline" right here — and by doing so made the check
  // below, that the key equals the package name, UNKILLABLE: any corruption of the value would
  // fail earlier, on the literal. The value is pinned in exactly one place — the one place it
  // has a REASON to be what it is.
  const src = loaded[0];
  check(
    "the source declares both constants as non-empty strings",
    typeof src.key === "string" &&
      src.key.length > 0 &&
      typeof src.def === "string" &&
      src.def.length > 0,
  );
  check("the default papers directory is `papers`", src.def === "papers");
}

// ── II. ALL CARRIERS AGREE WITH THE SOURCE ──────────────────────────────────────────────────
{
  const keys = new Set(loaded.map((c) => c.key).filter((v) => v !== undefined));
  const defs = new Set(loaded.map((c) => c.def).filter((v) => v !== undefined));
  check(
    `all carriers agree on CONFIG_KEY (${[...keys].join(" / ")})`,
    keys.size === 1,
  );
  check(
    `all carriers agree on DEFAULT_PAPERS_ROOT (${[...defs].join(" / ")})`,
    defs.size === 1,
  );
  // The papers-directory field name, and its old name. Only the source and the three hooks
  // (which cannot import it) declare these; the value itself is pinned nowhere but the source,
  // so a rename stays a one-line change there plus the hook copies this checks.
  const fields = new Set(
    loaded.map((c) => c.field).filter((v) => v !== undefined),
  );
  const olds = new Set(loaded.map((c) => c.old).filter((v) => v !== undefined));
  check(
    `all carriers agree on PAPERS_DIR_FIELD (${[...fields].join(" / ")})`,
    fields.size === 1,
  );
  check(
    `all carriers agree on OLD_PAPERS_DIR_FIELD (${[...olds].join(" / ")})`,
    olds.size === 1,
  );
  check(
    "every hook declares both field names — a hook without them would read an undefined field",
    loaded
      .filter((c) => c.rel.endsWith(".hook.mjs"))
      .every((c) => typeof c.field === "string" && typeof c.old === "string"),
  );
  check(
    "the new and the old field names differ",
    loaded[0].field !== loaded[0].old,
  );
  check(
    "and no carrier is silent about both at once — such an entry is dead weight on the list",
    loaded.every((c) => c.key !== undefined || c.def !== undefined),
  );
  // The key is the PACKAGE'S NAME, not a string that merely matches it. They drift apart when
  // the package is renamed — the consumer would declare settings under one name while a
  // different one is read.
  check(
    "config key equals the package name in package.json",
    loaded[0].key ===
      JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name,
  );
}

// ── III. THE HOOKS DUPLICATE, AND THAT IS CHECKED SEPARATELY ───────────────────────────────
// A hook that started importing the constants would compile, run, and pass the value
// cross-check — but it would violate the `checkHookImports` contract, i.e. stop being a hook
// with a proven capability surface. The values have nothing to do with that, so it gets its own
// check.
{
  const { checkHookImports } = await import("vigiles/hook");
  for (const rel of CARRIERS.filter((c) => c.endsWith(".hook.mjs"))) {
    const offending = checkHookImports(
      readFileSync(join(ROOT, rel), "utf8"),
      rel,
    );
    check(
      `${rel} pulls in nothing outside the hook vocabulary (${offending.join(", ") || "clean"})`,
      offending.length === 0,
    );
  }
}

// ── IV. COMPLETENESS OF THE LIST: IS THERE A SIXTH CARRIER ─────────────────────────────────
// The subject of this check is not the value but the EXISTENCE of a file the list doesn't know
// about.
{
  const skip = new Set([
    "node_modules",
    ".git",
    "dist",
    "_build",
    "fixtures",
    "repro",
  ]);
  const declares =
    /^(?:export )?const (?:CONFIG_KEY|DEFAULT_PAPERS_ROOT|PAPERS_DIR_FIELD|OLD_PAPERS_DIR_FIELD)\s*=/m;
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || skip.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (
        /\.(mjs|ts)$/.test(e.name) &&
        !/\.(harness|mutations)\.(mjs|ts)$/.test(e.name)
      ) {
        if (declares.test(readFileSync(p, "utf8")))
          found.push(relative(ROOT, p));
      }
    }
  };
  walk(ROOT);
  const unknown = found.filter((f) => !CARRIERS.includes(f));
  check(
    `no declaration outside the carrier list (${unknown.join(", ") || "clean"})`,
    unknown.length === 0,
  );
  check(
    "and the search itself is not empty — otherwise it is searching the wrong place, and its zero reads as all-clear",
    found.length >= 4,
  );
}

// ── SETTINGS_KEYS against every reader of the settings ─────────────────────────────────────
// The settings object has readers all over the package, each reading its own keys, and the CLI
// refuses any key not in SETTINGS_KEYS. So the list must hold every key some reader reads — or a
// consumer's valid key is refused — and nothing no one reads. The readers are FOUND, by the AST:
// every `[CONFIG_KEY]?.<key>` (or the literal package name in the brackets), plus every field of
// `RppConfig`, the CLI's typed view of the same object.
{
  const { SETTINGS_KEYS } = await import(join(HERE, "paper-config.mjs"));
  const ts = (await import("typescript")).default;
  const readKeys = new Set();
  const isConfigKey = (e) =>
    (ts.isIdentifier(e) && e.text === "CONFIG_KEY") ||
    (ts.isStringLiteral(e) && e.text === "research-paper-pipeline");
  const visit = (node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isElementAccessExpression(node.expression) &&
      isConfigKey(node.expression.argumentExpression)
    )
      readKeys.add(node.name.text);
    if (ts.isInterfaceDeclaration(node) && node.name.text === "RppConfig")
      for (const m of node.members)
        if (m.name && ts.isIdentifier(m.name)) readKeys.add(m.name.text);
    ts.forEachChild(node, visit);
  };
  const skipDirs = new Set(["node_modules", "dist", "fixtures", "docs"]);
  const scan = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || skipDirs.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) scan(p);
      else if (/\.(mjs|ts)$/.test(e.name) && !/\.harness\.mjs$/.test(e.name))
        visit(
          ts.createSourceFile(
            p,
            readFileSync(p, "utf8"),
            ts.ScriptTarget.Latest,
            true,
          ),
        );
    }
  };
  scan(ROOT);
  const listed = new Set(Object.keys(SETTINGS_KEYS));
  const unlisted = [...readKeys].filter((k) => !listed.has(k));
  const unread = [...listed].filter((k) => !readKeys.has(k));
  check(
    `🔴 every settings key some reader reads is in SETTINGS_KEYS — else a valid key is refused (${unlisted.join(", ") || "clean"})`,
    unlisted.length === 0,
  );
  check(
    `every key in SETTINGS_KEYS has a reader (${unread.join(", ") || "clean"})`,
    unread.length === 0,
  );
  check(
    "and the scan found the readers it must find — the skill scripts' keys and RppConfig's",
    ["ledger", "citeChecks", "triggerCases", "papersDir", "rules"].every((k) =>
      readKeys.has(k),
    ),
  );
}

console.log(
  `✓ ${n} assertions passed — one source for the consumer's config key`,
);
