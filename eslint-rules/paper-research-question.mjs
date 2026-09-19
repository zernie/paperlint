/**
 * `paper/research-question` — a shipped paper states its research question EXPLICITLY.
 *
 * Reviewer A's verbatim point on agenticdev (#20), as it was parsed: "State the goal as a
 * research question." This is a venue expectation, not taste: an empirical paper that never
 * names the question it answers forces the reviewer to reconstruct it — and they say so.
 *
 * ── WHY THE SCOPE IS SHIPPED PAPERS ONLY ─────────────────────────────────────────────────
 * A draft never asked anyone to read it. The scope deliberately matches `paper/author-list`:
 * both are about the DEBT of a shipped paper, and an unshipped one has no debt. Measured on the
 * live corpus before the move:
 *     agenticdev-2026   has RQ,   shipped        -> silent  (added because of this very review)
 *     aisec-2026        no RQ,    shipped        -> a finding
 *     compile-rules     no RQ,    shipped        -> a finding
 *     scored-2026       no RQ,    NOT shipped    -> silent
 *
 * ── WHAT THE MOVE CHANGED ─────────────────────────────────────────────────────────────────
 * The predecessor read the stage with a REGEX OVER THE SCORECARD'S PROSE. Remeasured 2026-09-17:
 * for `agenticdev-2026` the prose reads `submitted`, while the `stages` field declares
 * `submitted, camera-ready`. Here the stage comes from the FIELD — the same one `paper/stages`
 * checks against the bytes in both directions.
 *
 * ⚠️ WHAT THE MOVE DOES NOT FIX, AND THIS IS MEASURED, NOT ASSUMED. The rule reads RAW text, not
 * the parsed tree, so a mention of RQ inside a LaTeX comment (`% add an RQ`) will put it to
 * sleep. Measured 2026-09-17 across all four papers: ZERO such cases — not a single match inside
 * a comment. So the hole is LATENT, not observed, and closing it with a tree walk would
 * complicate the rule without a measured difference. The neighboring `paper/typography` is built
 * the same way and for the same reason. Once a real case shows up, there will be something to
 * cite here.
 *
 * The rule is ADVISORY by decision, not by coincidence: a position paper may legitimately have
 * no question. Then its absence is the author's decision, and the rule says exactly that,
 * rather than declaring the absence a defect on its own.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { load } from "js-yaml";

/**
 * Three ways to write the same thing. A regex is LEGITIMATE here: the subject is human prose,
 * which has no structure by definition, and no parser can tell a question's statement apart from
 * a paragraph about it. The list of forms is open on purpose: `\textbf{RQ` — how it's typeset in
 * LaTeX, `RQ1`/`RQ` — how it's referred to in text, `research question` — how it's named in words.
 */
const RQ_RE = /\\textbf\{RQ|\bRQ[0-9]?\b|research question/i;

/** Stages declared by the FIELD. No scorecard or no field — the paper has not shipped. */
function declaredStages(dir, statusName) {
  const p = join(dir, statusName);
  if (!existsSync(p)) return [];
  let text;
  try {
    text = readFileSync(p, "utf-8");
  } catch {
    return [];
  }
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return [];
  let data;
  try {
    data = load(m[1]);
  } catch {
    return []; // the unreadable YAML is already reported by `paper/stages`, on its own file
  }
  const raw = data?.stages;
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => r?.stage).filter(Boolean);
}

export default {
  rules: {
    "research-question": {
      meta: {
        type: "suggestion",
        docs: {
          description:
            "a paper that declares a stage states its research question explicitly — otherwise the reviewer reconstructs it themselves, and says so",
        },
        schema: [
          {
            type: "object",
            properties: {
              // The scorecard's name is a CONSUMER convention. The rule is declared on the
              // paper's source, so it has to name its neighbor itself rather than get it via a
              // config glob.
              statusFile: { type: "string" },
            },
            additionalProperties: false,
          },
        ],
        messages: {
          missing:
            "the paper shipped (stage «{{stages}}») but never states a research question. This is reviewer A's verbatim point on agenticdev (#20). Advisory: a position paper may legitimately have none — but then that is a DECISION, not an omission",
        },
      },
      create(context) {
        const statusName = context.options?.[0]?.statusFile ?? "PIPELINE-STATUS.md";
        return {
          // `root:exit` exists for both markdown and the `tex/latex` language — the same place
          // `paper/typography` lives, and for the same reason: a paper in this corpus can be
          // either.
          "root:exit"(node) {
            const raw = context.sourceCode.raw ?? context.sourceCode.text;
            if (typeof raw !== "string") return;
            const stages = declaredStages(dirname(context.filename), statusName);
            if (stages.length === 0) return; // not shipped — owes nothing
            if (RQ_RE.test(raw)) return;
            context.report({ node, messageId: "missing", data: { stages: stages.join("/") } });
          },
        };
      },
    },
  },
};
