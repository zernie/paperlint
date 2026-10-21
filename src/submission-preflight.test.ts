/**
 * The preflight of `paperlint submission new|update` (paperlint#264): the error-level venue rules
 * on the exact PDF about to be sent, judged by the functions `paperlint lint` reports with.
 */
import { join } from "node:path";
import { expect, test } from "vitest";
import { sha256Hex } from "./domain/sha256.ts";
import { presetsDir } from "./package-dirs.ts";
import { paperPreset } from "./presets.ts";
import {
  preflight,
  preflightLines,
  type Preflight,
} from "./submission-preflight.ts";
import { findingText } from "./venue-rules.ts";
import {
  PAPER,
  PDF,
  HEX,
  files,
  facts,
  pagesText,
  withPresets,
} from "../test/submission-fixtures.ts";

const SENT = { shown: "papers/p/paper.pdf", sha256: HEX };
const PDF_LINE = `  sent        papers/p/paper.pdf sha2-${HEX}`;

/** The preflight of `pdf` for the made-up paper over `fs`. */
function check(fs: ReturnType<typeof files>, pdf: Uint8Array = PDF): Preflight {
  const deps = { files: withPresets(fs), venuesDir: presetsDir() };
  const p = paperPreset(PAPER, deps);
  if (p.kind !== "resolved") throw new Error(`fixture: ${p.kind}`);
  return preflight(PAPER, p, pdf, deps);
}

/** A paper of `kind` at a venue over AIDC (regular 12 body pages, short 6), not blind, `body` pages long. */
const atAidc = (kind: string, body: number, more: object = {}) =>
  files({
    venue: { extends: "paperlint:aidc", blind: false },
    paper: { extends: "../../venue.jsonc", kind, submission: { id: 7 } },
    facts: facts({ pages: pagesText(body), ...more }),
  });

/** The preset chain the AIDC-based venue reads, root first. */
const AIDC_CHAIN = [
  join(presetsDir(), "ieee-conference.jsonc"),
  join(presetsDir(), "aidc.jsonc"),
  "/w/venue.jsonc",
].join(", ");

test("over the body-page limit: OVER LIMIT names the pages, the limit, the rule's own message and where the limit is read", () => {
  expect(preflightLines(check(atAidc("short", 8)), SENT)).toStrictEqual([
    "PREFLIGHT: OVER LIMIT — body pages (up to the references on page 9): 8 > 6, for venue/short",
    "  format/page-limit: body pages (up to the references on page 9): 8, over the limit 6 for venue/short — a desk reject; cut the text",
    `  limit       venue/short: body_pages_max 6 — "format": { "kinds": { "short": … } } of the venue preset (read: ${AIDC_CHAIN})`,
    PDF_LINE,
  ]);
});

test("the same PDF within its kind's limit: OK", () => {
  expect(preflightLines(check(atAidc("regular", 8)), SENT)).toStrictEqual([
    "PREFLIGHT: OK — no error-level PDF check fails against venue/regular",
    PDF_LINE,
  ]);
});

test("every other error-level venue rule speaks too: a missing font family FAILS, with no limit line when the kind sets none", () => {
  const fs = files({
    venue: { format: { kinds: { poster: {} } } },
    paper: { extends: "../../venue.jsonc", kind: "poster" },
    facts: facts({ fonts: [] }),
  });
  expect(preflightLines(check(fs), SENT)).toStrictEqual([
    "PREFLIGHT: FAILS — 1 error-level PDF check against venue/poster",
    "  pdf/fonts: no font starts with `NimbusRomNo9L` (body text of venue); the PDF has: (no fonts). Usually a font package is missing and the class silently fell back to Computer Modern — run `paperlint toolchain`",
    `  limit       venue/poster: no page limit — "format": { "kinds": { "poster": … } } of the venue preset (read: ${join(presetsDir(), "ieee-conference.jsonc")}, /w/venue.jsonc)`,
    PDF_LINE,
  ]);
  // The family has no kinds: nothing to limit, and no limit line either.
  const noKinds = files({ facts: facts({ fonts: [] }) });
  expect(preflightLines(check(noKinds), SENT).slice(0, 1)).toStrictEqual([
    "PREFLIGHT: FAILS — 1 error-level PDF check against venue",
  ]);
  expect(preflightLines(check(noKinds), SENT)).toHaveLength(3);
});

test("a kind with both limits names both; two checks failing say so in the plural", () => {
  const fs = files({
    venue: {
      format: { kinds: { tiny: { body_pages_max: 1, ref_pages_max: 1 } } },
    },
    paper: { extends: "../../venue.jsonc", kind: "tiny" },
    facts: facts({ fonts: [] }),
  });
  const lines = preflightLines(check(fs), SENT);
  expect(lines.at(-2)).toMatch(
    /^ {2}limit {7}venue\/tiny: body_pages_max 1, ref_pages_max 1 — /u,
  );
  // The body is not counted (the IEEE family counts banal's pages, and no geometry was measured).
  expect(lines[0]).toBe(
    "PREFLIGHT: FAILS — 1 error-level PDF check against venue/tiny",
  );
  const two = files({
    venue: { extends: "paperlint:aidc", blind: false },
    paper: { extends: "../../venue.jsonc", kind: "nope" },
    facts: facts({ fonts: [] }),
  });
  expect(preflightLines(check(two), SENT)[0]).toBe(
    "PREFLIGHT: FAILS — 2 error-level PDF checks against venue",
  );
});

test("facts about other bytes than the ones sent: STALE FACTS, before anything is judged", () => {
  const other = new TextEncoder().encode("%PDF another build");
  const p = check(atAidc("short", 8), other);
  expect(p.kind).toBe("stale");
  expect(
    preflightLines(p, { shown: "other.pdf", sha256: sha256Hex(other) }),
  ).toStrictEqual([
    `PREFLIGHT: STALE FACTS — _build/paper.facts.json describes the PDF with sha2-${HEX}, not the one being sent (sha2-${sha256Hex(other)}) — rebuild the paper (\`paperlint build\`) from the source of the PDF you mean to send`,
    `  sent        other.pdf sha2-${sha256Hex(other)}`,
  ]);
});

test("facts about an earlier build of paper.pdf, or none at all: STALE FACTS", () => {
  const earlier = files({ facts: facts({ sha: "a".repeat(64) }) });
  expect(preflightLines(check(earlier), SENT)).toStrictEqual([
    "PREFLIGHT: STALE FACTS — _build/paper.facts.json describes a DIFFERENT paper.pdf than the one on disk (its SHA-256 differs), so the venue checks would judge an earlier build — rebuild the paper",
    PDF_LINE,
  ]);
  expect(preflightLines(check(files({ facts: null })), SENT)).toStrictEqual([
    "PREFLIGHT: STALE FACTS — no _build/paper.facts.json: the PDF was never measured — rebuild the paper (`paperlint build`)",
    PDF_LINE,
  ]);
});

test("a cycle still porting to the venue's template: NOT CHECKED, as lint is silent there", () => {
  const fs = files({
    paper: {
      cycles: [
        {
          id: "venue-2027",
          venue: { kind: "preset", extends: "../../venue.jsonc" },
          opened: "2026-09-09",
          phase: "porting",
          submission: { id: 7 },
        },
      ],
    },
  });
  expect(preflightLines(check(fs), SENT)).toStrictEqual([
    "PREFLIGHT: NOT CHECKED — the current cycle's phase is \"porting\": the PDF is still in the previous venue's template, so this venue's limits do not apply to it yet",
    PDF_LINE,
  ]);
});

test("findingText fills a message as ESLint does: a placeholder its data lacks stays, an unknown id is itself", () => {
  expect(
    findingText("page-limit", {
      messageId: "pages",
      data: { what: "body pages", got: 3, max: 2, venue: "v" },
    }),
  ).toBe(
    "body pages: 3, over the limit 2 for v/{{kind}} — a desk reject; cut the text",
  );
  expect(findingText("fonts", { messageId: "nope", data: {} })).toBe("nope");
});
