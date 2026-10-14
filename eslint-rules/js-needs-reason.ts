/**
 * `local/js-needs-reason` — a NEW JavaScript file says, at its top, why it is not TypeScript.
 *
 * New code is TypeScript (#78). `TYPESCRIPT_ONLY` in `eslint.config.mjs` holds that for the
 * directories already converted; everywhere else a new `.mjs` arrived whenever its neighbours were
 * `.mjs`, which is not a reason. This rule closes the rest: a `.js`, `.mjs` or `.cjs` file that is
 * not in the grandfathered list must open with a comment naming one of the accepted reasons:
 *
 *   // JavaScript, not TypeScript: evidence — <why>       kept byte for byte as it ran
 *   // JavaScript, not TypeScript: fixture — <why>        checked AS JavaScript by a test
 *   // JavaScript, not TypeScript: config-loader — <why>  read by a loader that cannot read TS
 *
 * "Smaller", "faster" and "the neighbours are .mjs" are not on the list. Code a consumer runs from
 * `node_modules` is TypeScript too, compiled (`tsconfig.skills.json`, `tsconfig.pkg.json`).
 *
 * WHY A LIST AND NOT "ADDED SINCE THE BASE BRANCH". A rule may not run git (`GIT_IN_A_RULE` in
 * the config: a shallow CI checkout has no base). The JavaScript files that existed when the rule
 * arrived are listed in `js-grandfathered.json`; that list may only shrink, and
 * `js-needs-reason.test.ts` fails on an entry whose file is gone.
 */
import { relative, sep } from "node:path";
import type { Program } from "estree";
import { z } from "zod";
import type { RuleContext } from "./rule-context.ts";

/** The comment that excuses a JavaScript file, and the reasons it may give. */
const REASON =
  /JavaScript, not TypeScript: (?:evidence|fixture|config-loader)\b/;

const Options = z.tuple([
  z.object({ grandfathered: z.array(z.string()).readonly() }),
]);

interface Comment {
  readonly type: string;
  readonly value: string;
  readonly range: readonly [number, number];
}

/** What this rule reads beyond the shared slice: the working directory and the comments. */
type Context = RuleContext & {
  readonly cwd: string;
  readonly sourceCode: { getAllComments(): readonly Comment[] };
};

/** Does a comment that names an accepted reason come before the first statement? */
const excused = (comments: readonly Comment[], codeStart: number): boolean =>
  comments.some(
    (c) =>
      c.type !== "Shebang" && c.range[0] < codeStart && REASON.test(c.value),
  );

export default {
  rules: {
    "js-needs-reason": {
      meta: {
        type: "problem" as const,
        docs: {
          description:
            "a JavaScript file that is not grandfathered names why it is not TypeScript at its top",
        },
        schema: [
          {
            type: "object",
            properties: {
              grandfathered: { type: "array", items: { type: "string" } },
            },
            required: ["grandfathered"],
            additionalProperties: false,
          },
        ],
        messages: {
          noReason:
            "New code is TypeScript (#78): write this file as .ts, or open it with " +
            "`// JavaScript, not TypeScript: evidence|fixture|config-loader — <why>` " +
            "(evidence kept exactly as it ran; a fixture checked as JavaScript; a config a loader " +
            "that cannot read TypeScript reads).",
        },
      },
      create(context: Context) {
        const [{ grandfathered }] = Options.parse(context.options);
        const path = relative(context.cwd, context.filename)
          .split(sep)
          .join("/");
        return {
          Program(node: Readonly<Program>) {
            if (grandfathered.includes(path)) return;
            const starts = node.body.map((s) => Number(s.range?.[0]));
            const codeStart = Math.min(Infinity, ...starts);
            if (excused(context.sourceCode.getAllComments(), codeStart)) return;
            context.report({ node, messageId: "noReason" });
          },
        };
      },
    },
  },
};
