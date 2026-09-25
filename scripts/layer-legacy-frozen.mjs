#!/usr/bin/env node
/**
 * layer-legacy-frozen.mjs — the legacy exemptions from `src/`'s layer rules may only SHRINK.
 *
 * `src/` is hexagonal on two axes (src/CLAUDE.md): who may know whom, and where effects may be
 * written. The flat `src/*.ts` files predate both. Each site in them that still breaks a rule
 * carries a directive naming the debt:
 *
 *   // eslint-disable-next-line boundaries/dependencies -- legacy I/O, moves behind a port in #76
 *   // eslint-disable-next-line boundaries/dependencies -- legacy layer, moves behind a port in #76
 *
 * `reportUnusedDisableDirectives: "error"` already makes a directive that suppresses nothing a lint
 * error, so a fixed site must drop its comment. What that cannot stop is a NEW directive: a new file,
 * or a new import in an old one, silenced the same way. This check freezes the per-file counts, in
 * the shape `mutation-batteries-frozen.mjs` gives the mutation batteries:
 *
 *   1. a file carrying a legacy suppression that is not in the frozen list fails — a new exemption;
 *   2. a listed file with no legacy suppression left fails — the list must shrink with the code;
 *   3. a count that grew fails;
 *   4. a count that shrank fails until the recorded number is lowered — otherwise a fixed site
 *      leaves room for a different one to be silenced later.
 *
 * Plus two refusals the frozen list cannot express: no file under `src/domain/`, `src/ports/` or
 * `src/adapters/` may carry one at all (those folders were written under the rules, so there is no
 * legacy there to hold), and a layer finding silenced WITHOUT naming #76 is not a legacy site but
 * an unexplained exemption.
 *
 * ── COUNTED FROM ESLINT'S OWN REPORT, NOT FROM THE SOURCE TEXT ─────────────────────────────
 * The unit is a SUPPRESSED FINDING, read from `LintResult.suppressedMessages[].suppressions[]`:
 * the linter itself says which finding a directive silenced and with what justification. A
 * comment that only looks like a directive, or one on a line with nothing to silence, cannot be
 * counted by construction — and a range directive (`/* eslint-disable … *\/` around a multi-line
 * import) counts exactly what it silences.
 *
 * Run: `node scripts/layer-legacy-frozen.mjs` (also part of `npm run check`)
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FROZEN_FILE = join("scripts", "layer-legacy.frozen.json");

/** The rules that enforce the layers. A suppression of any other rule is not this check's business. */
export const LAYER_RULES = ["boundaries/dependencies", "no-restricted-globals"];

/** Where a legacy suppression may never appear: the folders written under the rules. */
export const NO_LEGACY_UNDER = ["src/domain/", "src/ports/", "src/adapters/"];

/** The justification every legacy directive carries — `I/O` or `layer`, then the issue. */
export const LEGACY = /^legacy (I\/O|layer), moves behind a port in #76$/;

/**
 * Per file, per rule: how many layer findings a legacy directive suppressed. Pure: takes ESLint's
 * results (`filePath` relative to the repository, POSIX separators) and returns the tally plus
 * every layer suppression that is not a legacy one.
 */
export function tally(results) {
  const counts = {};
  const unexplained = [];
  for (const r of results)
    for (const m of r.suppressedMessages ?? []) {
      if (!LAYER_RULES.includes(m.ruleId ?? "")) continue;
      const why = (m.suppressions ?? []).map((s) => s.justification ?? "");
      if (!why.some((j) => LEGACY.test(j.trim()))) {
        unexplained.push(
          `${r.filePath}:${String(m.line)}: ${String(m.ruleId)} is silenced with "${why.join(" | ")}" — a layer exemption must say "legacy I/O|layer, moves behind a port in #76", or the site must be fixed.`,
        );
        continue;
      }
      const file = (counts[r.filePath] ??= {});
      file[m.ruleId] = (file[m.ruleId] ?? 0) + 1;
    }
  return { counts, unexplained };
}

/** Compare the tally with the frozen list. Pure. `frozen` is `{ path: { rule: count } }`. */
export function judge({ counts, unexplained, frozen }) {
  const problems = [...unexplained];
  for (const [f, rules] of Object.entries(counts)) {
    if (NO_LEGACY_UNDER.some((d) => f.startsWith(d)))
      problems.push(
        `${f}: carries a legacy layer exemption, and nothing under ${NO_LEGACY_UNDER.join(", ")} may — those folders are written under the rules. Fix the site (src/CLAUDE.md).`,
      );
    else if (!(f in frozen))
      problems.push(
        `${f}: a new legacy layer exemption is not accepted (#76). A module that needs the world is a new *.io.ts in the adapter of the program it talks to; an app file takes a port.`,
      );
    for (const [rule, got] of Object.entries(rules)) {
      const want = frozen[f]?.[rule];
      if (want === undefined) {
        if (f in frozen)
          problems.push(
            `${f}: ${String(got)} legacy ${rule} suppression(s), frozen at 0 — no new exemptions in existing files (#76).`,
          );
      } else if (got > want)
        problems.push(
          `${f}: ${String(got)} legacy ${rule} suppressions, frozen at ${String(want)} — no new exemptions in existing files (#76).`,
        );
      else if (got < want)
        problems.push(
          `${f}: ${String(got)} legacy ${rule} suppressions, frozen at ${String(want)} — lower it to ${String(got)} in ${FROZEN_FILE} (the list must shrink with the code).`,
        );
    }
  }
  for (const [f, rules] of Object.entries(frozen))
    for (const [rule, want] of Object.entries(rules))
      if (!counts[f]?.[rule])
        problems.push(
          `${f}: no legacy ${rule} suppression left (frozen at ${String(want)}) — remove it from ${FROZEN_FILE}.`,
        );
  return problems;
}

/** Lint `src/` with the repository's configuration and run the whole check. */
export async function checkFrozen(root = ROOT) {
  const data = JSON.parse(readFileSync(join(root, FROZEN_FILE), "utf8"));
  const frozen = data.files ?? {};
  const eslint = new ESLint({ cwd: root });
  const raw = await eslint.lintFiles(["src/**/*.ts"]);
  // Guards: a glob that matched nothing tallies nothing and reports every frozen file as fixed.
  if (raw.length === 0)
    return {
      problems: ["src/**/*.ts matched no file — nothing was counted."],
      frozen,
      counts: {},
    };
  const results = raw.map((r) => ({
    ...r,
    filePath: relative(root, r.filePath).split(sep).join("/"),
  }));
  const t = tally(results);
  return { problems: judge({ ...t, frozen }), frozen, counts: t.counts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { problems, counts } = await checkFrozen(ROOT);
  if (problems.length) {
    console.error(
      `🔴 legacy layer exemptions are frozen and may only shrink (#76) — ${String(problems.length)} problem(s):`,
    );
    for (const p of problems) console.error(`   ${p}`);
    process.exit(1);
  }
  const n = Object.values(counts)
    .flatMap((r) => Object.values(r))
    .reduce((s, v) => s + v, 0);
  console.log(
    `✓ ${String(Object.keys(counts).length)} legacy files, ${String(n)} frozen layer exemptions, none new, none grown (#76)`,
  );
}
