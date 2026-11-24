/**
 * `paperlint lint --json` as the tests read it: ESLint's results, parsed at the boundary with the
 * fields the checks use, every other field kept. A test that cast `JSON.parse(stdout)` to the shape
 * it hoped for got `undefined` deep inside an assertion when the shape moved; this fails at the
 * parse, naming the field.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { run } from "../src/cli.ts";
import { useTempDir, writeTree } from "./support.ts";

export const LintReport = z.array(
  z.looseObject({
    filePath: z.string(),
    messages: z.array(
      z.looseObject({
        ruleId: z.string().nullable(),
        severity: z.number(),
        line: z.number().optional(),
        message: z.string(),
      }),
    ),
  }),
);

/** The parsed report of one `--json` run. */
export const lintReport = (stdout: string) =>
  LintReport.parse(JSON.parse(stdout));

/** One message of a run, with its file relative to the project. */
export type TreeMessage = z.infer<
  typeof LintReport
>[number]["messages"][number] & {
  readonly file: string;
};

/** `paperlint lint --json` over `tree` in a temp project, in-process through the CLI: every message, by file. */
export async function lintTree(
  tree: Record<string, string | Uint8Array>,
  emptyDirs: readonly string[] = [],
): Promise<TreeMessage[]> {
  const dir = writeTree(useTempDir("paperlint-rule-cases-"), {
    "package.json": '{"name":"consumer","private":true}',
    ...tree,
  });
  emptyDirs.forEach((d) => mkdirSync(join(dir, d), { recursive: true }));
  const out: string[] = [];
  await run(["lint", "--json"], {
    cwd: dir,
    log: (...a: unknown[]) => out.push(a.join(" ")),
    err: () => undefined,
  });
  return lintReport(out.join("\n")).flatMap((r) =>
    r.messages.map((m) => ({ ...m, file: r.filePath.slice(dir.length + 1) })),
  );
}
