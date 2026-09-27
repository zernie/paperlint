/**
 * The report guard's listing: a file entry without `messages`, a warning, and a message with no
 * rule (ESLint's own parse errors carry `ruleId: null`). The zero-file refusal and the pass-through
 * are driven end to end by `action.harness.mjs`.
 */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { useTempDir } from "../test/support.ts";
import { guard } from "./eslint-report-guard.mjs";

test("warnings and rule-less messages are listed; a file with no messages counts as linted", () => {
  const report = join(useTempDir("report-guard-"), "report.json");
  writeFileSync(
    report,
    JSON.stringify([
      {
        filePath: "a.md",
        messages: [
          {
            severity: 1,
            line: 2,
            column: 3,
            ruleId: "paper/x",
            message: "soft",
          },
          {
            severity: 2,
            line: 1,
            column: 1,
            ruleId: null,
            message: "Parsing error",
          },
        ],
      },
      { filePath: "b.md" },
    ]),
  );
  assert.deepEqual(guard(report, 1), {
    code: 1,
    lines: [
      "warning a.md:2:3  paper/x  soft",
      "error a.md:1:1  (no rule)  Parsing error",
      "\nlinted 2 file(s) · 2 finding(s) · 1 error(s) · 1 warning(s)",
    ],
  });
});
