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

/** Is this an `acmart` build at all? Outside acmart none of the macros below mean anything. */
const ACMART_RE = /\\documentclass(?:\s*\[[^\]]*\])?\s*\{acmart\}/;

/**
 * acmart's OWN escape hatch for "this is not going to an ACM venue": in `nonacm` mode the
 * class disables the ACM Reference Format itself (`acmart.cls:110-121`, "in 'nonacm' mode we
 * disable the \"ACM Reference Format\""). A build that declares it is not an ACM submission
 * is exempt — that is the supported way to say so, and it is a class option rather than a
 * hand-rolled blanking of the front matter.
 */
const NONACM_RE = /\\documentclass\s*\[[^\]]*\bnonacm\b/;

/**
 * The overrides whose ENTIRE effect is to remove furniture the template puts on page 1.
 * Each entry names what disappears, because a message that only says "do not do this" gets
 * read as style advice.
 */
const FRONTMATTER_OVERRIDES = [
  {
    re: /\\setcopyright\s*\{\s*none\s*\}/g,
    removes: "the copyright statement (acmart.cls:1857, copyright mode 0)",
  },
  {
    re: /\\renewcommand\s*\*?\s*\{?\s*\\footnotetextcopyrightpermission/g,
    removes:
      "the permission/copyright footnote block on page 1 (acmart.cls:2180)",
  },
  {
    re: /\\(?:this)?pagestyle\s*\{\s*(?:plain|empty)\s*\}/g,
    removes:
      "acmart's own page style, i.e. the running heads and folios it restores at " +
      "\\begin{document} (acmart.cls:2876-2881)",
  },
];

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

// ══════════════════════════════════════════════════════════════════════════════
// acm-frontmatter-override — the build blanks template furniture off page 1
// ══════════════════════════════════════════════════════════════════════════════
// 🔴 Added 2026-09-11, from a DESK REJECT. A submission was rejected before any content
// review with the reason "substantially deviating from the specified template… front page
// lacks elements included in the template". Its preamble carried three lines whose entire
// effect is to take elements off the front page:
//
//     \setcopyright{none}
//     \renewcommand\footnotetextcopyrightpermission[1]{}
//     \pagestyle{plain}
//
// The same three lines sit COMMENTED OUT in a sibling paper of the same corpus — the one that
// was accepted. The safer pattern was already known in the same directory and was not carried
// over. That is the shape this check exists for: a defect that is invisible in the source,
// visible only on the rendered first page, and fatal before anyone reads a word.
//
// ⚠️ THE RULE IS NOT CONDITIONED ON REVIEW MODE, AND THAT IS A MEASUREMENT, NOT A CHOICE.
// The obvious framing — "flag these when `\documentclass[review]`, because review mode already
// handles the front matter" — does not survive reading `acmart.cls`. The `review` option does
// exactly two things (`acmart.cls:93-99`): it turns on line numbers and sets
// `\@ACM@printfoliostrue`. It does not touch the copyright statement, the permission footnote
// or the page style. So the overrides are not fighting review mode; they strip the same
// furniture in EVERY mode — and stripping it in the camera-ready is worse, because that is
// the version the digital library keeps.
//
// The guards are therefore about the CLASS, not the stage:
//   - `acmart` only. Outside it `\pagestyle{plain}` is an ordinary, correct line;
//   - `nonacm` exempts, because that is acmart's own supported way to say "not an ACM venue",
//     and in that mode the class disables the ACM Reference Format itself (`acmart.cls:110`).
//
// 🔴 `printacmref=false` IS DELIBERATELY NOT IN THE SET, though it was in the rejected preamble
// and it too removes a block from page 1. Two reasons, and the first is structural: the
// sibling rule in this very file reads `printacmref=false` as a SIGN OF REVIEW MODE
// (`REVIEW_MODE_RE`). A module where one rule treats a token as a legitimate marker and
// another calls the same token a defect is a module that contradicts itself, and the reader
// cannot tell which half to believe. The second is that ACM sanctions it for preprints. If it
// ever needs catching, it needs catching together with a decision about `REVIEW_MODE_RE` —
// not as a fourth line in this array.
//
// SEVERITY is for the CONSUMER to set, and the two configs differ on purpose: this repository
// lints fixtures that are broken by construction, a consumer lints a real paper. The finding
// is binary — the macro is present or it is not — it has a named exemption, and the cost of a
// miss is a rejection with no content review. In a consumer that is `error`.
const acmFrontmatterOverride = {
  meta: {
    type: "problem",
    docs: {
      description:
        "an acmart build overrides ACM's front-matter commands, removing template elements from page 1",
    },
    schema: [],
    messages: {
      override:
        "«{{text}}» removes {{removes}} from the front page of an `acmart` build. A submission " +
        "was desk-rejected for exactly this — «substantially deviating from the specified " +
        "template… front page lacks elements included in the template» — before any content " +
        "review happened. The `review` option does not suppress this furniture itself " +
        "(acmart.cls:93-99 turns on line numbers and folios, nothing else), so the line is not " +
        "compensating for the class: it is fighting the template. Delete it. If this paper " +
        "genuinely is not going to an ACM venue, say so the supported way — " +
        "`\\documentclass[…,nonacm]{acmart}` — and the class drops the ACM Reference Format " +
        "on its own",
    },
  },
  create(context) {
    return {
      root() {
        // Same single guard as the sibling rule, and for the same measured reason: a separate
        // `existsSync` before the read is covered by this `catch` in every case it could
        // fire, i.e. it is an assertion no mutation can kill.
        let text;
        try {
          text = readFileSync(context.filename, "utf8");
        } catch {
          return;
        }
        // Comments are blanked BEFORE the guards, not only before the search — unlike the
        // sibling rule, which carries the `^[^%\n]*` prefix inside each pattern instead.
        // It matters here: the accepted sibling paper of the source corpus keeps this exact
        // block commented out as a record of what it used to do, and a `\documentclass` line
        // quoted inside a comment must not arm the rule any more than a commented
        // `\setcopyright{none}` must trip it. Columns do not shift: a match is only possible
        // to the LEFT of `%`, and the left part of the line survives character for character.
        // An escaped `\%` is not a comment.
        const lines = text
          .split("\n")
          .map((l) => l.replace(/(^|[^\\])%.*$/, "$1"));
        const code = lines.join("\n");
        if (!ACMART_RE.test(code)) return;
        if (NONACM_RE.test(code)) return;
        lines.forEach((line, i) => {
          for (const { re, removes } of FRONTMATTER_OVERRIDES) {
            // 🔴 NO `re.lastIndex = 0` HERE, AND THAT IS A MEASUREMENT. These regexes are
            // module-level and `/g`, so they carry `lastIndex` across files, and the obvious
            // defensive line is to reset it. A mutation run on 2026-09-11 removed that line
            // and the harness stayed GREEN — because the loop below always drains the regex,
            // and a `/g` `exec` that returns `null` resets `lastIndex` to 0 by itself. The
            // reset was a guard no mutation could kill, i.e. the same dead assertion dressed
            // as robustness that the sibling rule's single-`try` comment describes. What
            // keeps the property honest instead is an ASSERTION, not a line of code: the
            // harness lints the same input twice in one process and requires the two runs to
            // agree. Add a `break` to this loop and that assertion is what will fail.
            let m;
            while ((m = re.exec(line)) !== null) {
              const column = m.index + 1;
              context.report({
                loc: {
                  start: { line: i + 1, column },
                  end: { line: i + 1, column: column + m[0].length },
                },
                messageId: "override",
                data: { text: m[0], removes },
              });
            }
          }
        });
      },
    };
  },
};

export default {
  "future-promise": futurePromise,
  "acm-frontmatter-override": acmFrontmatterOverride,
};
