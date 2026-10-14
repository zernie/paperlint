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
 * The rule reports EVERY JavaScript file without a reason; it keeps no list of its own. The files
 * that existed when it arrived are ESLint bulk suppressions in `eslint-suppressions.json`, which
 * only shrinks: a suppression that no longer matches fails `eslint .` until
 * `--prune-suppressions` removes it. Not "added since the base branch": a rule may not run git
 * (`GIT_IN_A_RULE` in the config — a shallow CI checkout has no base).
 */
import type { Program } from "estree";
import type { RuleContext } from "./rule-context.ts";

/** The comment that excuses a JavaScript file, and the reasons it may give. */
const REASON =
  /JavaScript, not TypeScript: (?:evidence|fixture|config-loader)\b/;

interface Comment {
  readonly type: string;
  readonly value: string;
  readonly range: readonly [number, number];
}

/** What this rule reads beyond the shared slice: the comments. */
type Context = RuleContext & {
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
            "a JavaScript file names why it is not TypeScript at its top",
        },
        schema: [],
        messages: {
          noReason:
            "New code is TypeScript (#78): write this file as .ts, or open it with " +
            "`// JavaScript, not TypeScript: evidence|fixture|config-loader — <why>` " +
            "(evidence kept exactly as it ran; a fixture checked as JavaScript; a config a loader " +
            "that cannot read TypeScript reads).",
        },
      },
      create(context: Context) {
        return {
          Program(node: Readonly<Program>) {
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
