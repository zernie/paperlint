// The shape of `install` in every result run.mjs writes, declared once. install-result.schema.json beside it is
// generated from this (node frame/rule-proof/install-schema.mjs --write) and the selftest fails when they differ, so
// a reader in another language validates against the same declaration.
//
// A failure's `cause` is a closed list, decided only from structured signals: which files exist, parsed
// package.json and lockfiles, exit status, npm's --json error code. `detail` is free text kept for a person; no code
// reads it. `unknown` is a legal cause: it is counted and printed, never filled in from `detail`.
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { PHASES, RESULT_FORMAT } from "./run-batch.mjs";

export const CAUSES = [
  "no-lockfile", // no Node lockfile at the root: the version would not be the repository's
  "no-pin", // Ruff: no exact pin in a lockfile, requirements, pyproject.toml or pre-commit
  "no-linter-dependency", // the install ran and no package.json of the repository declares ESLint
  "linter-in-subpackage", // the install ran; ESLint is declared only in a package below the root
  "node-engine", // the root package.json's engines.node excludes the Node the job ran
  "submodule", // the repository has a .pnpmfile and .gitmodules (an install-time hook that fetches submodules)
  "peer-conflict-typescript", // npm ERESOLVE that dropping the explicit TypeScript resolved
  "peer-conflict-other", // npm ERESOLVE otherwise
  "package-not-found", // the registry has no such package or version (HTTP 404, npm E404 / ETARGET)
  "tool-resolve", // Ruff: the pre-commit rev the kit read is not a release, and no other root file pins Ruff
  "registry-or-network", // the registry or the network failed (fetch threw, npm ENOTFOUND / ECONNRESET / ETIMEDOUT / EAI_AGAIN / ECONNREFUSED)
  "timeout", // a step ran past its time limit
  "unknown", // none of the structured signals decides it
];
// "install" and "not-started" are the runner's own: it stopped the item at its time limit during the install (which of
// its steps the runner cannot see), or the run step's deadline left no time to start it (run-batch.mjs runBatch).
export const STAGES = ["clone", "detect", "resolve", "fetch", "load", "install", "not-started"];
// Why an installed reading's planted pair did not run (vigiles' proof stage «parse» or «pair-ignored»), decided only
// from structure: the pair's file extension, whether the reading has a parser, and ESLint's own config matching.
export const PAIR_CAUSES = [
  "no-ts-parser-in-install", // parse: the pair is a TypeScript file and the install holds no @typescript-eslint/parser
  "parse-other", // parse: a parser for the file's type was there, or the file is not TypeScript
  "pair-unconfigured", // pair-ignored: ESLint gives the file no config from the setting's `files` alone (e.g. only
  //                      `dir/**` patterns, which do not make ESLint lint a .ts file)
  "pair-in-ignores", // pair-ignored: the setting's `files` give it a config, its `ignores` take it away
  "unknown", // none of the above decides it (no answer from ESLint, a Ruff pair)
];
export const PATHS = ["as-designed", "lockfile-pinned", "date-matched"];

const failure = z.strictObject({
  stage: z.enum(STAGES),
  cause: z.enum(CAUSES),
  tool: z.strictObject({ cmd: z.string(), exit: z.number().int().nullable(), code: z.string().nullable() }).optional(),
  detail: z.string(),
});
const plugin = z.strictObject({
  version: z.string().nullable(),
  error: z.string().nullable(),
  cause: z.enum(CAUSES).optional(),
  peer_conflict: z.boolean().optional(),
});
const attempt = z.strictObject({
  path: z.enum(PATHS),
  outcome: z.enum(["installed", "not-installed"]),
  rule: z.enum(["ruff-date-matched"]).optional(),
  failure: failure.optional(),
  resolved: z.array(z.strictObject({ cause: z.enum(CAUSES), by: z.string() })).optional(),
});
export const installSchema = z.strictObject({
  outcome: z.enum(["installed", "not-installed"]),
  path: z.enum(PATHS).nullable(),
  version: z.string().nullable(),
  versions: z.record(z.string(), z.string()),
  plugins: z.record(z.string(), plugin),
  attempts: z.array(attempt).min(1),
  adjustments: z.array(z.string()),
  commit: z.string().optional(),
  repo_eslint: z.strictObject({ declared: z.array(z.string()), package_jsons: z.number().int() }).optional(),
  lockfile_pinned: z.strictObject({ package: z.string(), lockfile: z.string(), candidates: z.array(z.string()) }).optional(),
  date_matched: z.strictObject({ commit: z.string(), ruff: z.string() }).optional(),
  aside: z.array(z.string()).optional(),
  legacy_peer_deps: z.boolean().optional(),
  typescript_peer_resolved: z.boolean().optional(),
  ts_parser_asked: z.array(z.enum(["root-tsconfig", "typescript-eslint-rule", "typescript-pair"])).optional(),
  // the date-matched release, picked by the package manager's own date flag at the commit's time (UTC)
  date_matched_by: z.strictObject({ tool: z.enum(["npm", "uv"]), flag: z.enum(["--before", "--exclude-newer"]), at: z.string() }).optional(),
  // TypeScript added with the range the parser's lockfile entry declares (a parser whose TypeScript peer is optional)
  typescript_from_peer_range: z.boolean().optional(),
}).superRefine((v, ctx) => {
  const last = v.attempts.at(-1);
  if (last.outcome !== v.outcome) ctx.addIssue({ code: "custom", message: "outcome is the last attempt's" });
  if ((v.outcome === "installed") !== (v.path !== null)) ctx.addIssue({ code: "custom", message: "path set exactly when installed" });
  for (const a of v.attempts) if ((a.outcome === "not-installed") !== (a.failure !== undefined)) ctx.addIssue({ code: "custom", message: "an attempt has a failure exactly when it did not install" });
});

const fileConfig = z.strictObject({ files_only: z.boolean(), full: z.boolean() }).nullable();
// A reading's `pair_check` in a result (beside `proof`), when its proof stopped at «parse» or «pair-ignored».
export const pairCheckSchema = z.strictObject({
  stage: z.enum(["parse", "pair-ignored"]),
  cause: z.enum(PAIR_CAUSES),
  pair_ts: z.boolean(),
  parser: z.string().nullable(),
  eslint: z.strictObject({ version: z.string().nullable(), bad: fileConfig, good: fileConfig, errors: z.array(z.string()) }).nullable(),
});

// A proved reading's `findings` in a result (beside `flagged`): where each flagged file is flagged, read from the
// linter's own JSON report (ESLint --format json, Ruff --output-format json). Every format still parses.
//   format 3 (`format: 3`): EVERY finding per file, sorted by line and column, `total` their count, `capped` always
//     false. The file's source lines that any finding touches are stored ONCE in the file's `lines` ({"<n>": {text, cut?,
//     sha256?}}); a finding holds `context` [from, to] (line numbers; the marked line is the finding's own `line`) and no
//     copy of the text. A line longer than `cap.line_chars` keeps its first `line_chars` characters, `cut` its full length
//     and `sha256` the hash of the whole line. `cap.per_file` is null (no limit).
//   format 2 (`format: 2`): the same, but each finding carried a copy of its lines (`lines`: [{n, text, mark, cut?, sha256?}]).
//   format 1 (no `format`): at most 5 findings per file (`capped` true when cut), lines of at most 400 characters.
// `linter`: its name, the version installed, and what `--version` printed. `config`: what the linter printed as the
// config it resolved for `file` (ESLint --print-config, Ruff check --show-settings), verbatim in `text`; `error` when
// that call failed. `error` at the top: the extra lint call gave no report (the files stay flagged; only their places
// are missing).
const lineEntry = z.strictObject({ text: z.string(), cut: z.number().int().optional(), sha256: z.string().regex(/^[0-9a-f]{64}$/).optional() });
const sourceLine = z.strictObject({ n: z.number().int().positive(), text: z.string(), mark: z.boolean(), cut: z.number().int().optional(), sha256: z.string().regex(/^[0-9a-f]{64}$/).optional() });
const where = { line: z.number().int(), column: z.number().int(), ruleId: z.string(), message: z.string() };
const findingCopy = z.strictObject({ ...where, lines: z.array(sourceLine) }); // formats 1 and 2
const findingRef = z.strictObject({ ...where, context: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional() }); // format 3
const fileCopy = z.strictObject({ total: z.number().int().positive(), capped: z.boolean(), items: z.array(findingCopy) });
const fileOnce = z.strictObject({ total: z.number().int().positive(), capped: z.boolean(), lines: z.record(z.string().regex(/^[1-9][0-9]*$/), lineEntry), items: z.array(findingRef) })
  .superRefine((f, ctx) => {
    for (const [i, it] of f.items.entries()) {
      if (!it.context) continue;
      const [from, to] = it.context;
      if (to < from || Array.from({ length: to - from + 1 }, (_, k) => String(from + k)).some((k) => f.lines[k] === undefined)) ctx.addIssue({ code: "custom", message: `items[${i}].context names a line the file's lines map does not hold` });
    }
  });
export const findingsSchema = z.strictObject({
  format: z.union([z.literal(2), z.literal(3)]).optional(),
  cap: z.strictObject({ per_file: z.number().int().positive().nullable(), context: z.number().int().nonnegative(), line_chars: z.number().int().positive() }),
  files: z.record(z.string(), z.union([fileOnce, fileCopy])),
  linter: z.strictObject({ name: z.string(), version: z.string().nullable(), reported: z.string().nullable() }).optional(),
  config: z.strictObject({ file: z.string(), exit: z.number().int().nullable(), text: z.string(), error: z.string().optional() }).optional(),
  error: z.string().optional(),
});

// A whole result file. Format 4 (`format: 4`), declared field by field where the runner writes it:
//   checked_out: the commit the clone checked out (null when the clone did not answer); repo and sha: what inputs.json named
//   runner: { run (the results folder key: Actions run id-attempt), repo, sha (the runner's own commit), dirty, run_id,
//     run_attempt, batch } (run-batch.mjs runnerRecord)
//   ended: { outcome, cause, phase, seconds, limit_seconds, detail? }: finished (cause null, phase done), timeout (cause
//     timeout: the runner stopped it at its limit, or the deadline left no time to start it), crashed (cause unknown)
//   kept: { file, entries } (run-batch.mjs writeKept): file is the sidecar, null when no entry is stored; an entry the
//     repository holds unchanged (in_repo) is never stored
//   install: the install record above; readings: each with its proof, and findings / pair_check of their own schemas
// Formats 1 to 3 have no top-level `format` (their findings carry 1, 2 or 3) and are read by legacyResultSchema: the
// fields every one of them has, the rest as written (their install records predate installSchema).
const hex40 = z.string().regex(/^[0-9a-f]{40}$/);
const hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const ENDED_CAUSE = { finished: null, timeout: "timeout", crashed: "unknown" };
const endedSchema = z.strictObject({
  outcome: z.enum(["finished", "timeout", "crashed"]),
  cause: z.enum(["timeout", "unknown"]).nullable(),
  phase: z.enum(PHASES),
  seconds: z.number().nonnegative(),
  limit_seconds: z.number().nonnegative(),
  detail: z.string().optional(),
}).superRefine((e, ctx) => {
  if (e.cause !== ENDED_CAUSE[e.outcome]) ctx.addIssue({ code: "custom", message: `outcome ${e.outcome} has cause ${ENDED_CAUSE[e.outcome]}` });
  if ((e.outcome === "finished") !== (e.phase === "done")) ctx.addIssue({ code: "custom", message: "phase done exactly when finished" });
});
const runnerSchema = z.strictObject({
  run: z.string().min(1), repo: z.string().nullable(), sha: hex40.nullable(), dirty: z.boolean().nullable(),
  run_id: z.string().nullable(), run_attempt: z.string().nullable(), batch: z.number().int().nonnegative().nullable(),
});
const keptEntry = z.strictObject({
  kind: z.enum(["lockfile", "manifest", "config"]), path: z.string().min(1), key: z.string().optional(),
  in_repo: z.boolean(), stored: z.boolean(), bytes: z.number().int().nonnegative(), sha256: hex64,
}).refine((e) => !(e.in_repo && e.stored), { message: "a file the repository holds unchanged is not stored" });
const keptSchema = z.strictObject({ file: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.kept\.json\.gz$/).nullable(), entries: z.array(keptEntry) })
  .refine((k) => (k.file !== null) === k.entries.some((e) => e.stored), { message: "a sidecar exactly when an entry is stored" });
const readingRow = z.looseObject({ key: z.string(), proof: z.looseObject({ kind: z.string() }), findings: findingsSchema.optional(), pair_check: pairCheckSchema.optional() });
export const resultSchema = z.looseObject({
  format: z.literal(RESULT_FORMAT),
  id: z.string().min(1), repo: z.string().min(1), sha: z.string().min(1), checked_out: hex40.nullable(),
  linter: z.enum(["eslint", "ruff"]), rule: z.string().min(1),
  runner: runnerSchema, ended: endedSchema, kept: keptSchema, install: installSchema,
  readings: z.array(readingRow).optional(), seconds: z.number().optional(), adjustments: z.array(z.string()).optional(),
});
export const legacyResultSchema = z.looseObject({
  format: z.never().optional(), id: z.string().min(1), repo: z.string().min(1), sha: z.string().min(1), linter: z.string(), rule: z.string(),
  install: z.looseObject({}), readings: z.array(readingRow).optional(),
});
// A result of any format: one with `format` is held to that format, never read as an older one.
export const anyResultSchema = z.union([resultSchema, legacyResultSchema]);
// 4 (or later) from the top level; else the highest format of its findings (1 when they carry none, or when it has none).
export const resultFormatOf = (r) => r.format ?? Math.max(1, ...(r.readings ?? []).filter((x) => x.findings).map((x) => x.findings.format ?? 1));

// The install record's schema at the top level (what a reader validates `install` against); the pair check under
// $defs.pair_check, a reading's findings under $defs.findings, a whole result file of format 4 under $defs.result.
export const jsonSchema = () => {
  const { $schema: _s, ...pairCheck } = z.toJSONSchema(pairCheckSchema, { io: "input" });
  const { $schema: _f, ...findings } = z.toJSONSchema(findingsSchema, { io: "input" });
  // The result's install record and its readings' findings and pair checks are the ones declared above: referenced, not
  // repeated.
  const { $schema: _r, ...emitted } = z.toJSONSchema(resultSchema, { io: "input" });
  const row = emitted.properties.readings.items;
  const result = { ...emitted, properties: { ...emitted.properties, install: { $ref: "#" },
    readings: { ...emitted.properties.readings, items: { ...row, properties: { ...row.properties, findings: { $ref: "#/$defs/findings" }, pair_check: { $ref: "#/$defs/pair_check" } } } } } };
  return { $comment: "generated from install-schema.mjs; do not edit", ...z.toJSONSchema(installSchema, { io: "input" }), $defs: { pair_check: pairCheck, findings, result } };
};

if (process.argv[2] === "--write") {
  writeFileSync(new URL("./install-result.schema.json", import.meta.url), JSON.stringify(jsonSchema(), null, 1) + "\n");
}
