/**
 * `review/findings-closed` — a review's findings do not stay open.
 *
 * A review under `reviews/` records its findings in the frontmatter (`review/frontmatter`).
 * Findings get written and never closed: one consumer project held 499 open ones from a single
 * month. This rule reports each finding whose `status` is still `open`, one report per finding,
 * naming its id, its title and, when the record has one, `where` it is.
 *
 * It is a process rule, not a venue's: no call for papers says a review must be closed, so it
 * ships off and a project turns it on in `paperlint.json` (`docs/rules/review/findings-closed.md`).
 *
 * The record is read by `parseFrontmatter` of `review/frontmatter`, so there is one reader. A
 * block that does not parse is `review/frontmatter`'s to report; here it holds no findings. An
 * entry that is no mapping, or has no `open` status, is skipped: the schema reports those.
 */
import * as R from "remeda";
import { z } from "zod";
import { parseFrontmatter } from "./frontmatter-record.ts";
import type { RuleContext } from "./rule-context.ts";

/** What this rule reads of one finding; any other field is ignored. */
const OpenFinding = z.object({
  id: z.union([z.number(), z.string()]),
  status: z.literal("open"),
  title: z.string().optional().catch(undefined),
  where: z.string().optional().catch(undefined),
});

/** The findings of a record that are still open, in the order written. */
const openFindings = (data: unknown) =>
  R.pipe(
    z
      .object({ findings: z.array(z.unknown()) })
      .catch({ findings: [] })
      .parse(data).findings,
    R.map((f) => OpenFinding.safeParse(f)),
    R.filter((r) => r.success),
    R.map((r) => r.data),
  );

/** One open finding as a line: `finding 3 is still open: <title> (<where>)`. */
const describe = (f: Readonly<z.infer<typeof OpenFinding>>): string =>
  `finding ${String(f.id)} is still open` +
  (f.title === undefined ? "" : `: ${f.title}`) +
  (f.where === undefined ? "" : ` (${f.where})`);

export default {
  meta: {
    type: "problem" as const,
    docs: {
      description:
        "a review's findings are closed: none has status `open` (optional; off until a project turns it on)",
      url: "https://github.com/zernie/paperlint/blob/main/docs/rules/review/findings-closed.md",
    },
    schema: [],
    messages: { open: "{{problem}}" },
  },
  create(context: RuleContext) {
    return {
      yaml(node: { readonly value?: string }) {
        const read = parseFrontmatter(node.value);
        if (read.ok)
          R.forEach(openFindings(read.data), (f) =>
            context.report({
              node,
              messageId: "open",
              data: { problem: describe(f) },
            }),
          );
      },
    };
  },
};
