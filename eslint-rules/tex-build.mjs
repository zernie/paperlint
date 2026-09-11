/**
 * tex-build — rules about the BUILT LaTeX paper: about what the preamble declares, not about
 * how the prose is written.
 *
 * ── WHY ITS OWN NAMESPACE, AND NOT `paper/*` ────────────────────────────────
 * In the source corpus the `paper/*` family is declared on BOTH `paper.md` and `paper.tex`,
 * and that parity is pinned by an assertion: "a rule added for markdown must not silently
 * fail to reach LaTeX (or the other way round)". The subject here is the BUILD MODE
 * (`\documentclass[review]`, `printacmref=false`), and in markdown it does not exist: a draft
 * has no mechanical sign saying "this build is the final one". Writing
 * `paper/future-promise: "off"` on markdown would be an exemption justified by "there is no
 * subject", and that same parity assertion requires the rule to be ALIVE on the other side —
 * i.e. the machinery exists but is built for the opposite direction (off on `.tex`, alive on
 * `.md`).
 *
 * Hence a namespace of its own, the same way an external word-counter gets one: it has a word
 * count markdown does not have, we have a preamble markdown does not have. Where the config
 * enumerates non-`paper/*` rules on `.tex`, the list is CLOSED and `tex/future-promise` is
 * named explicitly, so that a new namespace arrives by decision rather than as a side effect
 * of editing a config.
 *
 * ⚠️ THE MEASUREMENT THIS DECISION RESTS ON (source corpus, 2026-09-06 → 2026-09-07): had the
 * rule been declared on `paper.md` it would produce ZERO there TODAY — not one match of
 * `FUTURE_PROMISE_RE` in the markdown draft of the one paper that has one. So the choice is
 * about semantics, not noise: markdown has no input distinguishing a draft from a shipped
 * build, and the rule would fire on a draft's honest promise.
 *
 * ── THE RULE READS THE FILE FROM DISK, NOT THE PROJECTION. This is load-bearing ──
 * The LaTeX language in `latex-language.mjs` hands rules a PROJECTION of `.tex` into a
 * markdown-like text, and the first thing that projection does is blank the whole preamble
 * (`blank(0, preEnd)`) plus `\documentclass` and `\settopmatter` as OPAQUE macros. Both signs
 * of the build mode are therefore ERASED in the projection, and this check is inexpressible
 * over `sourceCode.getText()`. `readFileSync(context.filename)` is the same thing sibling
 * rules in the source corpus do when they read a registry file next to the paper; the only
 * difference is that here the file being read is the linted file itself. The one side effect
 * is named: in an editor with an unsaved buffer the rule judges the saved version. On a CLI
 * run (and in CI) there is no such difference.
 *
 * ── WHAT THE MOVE TO A LINT RULE FIXED BESIDES THE FORM (measured 2026-09-07) ──
 * 🔴 The previous implementation, a script, picked its input like this: look for `paper.md` /
 * `draft.md`, and failing that take `readdirSync(dir).find((f) => f.endsWith(".tex"))` — the
 * FIRST `.tex` in directory order. Measured across the three papers of the source corpus:
 *   paper A → a 536-BYTE file holding nine `\def`s with venue numbers. The check, added
 *             specifically BECAUSE of paper A, was not reading paper A;
 *   paper B → a four-month-old draft, one of SEVEN `.tex` files in that directory (the real
 *             `paper.tex` happened to get the same verdict — "review mode" — so the set of
 *             findings matched by accident, not by construction);
 *   paper C → `paper.tex`, the only `.tex` there; it matched.
 * An ESLint rule runs over the glob declared in the config, so the address stopped depending
 * on `readdirSync` order and on how many drafts happen to lie next to the paper.
 */
import { readFileSync } from "node:fs";

/**
 * A copy rather than an import, for the same reason the prose lexicons are copies: a rule may
 * not depend on the script it is replacing, or removing the check from that script becomes
 * impossible.
 */
const FUTURE_PROMISE_RE =
  /\b(?:at (?:the )?camera[-\s]?ready|upon acceptance|on acceptance|will be (?:released|published|made (?:publicly )?available|public|open[-\s]?sourced))\b/i;

/** The same two signs a render script uses to tell a review build from a camera-ready one. */
const REVIEW_MODE_RE =
  /^[^%\n]*(?:\\documentclass\[[^\]]*\breview\b|printacmref=false)/m;

// ═════════════════════════════════════════════════════════════════════════════
// future-promise — a shipped build promises what it has already handed over
// ═════════════════════════════════════════════════════════════════════════════
// 🔴 Added 2026-08-24, because it would have caught a real blocker hours earlier. An accepted
// paper printed "(full harness at camera-ready)" in BOTH of its most-read positions — the end
// of the abstract and the end of the conclusion — while its own Availability paragraph three
// lines below said the harness was already public. The document contradicted itself two
// against one, and the losing side was the abstract: exactly the part a digital library
// indexes and the only part most people read.
//
// Worse than a typo: a reviewer had listed it as a weakness — "The experimental harness is not
// yet available (it is expected for the camera-ready version)" — so the printed camera-ready
// kept asserting the very thing the reviewer complained about.
//
// ⚠️ Here is why it survived, and it generalises. The promise WAS swept out the same day — out
// of the ARTIFACT (`README:34`, `reproduce.py:166`). Nobody made the same pass over
// `paper.tex`. One class of defect, two carriers, one of them cleaned. A human pass goes where
// the human is looking; this check goes to both places, because it does not know where anyone
// is looking.
//
// The scope is DELIBERATELY NARROW, because a noisy gate is a silenced gate:
//   - `.tex` only (see the file header: markdown has no sign of "this build is final");
//   - a review-mode build is EXEMPT, and that is the whole point: during peer review
//     "at camera-ready" is a true and ordinary promise. The defect is only a promise that
//     outlived its own delivery;
//   - LaTeX comments are blanked FIRST: author notes of the form `% camera-ready blocker`
//     legitimately live in the source, and a finding on those would be precisely the false
//     positive that kills a check.
//
// SEVERITY is `warn`, and that is an analysis rather than caution. The finding is NOT binary:
// a promise in a camera-ready is sometimes honest (something genuinely not released yet), and
// the verdict "does it contradict the Availability paragraph" is made by a human — which is
// what the message text says. There is also a demonstrable class of false positives: "their
// replication will be published in 2027" is a sentence about SOMEONE ELSE's work. An `error`
// that fails on a correct input gets switched off the same day, and after that the binary
// checks stop being read too.
const futurePromise = {
  meta: {
    type: "problem",
    docs: {
      description:
        "the build is not in review mode, yet the text promises a future release of something already handed over",
    },
    schema: [],
    messages: {
      promise:
        "this build is NOT in review mode, but the text promises a future release: " +
        "«{{text}}». Check it against Availability: if the thing is already published, the " +
        "paper contradicts itself, and the abstract is the side that loses — the abstract is " +
        "what the digital library indexes. That is exactly how «(full harness at " +
        "camera-ready)» survived a sweep that went through the artifact and never went " +
        "through paper.tex",
    },
  },
  create(context) {
    return {
      root() {
        // 🔴 ONE GUARD, NOT THREE. The first draft had `if (!file || !existsSync(file))`
        // BEFORE the read — and a mutation run on 2026-09-07 showed that removing that line is
        // caught by NOTHING: the `try/catch` around the read covers exactly the same cases (no
        // path, a `<text>` run through stdin, no permission). Two guards doing one job is a
        // guard no mutation can kill, i.e. a dead assertion dressed as robustness.
        // What is left is the read inside `try`: stay quiet rather than judge content we never
        // saw.
        let text;
        try {
          text = readFileSync(context.filename, "utf8");
        } catch {
          return;
        }
        if (REVIEW_MODE_RE.test(text)) return;
        // Comments are blanked by CUTTING THE TAIL of the line, exactly as the previous
        // implementation did. Columns do not shift: a match is only possible to the LEFT of
        // `%`, and the left part of the line stays in place character for character. An
        // escaped `\%` is not a comment.
        const lines = text
          .split("\n")
          .map((l) => l.replace(/(^|[^\\])%.*$/, "$1"));
        lines.forEach((line, i) => {
          const m = line.match(FUTURE_PROMISE_RE);
          if (!m) return;
          const column = m.index + 1;
          context.report({
            loc: {
              start: { line: i + 1, column },
              end: { line: i + 1, column: column + m[0].length },
            },
            messageId: "promise",
            data: { text: m[0] },
          });
        });
      },
    };
  },
};

export default { "future-promise": futurePromise };
