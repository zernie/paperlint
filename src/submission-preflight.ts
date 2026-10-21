/**
 * THE PREFLIGHT of `paperlint submission new|update` — the verdict of the venue rules on the exact
 * PDF about to be sent, printed before the portal is asked, dry run or not.
 *
 * ── WHY IT EXISTS (paperlint#264) ─────────────────────────────────────────────────
 * A PDF over the venue's body-page limit was uploaded with `update --submit --save` while
 * `paperlint lint` had reported `format/page-limit` against it for days: the command never read the
 * facts or the preset's limit, and printed only "check it yourself". Everything needed to say no was
 * on disk.
 *
 * ── WHAT IT JUDGES, AND WITH WHAT ─────────────────────────────────────────────────
 * The build's facts (`_build/paper.facts.json`) and the venue preset's format, judged by the very
 * functions the lint rules report with (`sendFindings`, `src/venue-rules.ts`): the page limit of
 * the paper's kind, and every other error-level venue rule (profile, fonts, geometry, body size,
 * anonymity). There is no second page counter here.
 *
 * ── WHO DECIDES ───────────────────────────────────────────────────────────────────
 * Facts that do not describe the bytes being sent are a tooling state, not a choice: they are
 * reported, and `--save` refuses them (exit 2) — rebuild, then look again. Everything else is a
 * verdict for the author: printed in one block that the dry run prints too, so the block can be
 * put in front of the author verbatim before the real send. Sending over the limit is the author's
 * decision, taken on that block; the command does not take it for them in either direction.
 */
import { FACTS_DIR, FACTS_FILE } from "./facts-file.ts";
import { sha256Hex, type Sha256 } from "./domain/sha256.ts";
import type { PaperPreset } from "./presets.ts";
import {
  assessResolved,
  findingText,
  sendFindings,
  type BuiltAssessment,
  type Resolved,
  type SendFinding,
  type VenueRuleDeps,
} from "./venue-rules.ts";

/** The verdict on the PDF to be sent. */
export type Preflight =
  /** The facts are missing, unreadable, or about other bytes: refused by `--save`. */
  | { readonly kind: "stale"; readonly why: string }
  /** The paper declares the venue's limits not to apply yet (a cycle `porting`): nothing judged. */
  | { readonly kind: "unchecked"; readonly why: string }
  | {
      readonly kind: "checked";
      /** What the PDF was judged against: `<venue>` or `<venue>/<kind>`. */
      readonly against: string;
      /** Where the kind's page limits come from; null when the paper has no kind to limit. */
      readonly limit: string | null;
      readonly findings: readonly SendFinding[];
    };

const FACTS = `${FACTS_DIR}/${FACTS_FILE}`;
const REBUILD = "rebuild the paper (`paperlint build`)";

/** The kind's limits, and the preset files they were read from. Null without a kind. Pure. */
function limitLine(venue: Resolved, chain: readonly string[]): string | null {
  const kind = venue.kind;
  if (kind === null) return null;
  const limits = [
    kind.limits.bodyPagesMax === null
      ? null
      : `body_pages_max ${String(kind.limits.bodyPagesMax)}`,
    kind.limits.refPagesMax === null
      ? null
      : `ref_pages_max ${String(kind.limits.refPagesMax)}`,
  ].filter((l) => l !== null);
  return `${venue.venue}/${kind.name}: ${limits.length ? limits.join(", ") : "no page limit"} — "format": { "kinds": { "${kind.name}": … } } of the venue preset (read: ${chain.join(", ")})`;
}

/**
 * The preflight of `pdf` — the bytes about to be sent — for the paper in `paperDir`, whose preset
 * resolved to `p`. Reads the facts through `deps.files`.
 */
export function preflight(
  paperDir: string,
  p: Extract<PaperPreset, { readonly kind: "resolved" }>,
  pdf: Uint8Array,
  deps: VenueRuleDeps,
): Preflight {
  const a = assessResolved(paperDir, p, deps);
  switch (a.kind) {
    case "porting":
      return {
        kind: "unchecked",
        why: `the current cycle's phase is "porting": the PDF is still in the previous venue's template, so this venue's limits do not apply to it yet`,
      };
    case "unbuilt":
      return {
        kind: "stale",
        why: `no ${FACTS}: the PDF was never measured — ${REBUILD}`,
      };
    case "stale":
      return { kind: "stale", why: findingText("fresh", a.finding) };
    case "ready":
      return judged(a, p.preset.chain, sha256Hex(pdf));
  }
}

/** A build with fresh facts, judged — or stale, when the facts are about other bytes than `sent`. */
function judged(
  a: Extract<BuiltAssessment, { readonly kind: "ready" }>,
  chain: readonly string[],
  sent: Sha256,
): Preflight {
  if (a.facts.sha !== sent)
    return {
      kind: "stale",
      why: `${FACTS} describes the PDF with sha2-${a.facts.sha}, not the one being sent (sha2-${sent}) — ${REBUILD} from the source of the PDF you mean to send`,
    };
  const kind = a.venue.kind;
  return {
    kind: "checked",
    against: kind ? `${a.venue.venue}/${kind.name}` : a.venue.venue,
    limit: limitLine(a.venue, chain),
    findings: sendFindings(a),
  };
}

/** The headline of a judged build: OK, over the limit, or how many error-level checks fail. Pure. */
function headline(p: Extract<Preflight, { readonly kind: "checked" }>): string {
  const over = p.findings.flatMap((f) => (f.over === null ? [] : [f.over]));
  if (over.length > 0)
    return `PREFLIGHT: OVER LIMIT — ${over.map((o) => `${o.what}: ${String(o.got)} > ${String(o.max)}`).join("; ")}, for ${p.against}`;
  const n = p.findings.length;
  return n === 0
    ? `PREFLIGHT: OK — no error-level PDF check fails against ${p.against}`
    : `PREFLIGHT: FAILS — ${String(n)} error-level PDF check${n === 1 ? "" : "s"} against ${p.against}`;
}

/**
 * The preflight block: the verdict, each finding by rule, where the limit comes from, and the PDF
 * it is about. The same lines in a dry run and a send. Pure.
 */
export function preflightLines(
  p: Preflight,
  sent: { readonly shown: string; readonly sha256: Sha256 },
): readonly string[] {
  const pdf = `  sent        ${sent.shown} sha2-${sent.sha256}`;
  switch (p.kind) {
    case "stale":
      return [`PREFLIGHT: STALE FACTS — ${p.why}`, pdf];
    case "unchecked":
      return [`PREFLIGHT: NOT CHECKED — ${p.why}`, pdf];
    case "checked":
      return [
        headline(p),
        ...p.findings.map((f) => `  ${f.rule}: ${f.text}`),
        ...(p.findings.length > 0 && p.limit !== null
          ? [`  limit       ${p.limit}`]
          : []),
        pdf,
      ];
  }
}

/** What `--save` says when it refuses stale facts: nothing was sent. Pure. */
export const staleRefusal =
  "refused: the facts do not describe the PDF being sent, so it was not checked against the venue — nothing was sent. Rebuild, then run the dry run again and read its PREFLIGHT block";
