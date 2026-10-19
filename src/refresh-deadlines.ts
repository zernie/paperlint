/**
 * THE SHIPPED PRESETS' DEADLINES, RE-READ FROM THEIR PORTALS — the use case behind the scheduled
 * refresh (`.github/workflows/deadlines.yml`, through `npm run refresh-deadlines`). For every preset
 * whose `portal` has an adapter, the portal's public deadlines page is read and compared with the
 * preset's `deadlines` (`src/domain/deadline-refresh.ts`); a changed preset is rewritten.
 *
 * ── IT REPORTS, IT DOES NOT BLOCK ─────────────────────────────────────────────────────────────
 * A portal that is down, gone or no longer a HotCRP page is a `::warning::` line and a line in the
 * summary, and the run exits 0 — the venue's outage is not this repository's defect, and the next
 * day's run reads it again. A preset that does not parse IS this repository's defect: `::error::`,
 * exit 1.
 */
import type { IsoDate } from "./domain/deadline.ts";
import { refreshReadings } from "./domain/deadline-refresh.ts";
import { supportedPortal, type PortalFailure } from "./domain/submission.ts";
import { messageOf } from "./domain/text.ts";
import { presetsDir } from "./package-dirs.ts";
import type { PresetFiles, PresetRewriter } from "./ports/preset-files.ts";
import type { VenueDeadlines } from "./ports/venue-deadlines.ts";
import { parsePreset } from "./tex-requirements.ts";

/** What happened to one preset. */
export type Outcome =
  | { readonly kind: "skipped"; readonly why: string }
  | { readonly kind: "broken"; readonly why: string }
  | { readonly kind: "unreadable"; readonly url: string; readonly why: string }
  | {
      readonly kind: "unchanged";
      readonly url: string;
      readonly notes: readonly string[];
    }
  | {
      readonly kind: "changed";
      readonly url: string;
      readonly text: string;
      readonly changes: readonly string[];
      readonly notes: readonly string[];
    };

/** A failure to read the page, in one line. */
function failureText(f: PortalFailure): string {
  switch (f.kind) {
    case "unreachable":
      return `unreachable: ${f.detail}`;
    case "refused":
      return `HTTP ${String(f.httpStatus)}: ${f.messages.map((m) => m.message).join("; ")}`;
    case "malformed":
      return `not the page expected (HTTP ${String(f.httpStatus)}): ${f.detail}`;
  }
}

/** One preset: its portal read, its readings compared, its new text when one changed. */
export async function refreshPreset(o: {
  readonly file: string;
  readonly text: string;
  readonly portal: (site: string) => VenueDeadlines;
  readonly rewriter: PresetRewriter;
  readonly today: IsoDate;
}): Promise<Outcome> {
  const parsed = ((): ReturnType<typeof parsePreset> | string => {
    try {
      return parsePreset(o.text, o.file, presetsDir());
    } catch (e) {
      return messageOf(e);
    }
  })();
  if (typeof parsed === "string") return { kind: "broken", why: parsed };
  if (parsed.portal === null) return { kind: "skipped", why: "no portal" };
  const portal = supportedPortal(parsed.portal);
  if (!portal.ok) return { kind: "skipped", why: portal.error };
  const url = `${portal.value.url}/deadlines`;
  const page = await o.portal(portal.value.url).read();
  if (!page.ok)
    return { kind: "unreadable", url, why: failureText(page.error) };
  const r = refreshReadings(parsed.deadlines ?? [], page.value, url, o.today);
  if (r.changes.length === 0) return { kind: "unchanged", url, notes: r.notes };
  const text = await o.rewriter.withDeadlines(o.text, o.file, r.readings);
  return { kind: "changed", url, text, changes: r.changes, notes: r.notes };
}

/** The lines one preset's outcome contributes: to the log (annotations included) and to the summary. */
function report(
  name: string,
  o: Outcome,
): { readonly log: readonly string[]; readonly md: readonly string[] } {
  switch (o.kind) {
    case "skipped":
      return { log: [], md: [] };
    case "broken":
      return {
        log: [`::error title=deadlines::${name} does not parse: ${o.why}`],
        md: [`- 🔴 \`${name}\` does not parse: ${o.why}`],
      };
    case "unreadable":
      return {
        log: [
          `::warning title=deadlines::${name}: could not read ${o.url} — ${o.why}`,
        ],
        md: [`- ⚠️ \`${name}\`: could not read ${o.url} — ${o.why}`],
      };
    case "unchanged":
      return { log: o.notes.map((n) => `${name}: ${n}`), md: [] };
    case "changed":
      return changedReport(name, o);
  }
}

/** A changed preset: each change and note, in the log and as a list in the summary. */
const changedReport = (
  name: string,
  o: Extract<Outcome, { kind: "changed" }>,
): { readonly log: readonly string[]; readonly md: readonly string[] } => {
  const lines = [...o.changes, ...o.notes];
  return {
    log: lines.map((c) => `${name}: ${c}`),
    md: [`- \`${name}\` (${o.url})`, ...lines.map((c) => `  - ${c}`)],
  };
};

/** What a refresh run needs: the presets, how to read a portal and rewrite a preset, the day. */
export interface RefreshDeps {
  readonly presets: PresetFiles;
  readonly portal: (site: string) => VenueDeadlines;
  readonly rewriter: PresetRewriter;
  readonly today: IsoDate;
  readonly log: (line: string) => void;
  /** Where the pull request's body goes; null: nowhere. */
  readonly summary: ((text: string) => void) | null;
}

/** Every preset, refreshed — a changed one written back. */
async function outcomesOf(
  d: RefreshDeps,
): Promise<readonly { readonly name: string; readonly out: Outcome }[]> {
  return Promise.all(
    d.presets.list().map(async (name) => {
      const out = await refreshPreset({
        file: d.presets.path(name),
        text: d.presets.read(name),
        portal: d.portal,
        rewriter: d.rewriter,
        today: d.today,
      });
      if (out.kind === "changed") d.presets.write(name, out.text);
      return { name, out };
    }),
  );
}

/** Every preset, refreshed. 0 unless a preset does not parse. */
export async function runRefresh(d: RefreshDeps): Promise<number> {
  const outcomes = await outcomesOf(d);
  const reports = outcomes.map(({ name, out }) => report(name, out));
  reports
    .flatMap((r) => r.log)
    .forEach((l) => {
      d.log(l);
    });
  const count = (k: Outcome["kind"]) =>
    outcomes.filter((x) => x.out.kind === k).length;
  const read = count("changed") + count("unchanged");
  d.log(
    count("changed") === 0
      ? `✓ no deadline changed: ${String(read)} preset(s) with a portal read, ${String(count("skipped"))} skipped`
      : `${String(count("changed"))} preset(s) changed`,
  );
  d.summary?.(
    summaryOf(
      d.today,
      reports.flatMap((r) => r.md),
    ),
  );
  return count("broken") > 0 ? 1 : 0;
}

/** The pull request's body. */
const summaryOf = (today: IsoDate, lines: readonly string[]): string =>
  [
    `The venue presets' deadlines, re-read on ${today} from each preset's portal by \`.github/workflows/deadlines.yml\` (\`scripts/refresh-deadlines.ts\`). A reading whose value changed carries today's \`read\` day; the others keep theirs.`,
    "",
    ...lines,
    "",
    "Merging releases a patch; papers get the new dates through their normal update of paperlint.",
    "",
  ].join("\n");
