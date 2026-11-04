// Selftest of run.mjs's pure parts: node frame/rule-proof/run.selftest.mjs (exit 1 on a defect).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findingsSchema, jsonSchema } from "./install-schema.mjs";
import { FINDINGS_CAP, configArgs, contextOf, crossPlan, fileFindings, findingsOf, linesOf, parseFindings, pluginOf, readResult, ruffSettings, utcInstant, writeResult } from "./run.mjs";

const fail = [];
const plan = crossPlan([{ proved: true, pair: {} }, { proved: false, pair: {} }, { proved: true, pair: {} }, { proved: true, pair: null }]);
if (JSON.stringify(plan) !== JSON.stringify([[0, 2], [2, 0]])) fail.push(`crossPlan ${JSON.stringify(plan)}: proved readings with a pair, both directions, never itself`);
if (crossPlan([{ proved: true, pair: {} }]).length !== 0) fail.push("one reading has nothing to cross");
if (pluginOf("@typescript-eslint/no-unused-vars") !== "@typescript-eslint/eslint-plugin" || pluginOf("quotes") !== null || pluginOf("import/order") !== "eslint-plugin-import") fail.push("pluginOf");
if (JSON.stringify(ruffSettings({ "line-length": 100, "flake8-tidy-imports.banned-api": { a: 1 } }, "0.6.0")) !== JSON.stringify({ "line-length": 100, lint: { "flake8-tidy-imports": { "banned-api": { a: 1 } } } })) fail.push("ruffSettings");
if (utcInstant("2024-06-01T05:00:00+05:00") !== "2024-06-01T00:00:00.000Z") fail.push("utcInstant: a committer date with an offset is sent as its UTC instant");

// ---- Where each finding is: line, column, rule and message from the linters' JSON reports ----------------------------
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const dir = "/r";
// ESLint --format json: only the reading's rule; a fatal parse message and another rule's message are not findings;
// a banner line before the array is skipped.
const eslintOut = "plugin banner\n" + JSON.stringify([
  { filePath: "/r/src/a.js", messages: [
    { ruleId: "no-tabs", message: "Unexpected tab character.", line: 4, column: 1 },
    { ruleId: "semi", message: "Missing semicolon.", line: 2, column: 9 },
    { ruleId: "no-tabs", message: "Unexpected tab character.", line: 2, column: 3 }] },
  { filePath: "/r/src/b.js", messages: [{ ruleId: null, fatal: true, message: "Parsing error: x", line: 1, column: 1 }] },
  { filePath: "/r/src/c.js", messages: [] }]);
const e = parseFindings("eslint", eslintOut, dir, "no-tabs");
if (!same(e, { findings: [
  { path: "src/a.js", line: 4, column: 1, ruleId: "no-tabs", message: "Unexpected tab character." },
  { path: "src/a.js", line: 2, column: 3, ruleId: "no-tabs", message: "Unexpected tab character." }] })) fail.push(`ESLint findings: the reading's rule only, with line, column and message: ${JSON.stringify(e)}`);
// Ruff --output-format json: `code`, `location.row`/`column`; another code is not a finding.
const ruffOut = JSON.stringify([
  { filename: "/r/tests/t.py", code: "PT009", message: "Use a regular `assert` instead of unittest-style `assertEqual`", location: { row: 7, column: 9 }, end_location: { row: 7, column: 30 } },
  { filename: "/r/tests/t.py", code: "E501", message: "Line too long", location: { row: 1, column: 89 } }]);
const r = parseFindings("ruff", ruffOut, dir, "PT009");
if (!same(r, { findings: [{ path: "tests/t.py", line: 7, column: 9, ruleId: "PT009", message: "Use a regular `assert` instead of unittest-style `assertEqual`" }] })) fail.push(`Ruff findings: ${JSON.stringify(r)}`);
if (!("unreadable" in parseFindings("eslint", "Oops, not JSON", dir, "no-tabs"))) fail.push("output that is not a report is unreadable, never an empty list");
if (!("unreadable" in parseFindings("ruff", JSON.stringify([{ filename: "/r/a.py" }]), dir, "X1"))) fail.push("a report of the wrong shape is unreadable");

// The source around a finding: the marked line ± FINDINGS_CAP.context, clipped at the file's edges, long lines cut.
const text = ["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8", "l9"].join("\n") + "\n";
if (!same(contextOf(text, 2, 3, 400), [{ n: 1, text: "l1", mark: false }, { n: 2, text: "l2", mark: true }, { n: 3, text: "l3", mark: false },
  { n: 4, text: "l4", mark: false }, { n: 5, text: "l5", mark: false }])) fail.push(`context at the top edge: ${JSON.stringify(contextOf(text, 2, 3, 400))}`);
if (contextOf(text, 9, 3, 400).map((l) => l.n).join() !== "6,7,8,9") fail.push(`context at the bottom edge: ${JSON.stringify(contextOf(text, 9, 3, 400))}`);
const sha = (t) => createHash("sha256").update(t).digest("hex");
if (!same(contextOf("a\r\nbcdefgh\r\n", 2, 0, 3), [{ n: 2, text: "bcd", mark: true, cut: 7, sha256: sha("bcdefgh") }])) fail.push(`a long line is cut and says its length and sha256; CRLF read as one break: ${JSON.stringify(contextOf("a\r\nbcdefgh\r\n", 2, 0, 3))}`);
// 30,000 characters: the first 20,000 kept, the full length, the sha256 of the full line.
const huge = "x".repeat(19_999) + "y" + "z".repeat(10_000);
const hugeCtx = contextOf(`${huge}\nnext\n`, 1, 1, FINDINGS_CAP.line_chars);
if (hugeCtx[0].text !== huge.slice(0, 20_000) || hugeCtx[0].cut !== 30_000 || hugeCtx[0].sha256 !== sha(huge))
  fail.push(`a 30,000-character line: 20,000 kept, cut 30000, sha256 of the full line: ${hugeCtx[0].text.length} ${hugeCtx[0].cut} ${hugeCtx[0].sha256}`);
// A line of exactly the limit is whole: no cut, no hash.
const exact = contextOf(`${"q".repeat(20_000)}\n`, 1, 0, FINDINGS_CAP.line_chars)[0];
if (exact.text.length !== 20_000 || "cut" in exact || "sha256" in exact) fail.push(`a 20,000-character line is kept whole: ${JSON.stringify({ ...exact, text: exact.text.length })}`);
if (FINDINGS_CAP.per_file !== null || FINDINGS_CAP.context !== 3 || FINDINGS_CAP.line_chars !== 20_000) fail.push(`cap: no findings limit, 3 lines each side, 20,000 characters a line: ${JSON.stringify(FINDINGS_CAP)}`);

// Per file: sorted by line then column, EVERY finding kept, the total, `capped` always false.
const seven = Array.from({ length: 7 }, (_, i) => ({ path: "src/a.js", line: 9 - i, column: 1, ruleId: "no-tabs", message: "m" }));
const ff = fileFindings([...seven, { path: "src/z.js", line: 1, column: 2, ruleId: "no-tabs", message: "m" }],
  (p) => (p === "src/a.js" ? text : "only\n"), { ...FINDINGS_CAP, context: 1 });
if (ff["src/a.js"]?.total !== 7 || ff["src/a.js"]?.capped !== false || ff["src/a.js"]?.items.map((x) => x.line).join() !== "3,4,5,6,7,8,9")
  fail.push(`seven findings: all seven kept by line, total 7, never capped: ${JSON.stringify(ff["src/a.js"])}`);
if (!same(ff["src/z.js"], { total: 1, capped: false, lines: { 1: { text: "only" } }, items: [{ line: 1, column: 2, ruleId: "no-tabs", message: "m", context: [1, 1] }] }))
  fail.push(`one finding (format 3): its source line stored once in the file's lines map, the finding points at it: ${JSON.stringify(ff["src/z.js"])}`);
if (!same(linesOf(ff["src/z.js"], ff["src/z.js"].items[0]), [{ n: 1, text: "only", mark: true }])) fail.push(`a context range resolves to the marked lines: ${JSON.stringify(linesOf(ff["src/z.js"], ff["src/z.js"].items[0]))}`);
const gone = fileFindings([{ path: "gone.js", line: 1, column: 1, ruleId: "x", message: "m" }], () => null, FINDINGS_CAP)["gone.js"];
if (!same(linesOf(gone, gone.items[0]), []) || Object.keys(gone.lines).length !== 0 || "context" in gone.items[0]) fail.push("a file that cannot be read gives no source lines and no context, not a crash");

// Format 3 stores each source line once per file. 20 findings on one 521,454-character line (and its neighbours):
// the line is in the record once (first 20,000 characters, length, sha256), and every finding's context resolves to
// the very lines format 2 copied into it.
const bigLine = "m".repeat(521_000) + "END" + "z".repeat(451);
const bigText = ["a", "b", "c", bigLine, "e", "f", "g", "h"].join("\n") + "\n";
const twenty = Array.from({ length: 20 }, (_, i) => ({ path: "dist/b.js", line: 4, column: i + 1, ruleId: "no-tabs", message: `m${i}` }));
const big = fileFindings(twenty, () => bigText, FINDINGS_CAP)["dist/b.js"];
if (big.total !== 20 || big.items.length !== 20) fail.push(`20 findings on one line all kept: ${big.total}/${big.items.length}`);
if (JSON.stringify(big).split("mmmmmmmmmm").length - 1 !== 2000 || Object.keys(big.lines).join() !== "1,2,3,4,5,6,7") fail.push(`the huge line is stored once (2,000 ten-character runs = 20,000 characters), lines 1-7 once each: ${Object.keys(big.lines)} ${JSON.stringify(big).length} bytes`);
if (big.lines[4].text.length !== 20_000 || big.lines[4].cut !== 521_454 || big.lines[4].sha256 !== sha(bigLine) || "cut" in big.lines[3]) fail.push(`the line keeps 20,000 characters, its length and sha256; short lines carry neither: ${JSON.stringify({ ...big.lines[4], text: big.lines[4].text.length })}`);
if (!big.items.every((f) => same(f.context, [1, 7]))) fail.push(`context ranges are line numbers: ${JSON.stringify(big.items[0])}`);
if (JSON.stringify(big).length > 40_000) fail.push(`20 findings on a 521,454-character line weigh ${JSON.stringify(big).length} bytes`);
for (const f of [big.items[0], big.items[19]]) {
  if (!same(linesOf(big, f), contextOf(bigText, 4, FINDINGS_CAP.context, FINDINGS_CAP.line_chars))) fail.push("a context range resolves to the same lines format 2 copied into the finding");
}
const many7 = fileFindings([{ path: "x.js", line: 2, column: 1, ruleId: "r", message: "m" }, { path: "x.js", line: 9, column: 1, ruleId: "r", message: "m" }], () => text, FINDINGS_CAP)["x.js"];
if (many7.items.some((f) => !same(linesOf(many7, f), contextOf(text, f.line, FINDINGS_CAP.context, FINDINGS_CAP.line_chars)))) fail.push("format 3 resolves to contextOf's lines at the top and bottom edges");

// The result file is gzipped; a reader takes .json.gz and the older plain .json alike.
const rdir = mkdtempSync(path.join(tmpdir(), "rp-res-"));
const sample = { id: "X1", n: [1, 2, 3], s: "é" };
const gz = writeResult(rdir, "X1", sample);
if (!gz.endsWith("X1.json.gz") || !same(readResult(gz), sample)) fail.push(`a result is written as <id>.json.gz and read back whole: ${gz}`);
writeFileSync(path.join(rdir, "Y1.json"), JSON.stringify(sample));
if (!same(readResult(path.join(rdir, "Y1.json")), sample)) fail.push("a plain .json result of an earlier run is read too");
if (readFileSync(gz).subarray(0, 2).toString("hex") !== "1f8b" || gzipSync("").length === 0) fail.push("the file is real gzip");

// The record a result carries is declared once and is in the emitted schema.
const rec = { format: 3, cap: FINDINGS_CAP, files: ff };
if (!findingsSchema.safeParse(rec).success) fail.push(`the findings record parses under findingsSchema: ${JSON.stringify(findingsSchema.safeParse(rec).error?.issues)}`);
if (findingsSchema.safeParse({ cap: FINDINGS_CAP, files: { "a.js": { total: 1, capped: false, lines: {}, items: [{ line: "4" }] } } }).success) fail.push("a finding without its fields is refused");
if (findingsSchema.safeParse({ format: 3, cap: FINDINGS_CAP, files: { "a.js": { total: 1, capped: false, lines: { 1: { text: "x" } }, items: [{ line: 1, column: 1, ruleId: "r", message: "m", context: [1, 2] }] } } }).success) fail.push("a context that names a line the file's map does not hold is refused");
// Format 2 (a copy of the lines in every finding) and format 1 results still parse.
const f2 = { format: 2, cap: { per_file: null, context: 3, line_chars: 20_000 }, files: { "a.js": { total: 1, capped: false, items: [{ line: 1, column: 1, ruleId: "x", message: "m", lines: [{ n: 1, text: "ab", mark: true, cut: 900, sha256: "a".repeat(64) }] }] } } };
if (!findingsSchema.safeParse(f2).success) fail.push(`a format 2 result still parses: ${JSON.stringify(findingsSchema.safeParse(f2).error?.issues)}`);
// A result file written under the old limit (5 per file, 400 characters, `capped` true) still parses.
const legacy = { cap: { per_file: 5, context: 3, line_chars: 400 }, files: { "a.js": { total: 9, capped: true, items: [{ line: 1, column: 1, ruleId: "x", message: "m", lines: [{ n: 1, text: "ab", mark: true, cut: 900 }] }] } } };
if (!findingsSchema.safeParse(legacy).success) fail.push(`a result written under the old cap still parses: ${JSON.stringify(findingsSchema.safeParse(legacy).error?.issues)}`);
// The call that prints the config the linter resolved for one file, per linter.
const call = { configPath: "/r/.cfg", args: ["ignored"] };
if (!same(configArgs({ linter: "eslint", rule: "no-tabs" }, call, "src/a.js"), ["--config", "/r/.cfg", "--print-config", "src/a.js"])) fail.push(`ESLint prints its config with --print-config: ${JSON.stringify(configArgs({ linter: "eslint", rule: "no-tabs" }, call, "src/a.js"))}`);
if (!same(configArgs({ linter: "ruff", rule: "PT009" }, call, "t.py"), ["check", "--no-cache", "--show-settings", "--exit-zero", "--no-force-exclude", "--no-fix", "--select", "PT009", "--config", "/r/.cfg", "t.py"])) fail.push(`Ruff prints its settings with --show-settings: ${JSON.stringify(configArgs({ linter: "ruff", rule: "PT009" }, call, "t.py"))}`);
if (!jsonSchema().$defs?.findings?.properties?.files) fail.push("the findings record is in the emitted schema under $defs.findings");

// End to end on the runner's own ESLint (no network): the planted tab is found at its line and column, the clean file
// gives nothing, and a file outside the flagged list is not linted.
const require = createRequire(import.meta.url);
const kitDir = path.join(path.dirname(fileURLToPath(import.meta.resolve("vigiles/rule-proof"))), "..", "core", "rule-proof", "kits");
const { eslintKit } = require(path.join(kitDir, "eslint.js"));
const repo = mkdtempSync(path.join(tmpdir(), "rp-findings-"));
mkdirSync(path.join(repo, "src"));
writeFileSync(path.join(repo, "src", "bad.js"), "const a = 1;\nif (a) {\n\tconsole.log(a);\n}\n");
writeFileSync(path.join(repo, "src", "good.js"), "const b = 2;\n");
writeFileSync(path.join(repo, "src", "other.js"), "\tconst c = 3;\n");
const eslintBin = path.join(path.dirname(fileURLToPath(import.meta.url)), "node_modules", ".bin", "eslint");
const pinned = { dir: repo, run: { kit: eslintKit, command: [eslintBin], options: { cacheDir: path.join(repo, ".cache"), lintTimeoutMs: 120_000 } } };
const reading = { linter: "eslint", rule: "no-tabs", options: [], scope: { files: ["**/*.js"], ignores: [] } };
const got = findingsOf(pinned, reading, ["src/bad.js", "src/good.js"], FINDINGS_CAP, "9.99.0");
const eslintVersion = JSON.parse(readFileSync(path.join(path.dirname(eslintBin), "..", "eslint", "package.json"), "utf8")).version;
if (got.linter?.version !== "9.99.0" || got.linter?.reported !== `v${eslintVersion}`) fail.push(`the linter's version (as installed) and its own --version are recorded: ${JSON.stringify(got.linter)} vs v${eslintVersion}`);
if (got.config?.file !== "src/bad.js" || got.config?.exit !== 0 || !got.config?.text.includes("no-tabs") || !got.config.text.includes("rules")) fail.push(`the resolved config for the first flagged file is recorded as the linter printed it: ${JSON.stringify(got.config)?.slice(0, 300)}`);
// Seven tabs in one file: all seven come back from the real linter.
writeFileSync(path.join(repo, "src", "many.js"), "if (a) {\n" + "\tx();\n".repeat(7) + "}\n");
const many = findingsOf(pinned, reading, ["src/many.js"]).files["src/many.js"];
if (many?.total !== 7 || many.items.length !== 7 || many.capped !== false) fail.push(`real ESLint: seven findings in a file, seven kept: ${JSON.stringify({ total: many?.total, kept: many?.items.length })}`);
const bad = got.files?.["src/bad.js"];
if (!bad || bad.total !== 1 || bad.items[0].line !== 3 || bad.items[0].column !== 1 || bad.items[0].ruleId !== "no-tabs"
  || !linesOf(bad, bad.items[0]).find((l) => l.mark && l.text === "\tconsole.log(a);")) fail.push(`real ESLint: the tab at line 3, column 1, marked: ${JSON.stringify(got)}`);
if (got.files?.["src/good.js"] !== undefined || got.files?.["src/other.js"] !== undefined) fail.push(`real ESLint: no finding for the clean file or an unlisted one: ${JSON.stringify(Object.keys(got.files ?? {}))}`);
if (!findingsSchema.safeParse(got).success) fail.push(`the real record parses: ${JSON.stringify(findingsSchema.safeParse(got).error?.issues)}`);
const broken = findingsOf({ ...pinned, run: { ...pinned.run, command: [process.execPath, "-e", "process.exit(2)", "--"] } }, reading, ["src/bad.js"]);
if (typeof broken.error !== "string" || Object.keys(broken.files).length !== 0) fail.push(`a linter that exits outside its report codes gives an error, not empty findings: ${JSON.stringify(broken)}`);

// ---- The plan: batches of items, never more matrix jobs than GitHub runs in one workflow run ------------------------
{
  const { planOf, MAX_JOBS, BATCH_ITEMS } = await import("./run-batch.mjs");
  const indicesOf = (plan) => plan.flatMap((b) => b.items.split(",").map(Number));
  const covers = (plan, n) => same(indicesOf(plan).sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i));
  // 340 items (the next study's size): one job per item would be 340 jobs, over GitHub's 256.
  const items340 = Array.from({ length: 340 }, (_, i) => ({ id: `I${i}`, ...(i % 100 === 7 ? { node: "20" } : {}) }));
  const p340 = planOf(items340);
  if (p340.length > MAX_JOBS || MAX_JOBS !== 256) fail.push(`340 items plan into at most 256 jobs: ${p340.length}`);
  if (!covers(p340, 340)) fail.push("every item is in exactly one batch");
  if (p340.some((b) => b.items.split(",").length > BATCH_ITEMS)) fail.push(`no batch holds more than ${BATCH_ITEMS} items at this size`);
  if (p340.some((b) => b.items.split(",").some((i) => String(items340[Number(i)].node ?? "22") !== b.node))) fail.push("a batch holds items of one Node version only");
  if (!same(p340.map((b) => b.batch), p340.map((_, i) => i))) fail.push("batches are numbered 0..n-1");
  if (p340.filter((b) => b.node === "20").length !== 1 || p340.length !== 15) fail.push(`340 items: 14 batches on Node 22 and 1 on Node 20: ${p340.length} ${JSON.stringify(p340.map((b) => b.node))}`);
  const sizes = p340.filter((b) => b.node === "22").map((b) => b.items.split(",").length);
  if (Math.max(...sizes) - Math.min(...sizes) > 1) fail.push(`batches of one Node version differ by at most one item: ${sizes}`);
  // Any size: 100,000 items still fit in 256 jobs (batches grow instead).
  const pBig = planOf(Array.from({ length: 100_000 }, (_, i) => ({ id: `I${i}`, node: String(18 + 2 * (i % 4)) })));
  if (pBig.length > MAX_JOBS || !covers(pBig, 100_000)) fail.push(`100,000 items in at most 256 jobs, each once: ${pBig.length}`);
  if (!same(planOf([{ id: "a" }, { id: "b", node: "20" }, { id: "c" }]), [{ batch: 0, node: "20", items: "1" }, { batch: 1, node: "22", items: "0,2" }])) fail.push(`small plan: ${JSON.stringify(planOf([{ id: "a" }, { id: "b", node: "20" }, { id: "c" }]))}`);
  if (!same(planOf([]), [])) fail.push("no items, no jobs");
  // The workflow reads the plan from `run.mjs --plan` and runs each batch with `--items`.
  const wf = readFileSync(new URL("../../.github/workflows/rule-proof-run.yml", import.meta.url), "utf8");
  if (!wf.includes("run.mjs --plan frame/rule-proof/inputs.json") || !wf.includes("--items ${{ matrix.items }}") || wf.includes("--only")) fail.push("the workflow plans batches and runs each with --items");
}

// ---- One run never reads another run's results: a folder per run, checked at commit --------------------------------
{
  const { closeRun, isDone, runDirOf } = await import("./run-batch.mjs");
  const out = mkdtempSync(path.join(tmpdir(), "rp-runs-"));
  if (runDirOf(out, "41852334655-1") !== path.join(out, "41852334655-1")) fail.push("the run's folder is <out>/<run id>-<attempt>");
  for (const bad of ["", "..", "../x", "a/b", ".hidden", "x y"]) {
    try { runDirOf(out, bad); fail.push(`run key ${JSON.stringify(bad)} is refused`); } catch { /* refused */ }
  }
  const itemA = { id: "A1", repo: "o/a", sha: "a".repeat(40), linter: "eslint", rule: "no-tabs", readings: [] };
  const itemB = { id: "B1", repo: "o/b", sha: "b".repeat(40), linter: "eslint", rule: "no-tabs", readings: [] };
  // An earlier run's result, in its own folder and in the flat layout of runs before run folders: neither is "done"
  // for this run, so the item runs again here.
  const earlier = runDirOf(out, "100-1"), now = runDirOf(out, "200-1");
  mkdirSync(earlier, { recursive: true });
  writeResult(earlier, "A1", { id: "A1", runner: { run: "100-1" } });
  writeResult(out, "A1", { id: "A1" });
  if (isDone(now, "A1")) fail.push("another run's result (its folder, or the flat layout) is never this run's");
  mkdirSync(now, { recursive: true });
  const okA = { ...itemA, checked_out: itemA.sha, runner: { run: "200-1" }, install: { outcome: "not-installed" } };
  writeResult(now, "A1", okA);
  if (!isDone(now, "A1")) fail.push("a result in this run's own folder is done (a batch that restarts skips it)");
  const c1 = closeRun([itemA, itemB], now, "200-1");
  if (!same(c1, { errors: [], missing: ["B1"] })) fail.push(`close: A1 is this run's, B1 has no result: ${JSON.stringify(c1)}`);
  // A result that names another run, another commit, or an item not in inputs.json, and a file of no known kind: refused.
  writeResult(now, "B1", { ...itemB, checked_out: itemB.sha, runner: { run: "100-1" } });
  writeFileSync(path.join(now, "note.txt"), "x");
  writeResult(now, "Z9", { id: "Z9", runner: { run: "200-1" } });
  const c2 = closeRun([itemA, itemB], now, "200-1");
  if (!same(c2.errors.map((e) => e.split(":")[0]).sort(), ["B1.json.gz", "Z9.json.gz", "note.txt"]) || c2.missing.length) fail.push(`close refuses another run's result, an unknown item and a stray file: ${JSON.stringify(c2)}`);
  writeResult(now, "B1", { ...itemB, sha: "c".repeat(40), checked_out: "c".repeat(40), runner: { run: "200-1" } });
  if (!closeRun([itemA, itemB], now, "200-1").errors.some((e) => e.startsWith("B1.json.gz: sha"))) fail.push("close refuses a result measured on another commit than inputs.json names");
  // The workflow keys the folder by run id and attempt, uploads only that folder, and commits only that folder.
  const wf = readFileSync(new URL("../../.github/workflows/rule-proof-run.yml", import.meta.url), "utf8");
  const key = "${{ github.run_id }}-${{ github.run_attempt }}";
  if (!wf.includes(`--run ${key}`) || !wf.includes(`path: results/${key}`) || !wf.includes(`path: frame/rule-proof/results/${key}`)
    || !wf.includes(`git add "frame/rule-proof/results/${key}"`) || !wf.includes(`test ! -e "frame/rule-proof/results/${key}"`) || !wf.includes("run-batch.mjs --close")) fail.push("the workflow writes, uploads, checks and commits one run's folder");
}

// ---- A batch: each item in a worker process the runner stops at its own time limit, before the job's ----------------
{
  const { runBatch, runDirOf } = await import("./run-batch.mjs");
  const { installSchema } = await import("./install-schema.mjs");
  const scratch = mkdtempSync(path.join(tmpdir(), "rp-batch-"));
  const runDir = runDirOf(scratch, "300-1");
  const batchModule = fileURLToPath(new URL("./run-batch.mjs", import.meta.url));
  // A fake worker, by mode: finish (writes its result), hang (stuck in the install with a child of its own), crash
  // (exits 3 after the clone), tamper (rewrites the first item's result, then finishes).
  const worker = path.join(scratch, "worker.mjs");
  writeFileSync(worker, `
    import { spawn } from "node:child_process";
    import { readFileSync, writeFileSync } from "node:fs";
    import { resultPath, writePartial, writeResult } from ${JSON.stringify(batchModule)};
    const [mode, runDir, itemJson, limit, runnerJson] = process.argv.slice(2);
    const item = JSON.parse(itemJson), runner = JSON.parse(runnerJson);
    const base = { id: item.id, repo: item.repo, sha: item.sha, checked_out: null, linter: "eslint", rule: "no-tabs", runner };
    writePartial(runDir, item.id, "clone", base);
    if (mode === "crash") { process.stderr.write("boom at clone\\n"); process.exit(3); }
    writePartial(runDir, item.id, "install", { ...base, checked_out: item.sha });
    if (mode === "hang") {
      const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 600000)"], { stdio: "ignore" });
      writeFileSync(runDir + "/../child.pid", String(child.pid));
      setTimeout(() => {}, 600000);
    } else {
      if (mode === "tamper") writeFileSync(resultPath(runDir, "F1"), "forged");
      writeResult(runDir, item.id, { ...base, checked_out: item.sha, install: { outcome: "not-installed" }, ended: { outcome: "finished", cause: null, phase: "done", seconds: 0, limit_seconds: Number(limit) } });
    }
  `);
  const mk = (id, mode) => ({ id, repo: `o/${id}`, sha: "d".repeat(40), linter: "eslint", rule: "no-tabs", readings: [], mode });
  const items = [mk("F1", "finish"), mk("H1", "hang"), mk("C1", "crash"), mk("F2", "finish")];
  const argv = (item, limit, runner) => [process.execPath, worker, item.mode, runDir, JSON.stringify(item), String(limit), JSON.stringify(runner)];
  const runner = { run: "300-1" };
  const validate = (r) => installSchema.parse(r.install);
  const t0 = Date.now();
  const b1 = await runBatch({ items, indices: [0, 1, 2, 3], runDir, runner, argv, itemSeconds: 2, deadlineAt: Date.now() + 600_000, validate, log: () => {} });
  const took = (Date.now() - t0) / 1000;
  const read = (id) => readResult(path.join(runDir, `${id}.json.gz`));
  const h = read("H1");
  if (!same(h.ended, { outcome: "timeout", cause: "timeout", phase: "install", seconds: h.ended?.seconds, limit_seconds: 2, detail: h.ended?.detail })
    || !(h.ended.seconds >= 2 && h.ended.seconds < 6) || !/2 s/.test(h.ended.detail)) fail.push(`a hung item leaves a result with cause timeout, at its phase: ${JSON.stringify(h.ended)}`);
  if (h.checked_out !== "d".repeat(40) || h.runner?.run !== "300-1" || h.install?.attempts?.[0]?.failure?.cause !== "timeout" || h.install.attempts[0].failure.stage !== "install" || !installSchema.safeParse(h.install).success)
    fail.push(`the timeout result keeps what the item had reached and a declared install record: ${JSON.stringify(h).slice(0, 400)}`);
  const childPid = Number(readFileSync(path.join(scratch, "child.pid"), "utf8"));
  // gone, or a zombie waiting for the container's init to reap it; given up to 2 s
  const alive = () => { try { return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${childPid}/stat`, "utf8")); } catch { return false; } };
  for (let i = 0; i < 20 && alive(); i++) await new Promise((r) => setTimeout(r, 100));
  if (alive()) fail.push("the hung item's own child process is killed with it (its process group)");
  if (took > 15) fail.push(`the batch did not wait past the item's limit: ${took} s`);
  const c = read("C1");
  if (c.ended?.outcome !== "crashed" || c.ended.cause !== "unknown" || c.ended.phase !== "clone" || !/exit 3/.test(c.ended.detail) || !/boom at clone/.test(c.ended.detail)) fail.push(`a worker that crashed leaves a result saying so: ${JSON.stringify(c.ended)}`);
  if (read("F1").ended?.outcome !== "finished" || read("F2").ended?.outcome !== "finished") fail.push("finished items keep the worker's own result");
  if (existsSync(path.join(runDir, ".partial"))) fail.push("the progress files are removed after the batch");
  if (!same(b1.mismatched, [])) fail.push(`no result changed after it was written: ${JSON.stringify(b1.mismatched)}`);
  // The run step's deadline: items not started before it get a result with cause timeout, phase not-started.
  const runDir2 = runDirOf(scratch, "301-1");
  const b2 = await runBatch({ items, indices: [0, 3], runDir: runDir2, runner: { run: "301-1" }, argv, itemSeconds: 60, deadlineAt: Date.now() + 1_000, validate, log: () => {} });
  const ns = readResult(path.join(runDir2, "F1.json.gz"));
  if (ns.ended?.outcome !== "timeout" || ns.ended.phase !== "not-started" || ns.install?.attempts?.[0]?.failure?.stage !== "not-started" || b2.results.length !== 2) fail.push(`past the deadline an item is not started, and says so: ${JSON.stringify(ns.ended)}`);
  // A result rewritten by a later item of the same batch is reported, by the sha256 the runner took when it was written.
  const runDir3 = runDirOf(scratch, "302-1");
  const b3 = await runBatch({ items: [mk("F1", "finish"), mk("T1", "tamper")], indices: [0, 1], runDir: runDir3, runner: { run: "302-1" }, argv: (item, limit, rn) => [process.execPath, worker, item.mode, runDir3, JSON.stringify(item), String(limit), JSON.stringify(rn)], itemSeconds: 30, deadlineAt: Date.now() + 600_000, validate, log: () => {} });
  if (!same(b3.mismatched, ["F1.json.gz"])) fail.push(`a result changed by a later item is reported: ${JSON.stringify(b3.mismatched)}`);
  // run.mjs itself, past its deadline: every item of the batch gets its result, no worker started (so no network).
  const inputs4 = path.join(scratch, "inputs.json");
  writeFileSync(inputs4, JSON.stringify([mk("R1", "x"), mk("R2", "x")]));
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL("./run.mjs", import.meta.url)), inputs4, path.join(scratch, "out"), "--run", "400-1", "--items", "0,1", "--deadline-seconds", "1"], { encoding: "utf8" });
  const r4 = ["R1", "R2"].map((id) => { try { return readResult(path.join(scratch, "out", "400-1", `${id}.json.gz`)); } catch { return null; } });
  if (cli.status !== 0 || r4.some((r) => r?.ended?.phase !== "not-started" || r.runner?.run !== "400-1")) fail.push(`run.mjs past its deadline writes a not-started result per item: exit ${cli.status} ${cli.stderr.slice(-300)} ${JSON.stringify(r4.map((r) => r?.ended))}`);
  // The workflow: the runner's deadline comes before the step's timeout, which comes before the job's.
  const wf = readFileSync(new URL("../../.github/workflows/rule-proof-run.yml", import.meta.url), "utf8");
  const runJob = wf.slice(wf.indexOf("\n  run:"), wf.indexOf("\n  commit:"));
  const job = Number(/\n    timeout-minutes: (\d+)/.exec(runJob)?.[1]), step = Number(/\n        timeout-minutes: (\d+)/.exec(runJob)?.[1]);
  const deadline = Number(/--deadline-seconds (\d+)/.exec(runJob)?.[1]), itemS = Number(/--item-seconds (\d+)/.exec(runJob)?.[1]);
  if (!(deadline > 0 && itemS > 0 && itemS < deadline && deadline + 120 <= step * 60 && step < job)) fail.push(`item limit < deadline < step timeout < job timeout: ${itemS} ${deadline} ${step} ${job}`);
}

if (fail.length) { console.log("FAIL:\n  " + fail.join("\n  ")); process.exit(1); }
console.log("ok: batches (at most 256 jobs for any size, one Node version each), one folder per run checked at commit, each item stopped at its limit with a timeout result (its process group killed), cross plan, plugin names, Ruff settings nesting, the commit time as a UTC instant; findings from the linters' JSON reports (line, column, rule, message, ±3 source lines, every finding, long lines kept to 20,000 characters with length and sha256), the linter\'s version and resolved config, on a real ESLint run");
