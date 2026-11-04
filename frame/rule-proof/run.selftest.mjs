// Selftest of run.mjs's pure parts: node frame/rule-proof/run.selftest.mjs (exit 1 on a defect).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findingsSchema, jsonSchema } from "./install-schema.mjs";
import { FINDINGS_CAP, contextOf, crossPlan, fileFindings, findingsOf, parseFindings, pluginOf, ruffSettings, utcInstant } from "./run.mjs";

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
if (!same(contextOf("a\r\nbcdefgh\r\n", 2, 0, 3), [{ n: 2, text: "bcd", mark: true, cut: 7 }])) fail.push(`a long line is cut and says its length; CRLF read as one break: ${JSON.stringify(contextOf("a\r\nbcdefgh\r\n", 2, 0, 3))}`);
if (FINDINGS_CAP.per_file !== 5 || FINDINGS_CAP.context !== 3) fail.push(`cap: 5 findings per file, 3 lines each side: ${JSON.stringify(FINDINGS_CAP)}`);

// Per file: sorted by line then column, the first `per_file` kept, the total and whether the cap applied.
const seven = Array.from({ length: 7 }, (_, i) => ({ path: "src/a.js", line: 9 - i, column: 1, ruleId: "no-tabs", message: "m" }));
const ff = fileFindings([...seven, { path: "src/z.js", line: 1, column: 2, ruleId: "no-tabs", message: "m" }],
  (p) => (p === "src/a.js" ? text : "only\n"), { per_file: 5, context: 1, line_chars: 400 });
if (ff["src/a.js"]?.total !== 7 || ff["src/a.js"]?.capped !== true || ff["src/a.js"]?.items.map((x) => x.line).join() !== "3,4,5,6,7")
  fail.push(`seven findings: the first five by line, total 7, capped: ${JSON.stringify(ff["src/a.js"])}`);
if (!same(ff["src/z.js"], { total: 1, capped: false, items: [{ line: 1, column: 2, ruleId: "no-tabs", message: "m", lines: [{ n: 1, text: "only", mark: true }] }] }))
  fail.push(`one finding: not capped, its source line marked: ${JSON.stringify(ff["src/z.js"])}`);
if (!same(fileFindings([{ path: "gone.js", line: 1, column: 1, ruleId: "x", message: "m" }], () => null, FINDINGS_CAP)["gone.js"].items[0].lines, []))
  fail.push("a file that cannot be read gives no source lines, not a crash");

// The record a result carries is declared once and is in the emitted schema.
const rec = { cap: FINDINGS_CAP, files: ff };
if (!findingsSchema.safeParse(rec).success) fail.push(`the findings record parses under findingsSchema: ${JSON.stringify(findingsSchema.safeParse(rec).error?.issues)}`);
if (findingsSchema.safeParse({ cap: FINDINGS_CAP, files: { "a.js": { total: 1, capped: false, items: [{ line: "4" }] } } }).success) fail.push("a finding without its fields is refused");
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
const got = findingsOf(pinned, reading, ["src/bad.js", "src/good.js"]);
const bad = got.files?.["src/bad.js"];
if (!bad || bad.total !== 1 || bad.items[0].line !== 3 || bad.items[0].column !== 1 || bad.items[0].ruleId !== "no-tabs"
  || !bad.items[0].lines.find((l) => l.mark && l.text === "\tconsole.log(a);")) fail.push(`real ESLint: the tab at line 3, column 1, marked: ${JSON.stringify(got)}`);
if (got.files?.["src/good.js"] !== undefined || got.files?.["src/other.js"] !== undefined) fail.push(`real ESLint: no finding for the clean file or an unlisted one: ${JSON.stringify(Object.keys(got.files ?? {}))}`);
if (!findingsSchema.safeParse(got).success) fail.push(`the real record parses: ${JSON.stringify(findingsSchema.safeParse(got).error?.issues)}`);
const broken = findingsOf({ ...pinned, run: { ...pinned.run, command: [process.execPath, "-e", "process.exit(2)", "--"] } }, reading, ["src/bad.js"]);
if (typeof broken.error !== "string" || Object.keys(broken.files).length !== 0) fail.push(`a linter that exits outside its report codes gives an error, not empty findings: ${JSON.stringify(broken)}`);

if (fail.length) { console.log("FAIL:\n  " + fail.join("\n  ")); process.exit(1); }
console.log("ok: cross plan, plugin names, Ruff settings nesting, the commit time as a UTC instant; findings from the linters' JSON reports (line, column, rule, message, ±3 source lines, 5 per file), on a real ESLint run");
