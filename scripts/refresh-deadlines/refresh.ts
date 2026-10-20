/**
 * THE SHIPPED PRESETS' DEADLINES, RE-READ FROM THEIR PORTALS — the refresh's logic, behind the
 * VenueDeadlines port and the preset files it is handed (`main.ts` plugs in the real ones). For
 * every preset whose `portal` paperlint has an adapter for, the portal's deadlines are compared
 * with the preset's `deadlines` (`compare.ts`), and a preset that changed is rewritten — the
 * `deadlines` value only, by jsonc-parser, then Prettier as `npm run fmt` would.
 *
 * IT REPORTS, IT DOES NOT BLOCK. A portal that is down, gone or not the page expected is a
 * `::warning::` line and a line in the summary, and the run exits 0 — the venue's outage is not this
 * repository's defect, and the next day's run reads it again. A preset that does not parse IS:
 * `::error::`, exit 1.
 */
import { applyEdits, modify } from "jsonc-parser";
import { format } from "prettier";
import type { IsoDate, Reading } from "#src/domain/deadline";
import { supportedPortal } from "#src/domain/submission";
import { messageOf } from "#src/domain/text";
import type { VenueDeadlines } from "#src/ports/venue-deadlines";
import { failureText } from "#src/submission";
import { parsePreset } from "#src/tex-requirements";
import { refreshReadings } from "./compare.ts";

/** What happened to one preset. */
export type Outcome =
  | { readonly kind: "skipped" }
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

/** The presets of one directory, by file name. */
export interface PresetFiles {
  /** The `*.jsonc` presets' names, sorted. */
  readonly names: readonly string[];
  readonly read: (name: string) => string;
  readonly write: (name: string, text: string) => void;
  /** Where a preset lives, as a message names it and Prettier infers its format from. */
  readonly path: (name: string) => string;
}

/** The preset's text with its `deadlines` value set to `readings` (inserted after `portal` when absent). */
export async function withDeadlines(
  text: string,
  file: string,
  readings: readonly Reading[],
): Promise<string> {
  const edits = modify(text, ["deadlines"], readings, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
    getInsertionIndex: (keys) => keys.indexOf("portal") + 1,
  });
  // Prettier, for what jsonc-parser does not print: the trailing commas `npm run fmt:check` requires.
  return format(applyEdits(text, edits), { filepath: file });
}

/** One preset: its portal read, its readings compared, its new text when one changed. */
export async function refreshPreset(o: {
  readonly file: string;
  readonly text: string;
  readonly portal: (site: string) => VenueDeadlines;
  readonly today: IsoDate;
}): Promise<Outcome> {
  const parsed = ((): ReturnType<typeof parsePreset> | string => {
    try {
      return parsePreset(o.text, o.file);
    } catch (e) {
      return messageOf(e);
    }
  })();
  if (typeof parsed === "string") return { kind: "broken", why: parsed };
  const portal = parsed.portal === null ? null : supportedPortal(parsed.portal);
  if (portal === null || !portal.ok) return { kind: "skipped" };
  const url = `${portal.value.url}/deadlines`;
  const page = await o.portal(portal.value.url).read();
  if (!page.ok)
    return { kind: "unreadable", url, why: failureText(page.error) };
  const r = refreshReadings(parsed.deadlines ?? [], page.value, url, o.today);
  if (r.changes.length === 0) return { kind: "unchanged", url, notes: r.notes };
  const text = await withDeadlines(o.text, o.file, r.readings);
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
    case "changed": {
      const lines = [...o.changes, ...o.notes];
      return {
        log: lines.map((c) => `${name}: ${c}`),
        md: [`- \`${name}\` (${o.url})`, ...lines.map((c) => `  - ${c}`)],
      };
    }
  }
}

/** The pull request's body. */
const summaryOf = (today: IsoDate, lines: readonly string[]): string =>
  [
    `The venue presets' deadlines, re-read on ${today} from each preset's portal by \`.github/workflows/deadlines.yml\` (\`scripts/refresh-deadlines/\`). A reading whose value changed carries today's \`read\` day; the others keep theirs.`,
    "",
    ...lines,
    "",
    "Merging releases a patch; papers get the new dates through their normal update of paperlint.",
    "",
  ].join("\n");

/** What a refresh run needs: the presets, how to read a portal, the day, where to print. */
export interface RefreshDeps {
  readonly presets: PresetFiles;
  readonly portal: (site: string) => VenueDeadlines;
  readonly today: IsoDate;
  readonly log: (line: string) => void;
  /** Where the pull request's body goes; null: nowhere. */
  readonly summary: ((text: string) => void) | null;
}

/** Every preset, refreshed — a changed one written back. */
const outcomesOf = (
  d: RefreshDeps,
): Promise<readonly { readonly name: string; readonly out: Outcome }[]> =>
  Promise.all(
    d.presets.names.map(async (name) => {
      const out = await refreshPreset({
        file: d.presets.path(name),
        text: d.presets.read(name),
        portal: d.portal,
        today: d.today,
      });
      if (out.kind === "changed") d.presets.write(name, out.text);
      return { name, out };
    }),
  );

/** Every preset refreshed, reported to the log and the summary. 0 unless a preset does not parse. */
export async function runRefresh(d: RefreshDeps): Promise<number> {
  const outcomes = await outcomesOf(d);
  const reports = outcomes.map(({ name, out }) => report(name, out));
  const count = (k: Outcome["kind"]) =>
    outcomes.filter((x) => x.out.kind === k).length;
  [
    ...reports.flatMap((r) => r.log),
    count("changed") === 0
      ? `✓ no deadline changed: ${String(count("unchanged"))} preset(s) with a portal read, ${String(count("skipped"))} skipped`
      : `${String(count("changed"))} preset(s) changed`,
  ].forEach((l) => {
    d.log(l);
  });
  d.summary?.(
    summaryOf(
      d.today,
      reports.flatMap((r) => r.md),
    ),
  );
  return count("broken") > 0 ? 1 : 0;
}
