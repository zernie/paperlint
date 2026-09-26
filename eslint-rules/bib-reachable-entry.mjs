/**
 * `bib/reachable-entry` — a bibliography entry a reader cannot follow: no doi, no url, no arXiv
 * id. Reported ON THE ENTRY, one finding per entry; there is no fix, because the link has to be
 * looked up. Default severity: warn.
 *
 * Provenance: Reviewer A on HotCRP #20 (2026-08-23), "not every entry has a DOI/link" — one
 * paper had 0 of 47 entries reachable. Until 3.0.0 this was one count inside `paper/typography`,
 * silenced per paper by a declared debt; now each entry is its own finding, and an entry that
 * genuinely has no link (a talk, a personal communication) carries a disable directive with its
 * reason, in the bibliography itself:
 *
 *   % eslint-disable-next-line bib/reachable-entry -- an invited talk, no recording exists
 *   @misc{smith2024talk, …}
 *
 * ⚠️ NOT "no doi". Measured 2026-08-24: ICLR/NeurIPS/TMLR issue no DOIs at all, so a doi-only
 * rule would demand something that does not exist and get muted for lying. A url or an arXiv id
 * counts.
 *
 * The bibliography read is the one INSIDE `paper.tex` (`filecontents`), where the papers this
 * package targets keep it. The entry boundaries and fields are found by a line-anchored `@` and
 * a field name followed by `=` — BibTeX's own lexical shape, one lexeme at a time, not a parse:
 * the parser (`@retorquere/bibtex-parser`) is an OPTIONAL peer of this package.
 */
import { bibRange } from "./paper-typography.mjs";

/** Entry types that are not references. */
const NOT_AN_ENTRY = /^@(comment|string|preamble)\b/i;
const HAS_LINK = /\b(doi|url)\s*=/i;
const HAS_ARXIV = /arxiv[:\s]*\d{4}\.\d{4,5}/i;

export default {
  rules: {
    "reachable-entry": {
      meta: {
        type: "suggestion",
        docs: {
          description:
            "a bibliography entry carries a doi, a url or an arXiv id — something a reader can follow",
        },
        schema: [],
        messages: {
          unreachable:
            "`{{key}}` has no doi, url or arXiv id — a reader has nothing to follow. If none exists, keep the exception with `% eslint-disable-next-line bib/reachable-entry -- <why>` above the entry",
        },
      },
      create(context) {
        return {
          "root:exit"() {
            const sc = context.sourceCode;
            const raw = sc.raw ?? sc.text;
            const bib = typeof raw === "string" ? bibRange(raw) : null;
            if (!bib) return;
            const starts = [...bib.body.matchAll(/^@/gm)].map((m) => m.index);
            starts.forEach((s, i) => {
              const entry = bib.body.slice(s, starts[i + 1] ?? bib.body.length);
              if (NOT_AN_ENTRY.test(entry)) return;
              if (HAS_LINK.test(entry) || HAS_ARXIV.test(entry)) return;
              const head = entry.split("\n")[0];
              const key = /\{\s*([^,\s]+)/.exec(head)?.[1] ?? "?";
              const from = bib.bodyStart + s;
              context.report({
                loc: {
                  start: sc.getLocFromIndex(from),
                  end: sc.getLocFromIndex(from + head.length),
                },
                messageId: "unreachable",
                data: { key },
              });
            });
          },
        };
      },
    },
  },
};
