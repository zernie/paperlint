/**
 * `fixtures/build-e2e/<name>/expect.json` — what one build fixture must produce, as data. The build
 * e2e (`build.e2e.ts`) reads every fixture directory, parses this file with the schema below, and
 * turns each field that is present into a test. A new fixture is a new folder with its paper and its
 * `expect.json`; no test code changes. A folder without the file, or with a file the schema rejects,
 * fails.
 *
 * Named without `.e2e.ts`, so the e2e project's glob does not take it for a test file.
 */
import { z } from "zod";

/** One finding `paperlint lint --json` must report for a rule. */
const Finding = z.strictObject({
  /** 1 warning, 2 error. */
  severity: z.union([z.literal(1), z.literal(2)]),
  /** The line it points at, when that is part of the claim. */
  line: z.number().int().positive().optional(),
  /** Substrings the message contains, every one of them. */
  says: z.array(z.string()).default([]),
});
export type Finding = z.infer<typeof Finding>;

/** A regular expression's source, checked to compile here rather than at use. */
const Pattern = z.string().refine((s) => {
  try {
    new RegExp(s);
    return true;
  } catch {
    return false;
  }
}, "not a valid regular expression");

export const FixtureExpect = z.strictObject({
  /** Why this fixture exists, for a reader of the JSON. */
  $comment: z.string().optional(),
  /**
   * `pdf`: `paperlint build` writes paper.pdf. `failed`: it does not — and a stale paper.pdf planted
   * before the run must be gone after it, so an earlier build cannot pass for this one.
   */
  build: z.discriminatedUnion("outcome", [
    z.strictObject({
      outcome: z.literal("pdf"),
      pages: z.number().int().positive().optional(),
    }),
    z.strictObject({ outcome: z.literal("failed") }),
  ]),
  /** Substrings of THIS paper's lines in the build output: its name, then the lines under it. */
  says: z.array(z.string()).default([]),
  saysNot: z.array(z.string()).default([]),
  /** The PDF's font names, as paperlint's pdf.js reader lists them. */
  fonts: z
    .strictObject({
      /** Every name matches. */
      all: Pattern.optional(),
      /** At least one name matches. */
      some: Pattern.optional(),
      /** No name matches. */
      none: Pattern.optional(),
      /** The embedded fonts pdf.js finds are exactly the ones pdfTeX's log says it embedded. */
      matchLog: z.boolean().default(false),
    })
    .optional(),
  /** The text of the PDF's last page. */
  text: z
    .strictObject({
      contains: z.array(z.string()).default([]),
      lacks: z.array(z.string()).default([]),
    })
    .optional(),
  /** Files in the paper's directory after the build, by path relative to it. */
  files: z
    .strictObject({
      exist: z.array(z.string()).default([]),
      absent: z.array(z.string()).default([]),
      /** A file, and substrings it must not contain. */
      lacks: z.record(z.string(), z.array(z.string())).default({}),
    })
    .optional(),
  /** `_build/paper.facts.json`, as the build wrote it. */
  facts: z
    .strictObject({
      schema: z.number().int(),
      /** The last page's two column heights, in pt, to 0.1. */
      lastPageColumnsPt: z.tuple([z.number(), z.number()]).optional(),
    })
    .optional(),
  /** `paperlint lint <paper> --json` after the build. */
  lint: z
    .strictObject({
      /** Written as the paper's paperlint.json before linting, replacing the fixture's. */
      paperlintJson: z.record(z.string(), z.unknown()).optional(),
      /** The exit code, when that is part of the claim. */
      exit: z.number().int().optional(),
      /** How many findings are errors, when that is part of the claim. */
      errors: z.number().int().nonnegative().optional(),
      /** For each rule named: EXACTLY these findings, in line order. `[]` means none. */
      rules: z.record(z.string(), z.array(Finding)).default({}),
    })
    .optional(),
});
export type FixtureExpect = z.infer<typeof FixtureExpect>;

/** An `expect.json`'s text → the expectation, or why it is not one. */
export function parseExpect(
  text: string | null,
): { ok: true; value: FixtureExpect } | { ok: false; why: string } {
  if (text === null)
    return {
      ok: false,
      why: "no expect.json — every fixture declares what it must produce",
    };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      why: `expect.json is not JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const r = FixtureExpect.safeParse(json);
  return r.success
    ? { ok: true, value: r.data }
    : { ok: false, why: `expect.json: ${z.prettifyError(r.error)}` };
}
