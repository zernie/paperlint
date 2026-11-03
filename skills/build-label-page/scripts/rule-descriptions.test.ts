/**
 * What a rule does, in the linter's own words. ESLint against the copy installed in this repository
 * (a real catalogue, no network); ruff through a stand-in process holding what `ruff 0.16.9 rule TID253
 * --output-format json` printed (fixtures/ruff-rule-TID253.json), so no test needs the ruff binary.
 */
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test } from "vitest";
import {
  describeRule,
  runProcess,
  type RunProcess,
} from "./rule-descriptions.ts";

const REPO = join(import.meta.dirname, "..", "..", "..");
const TID253 = readFileSync(
  join(import.meta.dirname, "fixtures", "ruff-rule-TID253.json"),
  "utf8",
);
/** `ruff rule <code>` as the binary answers: the recorded JSON for TID253, exit 2 for anything else. */
const fakeRuff: RunProcess = (cmd, args) =>
  cmd === "ruff" && args[1] === "TID253"
    ? { status: 0, stdout: TID253 }
    : { status: 2, stdout: "" };

test("🔴 a ruff rule is described by its own 'What it does' paragraph, on one line", () => {
  assert.equal(
    describeRule({ linter: "ruff", id: "TID253" }, REPO, fakeRuff),
    "Checks for module-level imports that should instead be imported lazily (e.g., within a function definition, or an `if TYPE_CHECKING:` block, or some other nested context).",
  );
});

test("🔴 an ESLint rule is described by meta.docs.description: a core rule, and a plugin rule resolved by the plugin naming convention", () => {
  assert.equal(
    describeRule({ linter: "eslint", id: "no-console" }, REPO, fakeRuff),
    "Disallow the use of `console`",
  );
  assert.equal(
    describeRule(
      { linter: "eslint", id: "@typescript-eslint/no-explicit-any" },
      REPO,
      fakeRuff,
    ),
    "Disallow the `any` type",
  );
});

test("a rule the linter does not know, or a plugin that is not installed has no description (never an invented one)", () => {
  const none = [
    describeRule({ linter: "ruff", id: "NOPE1" }, REPO, fakeRuff),
    describeRule({ linter: "eslint", id: "no-such-rule" }, REPO, fakeRuff),
    describeRule({ linter: "eslint", id: "nope/rule" }, REPO, fakeRuff),
    describeRule({ linter: "eslint", id: "@nope/x/rule" }, REPO, fakeRuff),
    // ruff answers, but without a "What it does" section
    describeRule({ linter: "ruff", id: "TID253" }, REPO, () => ({
      status: 0,
      stdout: JSON.stringify({ explanation: "## Why is this bad?\nx" }),
    })),
  ];
  assert.deepEqual(none, [
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
});

test("the real process runner returns the exit status and what was printed (node stands in for ruff)", () => {
  assert.deepEqual(
    runProcess(process.execPath, [
      "-e",
      "process.stdout.write('x'); process.exit(3)",
    ]),
    { status: 3, stdout: "x" },
  );
});

test("🔴 a relative folder (the documented `build items.json label-page`) is resolved before ESLint is looked up", () => {
  assert.equal(
    describeRule(
      { linter: "eslint", id: "no-console" },
      relative(process.cwd(), REPO) || ".",
      fakeRuff,
    ),
    "Disallow the use of `console`",
  );
});

test("🔴 an ES-module plugin whose rules sit under its default export is described too", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "esm-plugin-")));
  const pkg = join(dir, "node_modules", "eslint-plugin-esmonly");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(
    join(pkg, "package.json"),
    JSON.stringify({
      name: "eslint-plugin-esmonly",
      type: "module",
      main: "index.js",
    }),
  );
  writeFileSync(
    join(pkg, "index.js"),
    'export default { rules: { r: { meta: { docs: { description: "Only via default" } } } } };\n',
  );
  assert.equal(
    describeRule({ linter: "eslint", id: "esmonly/r" }, dir, fakeRuff),
    "Only via default",
  );
});
