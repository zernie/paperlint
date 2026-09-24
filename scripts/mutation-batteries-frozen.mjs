#!/usr/bin/env node
/**
 * mutation-batteries-frozen.mjs — the hand-written mutation batteries may only SHRINK.
 *
 * Issue #52 retires the `*.mutations.mjs` pattern: string replacements of source lines, run
 * through `lib/mutation-driver.mjs`. The idea behind it stays (a test must be seen going red
 * when the code breaks); the vehicle is being replaced by a real mutation-testing tool, or by
 * nothing — that is decided in #52, not here. Until the last battery is gone, this check holds
 * the line so the pattern cannot grow back while it is being removed:
 *
 *   1. a `*.mutations.mjs` on disk that is not in the frozen list fails — a NEW battery;
 *   2. a listed file that no longer exists fails — the list must shrink with the code;
 *   3. a listed battery whose case table grew fails — no new cases in an old battery;
 *   4. a listed battery whose case table shrank fails until the recorded count is lowered —
 *      otherwise a removed case leaves room for a different one to be added later.
 *
 * The frozen list and the counts live in `mutation-batteries.frozen.json`, next to this file.
 *
 * ── HOW CASES ARE COUNTED, AND WHY NOT BY IMPORTING ───────────────────────────────────────
 * A battery runs on import and ends with `process.exit`, so it cannot be imported to read its
 * table. The file is PARSED instead (TypeScript's parser, already a dependency) and the case
 * table is found structurally:
 *
 *   - batteries on the shared driver pass `cases` to `runMutations({ ... })`;
 *   - the older self-contained batteries loop `for (const [...] of M)` over a top-level table.
 *
 * The table expression is then resolved to an array literal: an identifier goes to its
 * top-level `const` initializer, `X.map(...)` goes to `X` (map keeps the length), and a spread
 * `...X` inside a literal adds X's count. Anything else — `.filter`, a function call, a table
 * built in a loop — is NOT guessed at: the battery is reported as uncountable, which fails the
 * check. A count that silently stood for something else would be the green zero this repo
 * keeps guarding against.
 *
 * Run: `node scripts/mutation-batteries-frozen.mjs` (also part of `npm run check`)
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FROZEN_FILE = join("scripts", "mutation-batteries.frozen.json");

// Build output and dependencies are not the repository's own files. Symlinks are not followed:
// `.claude/skills/<name>` points back into `skills/`, and following it would list every skill
// battery twice under two spellings.
const SKIP = new Set(["node_modules", ".git", "dist", "_build"]);

/** Every `*.mutations.mjs` under `root`, as sorted POSIX-style repo-relative paths. */
export function findBatteries(root) {
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink() || SKIP.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".mutations.mjs"))
        found.push(relative(root, p).split(sep).join("/"));
    }
  };
  walk(root);
  return found.sort();
}

/**
 * The number of cases in a battery's table, read from its source without running it.
 * Returns `{ count }` or `{ error }` — never a guess.
 */
export function countCases(source, fileName = "battery.mjs") {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );

  // Top-level `const NAME = <init>` — the only bindings a table name is resolved through.
  const consts = new Map();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    if (!(st.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const d of st.declarationList.declarations)
      if (ts.isIdentifier(d.name) && d.initializer)
        consts.set(d.name.text, d.initializer);
  }

  const tables = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "runMutations"
    ) {
      const arg = node.arguments[0];
      const prop =
        arg && ts.isObjectLiteralExpression(arg)
          ? arg.properties.find((p) => p.name?.getText(sf) === "cases")
          : undefined;
      if (prop && ts.isPropertyAssignment(prop)) tables.push(prop.initializer);
      else if (prop && ts.isShorthandPropertyAssignment(prop))
        tables.push(prop.name);
      else tables.push(null);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const size = (expr, seen = new Set()) => {
    if (!expr) return null;
    while (
      ts.isParenthesizedExpression(expr) ||
      ts.isAsExpression?.(expr) ||
      ts.isSatisfiesExpression?.(expr)
    )
      expr = expr.expression;
    if (ts.isArrayLiteralExpression(expr)) {
      let n = 0;
      for (const el of expr.elements) {
        if (ts.isSpreadElement(el)) {
          const inner = size(el.expression, seen);
          if (inner === null) return null;
          n += inner;
        } else if (ts.isOmittedExpression(el)) return null;
        else n += 1;
      }
      return n;
    }
    if (ts.isIdentifier(expr)) {
      if (seen.has(expr.text) || !consts.has(expr.text)) return null;
      seen.add(expr.text);
      return size(consts.get(expr.text), seen);
    }
    if (
      ts.isCallExpression(expr) &&
      ts.isPropertyAccessExpression(expr.expression) &&
      expr.expression.name.text === "map"
    )
      return size(expr.expression.expression, seen);
    return null;
  };

  // The self-contained batteries: a top-level `for (... of TABLE)`. They also loop over a
  // results accumulator (`const rows = []; for (const r of rows) ...`), which is empty in the
  // source — so a candidate counts only when its table is non-empty.
  if (tables.length === 0)
    for (const st of sf.statements)
      if (ts.isForOfStatement(st) && (size(st.expression) ?? 0) > 0)
        tables.push(st.expression);

  if (tables.length !== 1)
    return {
      error:
        tables.length === 0
          ? "no case table found (neither `runMutations({ cases })` nor a top-level `for ... of` over a non-empty table)"
          : `${String(tables.length)} candidate case tables — which one counts is ambiguous`,
    };

  const count = size(tables[0]);
  return count === null
    ? {
        error: `the case table (${tables[0]?.getText(sf).slice(0, 60) ?? "?"}) is not an array literal this check can count`,
      }
    : { count };
}

/**
 * Compare what is on disk with the frozen list. Pure: every input is passed in.
 * `found` — paths from findBatteries; `frozen` — `{ path: { cases } }`;
 * `counted` — `{ path: { count } | { error } }` for the paths that exist.
 */
export function judge({ found, frozen, counted }) {
  const problems = [];
  const listed = new Set(Object.keys(frozen));
  for (const f of found)
    if (!listed.has(f))
      problems.push(
        `${f}: new hand-written mutation batteries are not accepted, see #52. ` +
          `Record what a test guards as a comment above its assertion instead.`,
      );
  const onDisk = new Set(found);
  for (const f of listed)
    if (!onDisk.has(f))
      problems.push(
        `${f}: no longer exists — remove it from ${FROZEN_FILE} (the list must shrink with the code).`,
      );
  for (const f of found) {
    if (!listed.has(f)) continue;
    const want = frozen[f].cases;
    const got = counted[f];
    if (!got || "error" in got) {
      problems.push(
        `${f}: cases cannot be counted — ${got?.error ?? "not read"}. ` +
          `The table must stay an array literal (optionally through a const or .map) so it can only shrink.`,
      );
      continue;
    }
    if (got.count > want)
      problems.push(
        `${f}: ${String(got.count)} cases, frozen at ${String(want)} — ` +
          `no new cases in existing batteries, see #52.`,
      );
    else if (got.count < want)
      problems.push(
        `${f}: ${String(got.count)} cases, frozen at ${String(want)} — ` +
          `lower "cases" to ${String(got.count)} in ${FROZEN_FILE} (the list must shrink with the code).`,
      );
  }
  return problems;
}

/** Run the whole check against `root`. Returns the problems found. */
export function checkFrozen(root = ROOT) {
  const data = JSON.parse(readFileSync(join(root, FROZEN_FILE), "utf8"));
  const frozen = data.batteries ?? {};
  const found = findBatteries(root);
  const counted = {};
  for (const f of found) {
    const p = join(root, f);
    if (existsSync(p)) counted[f] = countCases(readFileSync(p, "utf8"), f);
  }
  return { problems: judge({ found, frozen, counted }), found, frozen };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { problems, found, frozen } = checkFrozen(ROOT);
  if (problems.length) {
    console.error(
      `🔴 mutation batteries are frozen and may only shrink (#52) — ${String(problems.length)} problem(s):`,
    );
    for (const p of problems) console.error(`   ${p}`);
    process.exit(1);
  }
  const cases = Object.values(frozen).reduce((s, v) => s + v.cases, 0);
  console.log(
    `✓ ${String(found.length)} frozen mutation batteries, ${String(cases)} cases, none new, none grown (#52)`,
  );
}
