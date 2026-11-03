// Selftest of run.mjs's pure parts: node frame/rule-proof/run.selftest.mjs (exit 1 on a defect).
import { crossPlan, dateMatched, pluginOf, ruffSettings } from "./run.mjs";

const fail = [];
const plan = crossPlan([{ proved: true, pair: {} }, { proved: false, pair: {} }, { proved: true, pair: {} }, { proved: true, pair: null }]);
if (JSON.stringify(plan) !== JSON.stringify([[0, 2], [2, 0]])) fail.push(`crossPlan ${JSON.stringify(plan)}: proved readings with a pair, both directions, never itself`);
if (crossPlan([{ proved: true, pair: {} }]).length !== 0) fail.push("one reading has nothing to cross");
if (pluginOf("@typescript-eslint/no-unused-vars") !== "@typescript-eslint/eslint-plugin" || pluginOf("quotes") !== null || pluginOf("import/order") !== "eslint-plugin-import") fail.push("pluginOf");
if (JSON.stringify(ruffSettings({ "line-length": 100, "flake8-tidy-imports.banned-api": { a: 1 } }, "0.6.0")) !== JSON.stringify({ "line-length": 100, lint: { "flake8-tidy-imports": { "banned-api": { a: 1 } } } })) fail.push("ruffSettings");
if (dateMatched({ "0.1.0": [{ upload_time_iso_8601: "2024-01-01T00:00:00Z" }], "0.2.0": [{ upload_time_iso_8601: "2025-01-01T00:00:00Z" }] }, "2024-06-01T00:00:00Z") !== "0.1.0") fail.push("dateMatched");
if (fail.length) { console.log("FAIL:\n  " + fail.join("\n  ")); process.exit(1); }
console.log("ok: cross plan, plugin names, Ruff settings nesting, date-matched Ruff");
