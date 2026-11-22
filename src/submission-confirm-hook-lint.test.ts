/**
 * The `submission-confirm` hook over a lint exception: when the paper's lint cannot be run, the
 * exception cannot be approved, and the refusal says why.
 */
import { expect, test } from "vitest";
import { leafCommandsNormalized as shellLeaves } from "vigiles/hook";
import { memoryFiles } from "./adapters/memory/index.ts";
import { err } from "./domain/result.ts";
import { submissionConfirm } from "./submission-confirm-hook.ts";
import { submissionSend, uploadSend } from "./cli.ts";
import { presetsDir } from "./package-dirs.ts";
import { PDF, facts, withPresets } from "../test/submission-fixtures.ts";

test("a lint exception is refused with the reason when the paper's lint could not be run", () => {
  const command =
    "npx paperlint submission update papers/p --submit --save --allow-lint-errors 'Known exception'";
  const screen = submissionConfirm(
    JSON.stringify({
      tool_name: "Bash",
      tool_input: { command },
      cwd: "/w",
      transcript_path: "/t/session.jsonl",
      tool_use_id: "now",
    }),
    {
      files: withPresets(
        memoryFiles({
          "/t/session.jsonl": "",
          "/w/papers/p/paper.pdf": PDF,
          "/w/papers/p/_build/paper.facts.json": facts(),
        }),
      ),
      venuesDir: presetsDir(),
      portalHosts: () => [],
      shellLeaves,
      readSend: submissionSend,
      readUpload: uploadSend,
      lintPaper: () => err("paperlint lint did not produce a report"),
    },
  );
  expect(screen?.hookSpecificOutput.permissionDecision).toBe("deny");
  const shown = screen?.hookSpecificOutput.permissionDecisionReason ?? "";
  expect(shown).toContain(
    "Cannot approve a lint exception: paperlint lint did not produce a report",
  );
  expect(shown).not.toContain("Allow lint errors:");
});
