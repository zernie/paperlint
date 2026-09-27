#!/usr/bin/env node
/**
 * layer-legacy-frozen.ts — the legacy exemptions from `src/`'s layer rules may only SHRINK.
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
 * a list that may only shrink:
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
 * Run: `node scripts/layer-legacy-frozen.ts` (also part of `npm run check`)
 */
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { z } from "zod";

/** One file's result, in the shape ESLint's `LintResult` reports suppressions. */
export interface Suppressed {
  readonly filePath: string;
  readonly suppressedMessages?: readonly {
    readonly ruleId: string | null;
    readonly line: number;
    readonly suppressions?: readonly { readonly justification?: string }[];
  }[];
}

/** Per file, per rule: a count of suppressed findings. */
export type Counts = Record<string, Record<string, number>>;

/** What `checkFrozen` reports: the problems, and both sides of the comparison. */
export interface FrozenCheck {
  problems: string[];
  frozen: Counts;
  counts: Counts;
}

/** The frozen list on disk. A file with no `files` key freezes nothing. */
const FrozenFile = z.object({
  files: z.record(z.string(), z.record(z.string(), z.number())).optional(),
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FROZEN_FILE = join("scripts", "layer-legacy.frozen.json");

/** The rules that enforce the layers. A suppression of any other rule is not this check's business. */
export const LAYER_RULES: readonly string[] = [
  "boundaries/dependencies",
  "no-restricted-globals",
];

/** Where a legacy suppression may never appear: the folders written under the rules. */
export const NO_LEGACY_UNDER: readonly string[] = [
  "src/domain/",
  "src/ports/",
  "src/adapters/",
];

/** The justification every legacy directive carries — `I/O` or `layer`, then the issue. */
export const LEGACY = /^legacy (I\/O|layer), moves behind a port in #76$/;

/**
 * Per file, per rule: how many layer findings a legacy directive suppressed. Pure: takes ESLint's
 * results (`filePath` relative to the repository, POSIX separators) and returns the tally plus
 * every layer suppression that is not a legacy one.
 */
export function tally(results: readonly Suppressed[]): {
  counts: Counts;
  unexplained: string[];
} {
  const counts: Counts = {};
  const unexplained: string[] = [];
  for (const r of results)
    for (const m of r.suppressedMessages ?? []) {
      const rule = m.ruleId ?? "";
      if (!LAYER_RULES.includes(rule)) continue;
      const why = (m.suppressions ?? []).map((s) => s.justification ?? "");
      if (!why.some((j) => LEGACY.test(j.trim()))) {
        unexplained.push(
          `${r.filePath}:${String(m.line)}: ${String(m.ruleId)} is silenced with "${why.join(" | ")}" — a layer exemption must say "legacy I/O|layer, moves behind a port in #76", or the site must be fixed.`,
        );
        continue;
      }
      const file = (counts[r.filePath] ??= {});
      file[rule] = (file[rule] ?? 0) + 1;
    }
  return { counts, unexplained };
}

/** A file carrying a legacy exemption where none may be, or one the list does not know. */
function misplaced(f: string, frozen: Counts): string[] {
  if (NO_LEGACY_UNDER.some((d) => f.startsWith(d)))
    return [
      `${f}: carries a legacy layer exemption, and nothing under ${NO_LEGACY_UNDER.join(", ")} may — those folders are written under the rules. Fix the site (src/CLAUDE.md).`,
    ];
  if (!(f in frozen))
    return [
      `${f}: a new legacy layer exemption is not accepted (#76). A module that needs the world is a new *.io.ts in the adapter of the program it talks to; an app file takes a port.`,
    ];
  return [];
}

/** One rule's count in one file against its frozen number: grown, new, or shrunk without a record. */
function compareCount(
  f: string,
  rule: string,
  got: number,
  frozen: Counts,
): string[] {
  const want = frozen[f]?.[rule];
  if (want === undefined)
    return f in frozen
      ? [
          `${f}: ${String(got)} legacy ${rule} suppression(s), frozen at 0 — no new exemptions in existing files (#76).`,
        ]
      : [];
  if (got > want)
    return [
      `${f}: ${String(got)} legacy ${rule} suppressions, frozen at ${String(want)} — no new exemptions in existing files (#76).`,
    ];
  if (got < want)
    return [
      `${f}: ${String(got)} legacy ${rule} suppressions, frozen at ${String(want)} — lower it to ${String(got)} in ${FROZEN_FILE} (the list must shrink with the code).`,
    ];
  return [];
}

/** Compare the tally with the frozen list. Pure. `frozen` is `{ path: { rule: count } }`. */
export function judge({
  counts,
  unexplained,
  frozen,
}: {
  counts: Counts;
  unexplained: readonly string[];
  frozen: Counts;
}): string[] {
  const problems = [...unexplained];
  for (const [f, rules] of Object.entries(counts)) {
    problems.push(...misplaced(f, frozen));
    for (const [rule, got] of Object.entries(rules))
      problems.push(...compareCount(f, rule, got, frozen));
  }
  for (const [f, rules] of Object.entries(frozen))
    for (const [rule, want] of Object.entries(rules))
      if (!counts[f]?.[rule])
        problems.push(
          `${f}: no legacy ${rule} suppression left (frozen at ${String(want)}) — remove it from ${FROZEN_FILE}.`,
        );
  return problems;
}

/**
 * The repository's configuration, narrowed to what this check counts: `LAYER_RULES` and their
 * suppressions, with no type information. The configuration is
 * type-aware, and a type-aware lint builds the whole TypeScript program first — 33 s on a CI runner
 * under coverage, for rules that read only import paths. Suppressions of the filtered rules are
 * still reported, which is what `tally` reads.
 */
function layerLint(cwd: string): ESLint {
  return new ESLint({
    cwd,
    ruleFilter: ({ ruleId }) => LAYER_RULES.includes(ruleId),
    overrideConfig: {
      languageOptions: {
        parserOptions: { project: false, projectService: false },
      },
    },
  });
}

/** Lint `src/` with the repository's configuration and run the whole check. */
export async function checkFrozen(
  root: string = ROOT,
  {
    lint = (cwd: string) => layerLint(cwd).lintFiles(["src/**/*.ts"]),
  }: { lint?: (cwd: string) => Promise<readonly Suppressed[]> } = {},
): Promise<FrozenCheck> {
  const data = FrozenFile.parse(
    JSON.parse(readFileSync(join(root, FROZEN_FILE), "utf8")),
  );
  const frozen = data.files ?? {};
  // ESLint itself THROWS when the glob matches nothing ("No files matching 'src/**/*.ts' were
  // found") or only ignored files — measured. An empty result from any other linter (or a
  // configuration that lets it through) must not tally nothing and report every frozen file fixed.
  const raw = await lint(root);
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

/**
 * The gate: exit 1 naming every problem, or 0 with the count of what stays frozen. `check` is
 * injected so a test can hand it problems without planting suppressions in real source.
 */
export async function main({
  check = () => checkFrozen(ROOT),
  log = console.log,
  err = console.error,
}: {
  check?: () => Promise<FrozenCheck>;
  log?: (line: string) => void;
  err?: (line: string) => void;
} = {}): Promise<number> {
  const { problems, counts } = await check();
  if (problems.length) {
    err(
      `🔴 legacy layer exemptions are frozen and may only shrink (#76) — ${String(problems.length)} problem(s):`,
    );
    for (const p of problems) err(`   ${p}`);
    return 1;
  }
  const n = Object.values(counts)
    .flatMap((r) => Object.values(r))
    .reduce((s, v) => s + v, 0);
  log(
    `✓ ${String(Object.keys(counts).length)} legacy files, ${String(n)} frozen layer exemptions, none new, none grown (#76)`,
  );
  return 0;
}

// `isMain`, not a comparison with `file://${argv[1]}`: that is false through a symlink (consumer.mjs).
if (isMain(import.meta.url)) process.exit(await main());
