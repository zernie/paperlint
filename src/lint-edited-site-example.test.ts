/**
 * paperlint.dev/integrations quotes what the `lint-edited` hook shows Claude Code after an edit
 * (site/src/pages/integrations/model/hook-example.json). This runs the real hook, in-process, on the
 * edit the page describes and fails when what it prints is no longer the quote, so a reworded rule
 * message or trailer cannot leave a stale copy on the site.
 *
 * The edit: a paper for ASE 2026, whose preset requires a «Data Availability Statement» section;
 * a first edit leaves the paper as it is (the hook's snapshot of its errors), the second deletes
 * that section, and the hook reports the one error the second edit introduced.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { z } from "zod";
import { useTempDir, writeTree } from "../test/support.ts";
import { runHook } from "./cli.ts";

const root = useTempDir("lint-edited-example-");

const EXAMPLE = z
  .object({ file: z.string(), reason: z.string() })
  .strict()
  .parse(
    JSON.parse(
      readFileSync(
        join(
          import.meta.dirname,
          "../site/src/pages/integrations/model/hook-example.json",
        ),
        "utf8",
      ),
    ),
  );

const body = (statement: boolean): string =>
  [
    "\\documentclass[sigconf,review,anonymous]{acmart}",
    "\\begin{document}",
    "\\section{Introduction}",
    "Agents edit code.",
    "\\section{Results}",
    "They pass more tests.",
    ...(statement
      ? [
          "\\section{Data Availability Statement}",
          "The scripts and data are in the artifact.",
        ]
      : []),
    "\\end{document}",
    "",
  ].join("\n");

/** The hook on an Edit of `file`; what it printed on stdout. */
async function hookOn(file: string, newString: string): Promise<string> {
  const out: string[] = [];
  const code = await runHook("lint-edited", {
    stdin: () =>
      JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: file, new_string: newString },
      }),
    out: (t) => {
      out.push(t);
    },
    err: (m: string) => {
      throw new Error(`the hook complained: ${m}`);
    },
  });
  assert.equal(code, 0);
  return out.join("");
}

test("the site's quote of the lint-edited hook is what the hook prints for that edit", async () => {
  writeTree(root, {
    "package.json": "{}\n",
    "papers/my-paper/PIPELINE-STATUS.md": "# status\n",
    "papers/my-paper/paperlint.json": JSON.stringify({
      extends: "paperlint:ase-2026",
      kind: "technical",
    }),
    "papers/my-paper/paper.tex": body(true),
  });
  const tex = join(root, EXAMPLE.file);
  assert.equal(await hookOn(tex, "They pass more tests."), "");
  writeFileSync(tex, body(false));
  const { reason } = z
    .object({ decision: z.literal("block"), reason: z.string() })
    .strict()
    .parse(JSON.parse(await hookOn(tex, "They pass more tests.")));
  assert.equal(reason.replaceAll(root + "/", ""), EXAMPLE.reason);
});
