#!/usr/bin/env node
/**
 * `npm run refresh-deadlines [-- --presets <dir>] [-- --summary <file.md>]` — the scheduled refresh of
 * the shipped presets' deadlines (`.github/workflows/deadlines.yml`). Maintainer tooling, not the
 * package: for every preset whose `portal` paperlint has an adapter for, it reads the portal's public
 * deadlines page, compares it with the preset's `deadlines` (`compare.ts`) and rewrites a preset
 * that changed — the `deadlines` value only, by jsonc-parser, then Prettier as `npm run fmt` would.
 *
 * IT REPORTS, IT DOES NOT BLOCK. A portal that is down, gone or no longer a HotCRP page is a
 * `::warning::` line and a line in the summary, and the run exits 0 — the venue's outage is not this
 * repository's defect, and the next day's run reads it again. A preset that does not parse IS:
 * `::error::`, exit 1.
 *
 * The npm script runs it with `--conditions=paperlint-source`, so it needs no `dist/`: the job
 * installs with `--ignore-scripts` and builds nothing. `main.test.ts` runs that npm script under
 * `test/no-dist.ts`.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyEdits, modify } from "jsonc-parser";
import { format } from "prettier";
import { isMain } from "../../skills/paper-pipeline/scripts/consumer.mjs";
import { hotcrpDeadlines } from "../../src/adapters/hotcrp/index.ts";
import type { IsoDate, Reading } from "../../src/domain/deadline.ts";
import {
  supportedPortal,
  type PortalFailure,
} from "../../src/domain/submission.ts";
import { messageOf } from "../../src/domain/text.ts";
import type { VenueDeadlines } from "../../src/ports/venue-deadlines.ts";
import { parsePreset } from "../../src/tex-requirements.ts";
import { refreshReadings } from "./compare.ts";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

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

/** What a refresh run needs: where the presets are, how to read a portal, the day, where to print. */
export interface RefreshDeps {
  readonly dir: string;
  readonly portal: (site: string) => VenueDeadlines;
  readonly today: IsoDate;
  readonly log: (line: string) => void;
  /** Where the pull request's body goes; null: nowhere. */
  readonly summary: string | null;
}

/** Every `*.jsonc` preset in `dir`, refreshed — a changed one written back. */
const outcomesIn = (
  d: RefreshDeps,
): Promise<readonly { readonly name: string; readonly out: Outcome }[]> =>
  Promise.all(
    readdirSync(d.dir)
      .filter((f) => f.endsWith(".jsonc"))
      .toSorted()
      .map(async (name) => {
        const file = join(d.dir, name);
        const out = await refreshPreset({
          file,
          text: readFileSync(file, "utf8"),
          portal: d.portal,
          today: d.today,
        });
        if (out.kind === "changed") writeFileSync(file, out.text);
        return { name, out };
      }),
  );

/** Every preset refreshed, reported to the log and the summary. 0 unless a preset does not parse. */
export async function runRefresh(d: RefreshDeps): Promise<number> {
  const outcomes = await outcomesIn(d);
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
  if (d.summary !== null)
    writeFileSync(
      d.summary,
      summaryOf(
        d.today,
        reports.flatMap((r) => r.md),
      ),
    );
  return count("broken") > 0 ? 1 : 0;
}

/** `--presets <dir>` and `--summary <file>` from the command line. */
export function argsOf(argv: readonly string[]): {
  readonly presets: string;
  readonly summary: string | null;
} {
  const value = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : (argv[i + 1] ?? null);
  };
  return {
    presets: value("--presets") ?? join(ROOT, "presets"),
    summary: value("--summary"),
  };
}

// `isMain`, not a comparison with `file://${argv[1]}`: that is false through a symlink (consumer.mjs).
if (isMain(import.meta.url)) {
  const args = argsOf(process.argv.slice(2));
  process.exit(
    await runRefresh({
      dir: args.presets,
      portal: (site) => hotcrpDeadlines({ url: site }),
      // The clock is read here, at the edge: the day a reading was taken.
      today: new Date().toISOString().slice(0, 10),
      log: console.log,
      summary: args.summary,
    }),
  );
}
