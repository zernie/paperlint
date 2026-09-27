/**
 * `paperlint lint --json` as the tests read it: ESLint's results, parsed at the boundary with the
 * fields the checks use, every other field kept. A test that cast `JSON.parse(stdout)` to the shape
 * it hoped for got `undefined` deep inside an assertion when the shape moved; this fails at the
 * parse, naming the field.
 */
import { z } from "zod";

export const LintReport = z.array(
  z.looseObject({
    filePath: z.string(),
    messages: z.array(
      z.looseObject({
        ruleId: z.string().nullable(),
        severity: z.number(),
        message: z.string(),
      }),
    ),
  }),
);

/** The parsed report of one `--json` run. */
export const lintReport = (stdout: string) =>
  LintReport.parse(JSON.parse(stdout));
