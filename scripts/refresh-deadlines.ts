#!/usr/bin/env node
/**
 * THE SHIPPED PRESETS' DEADLINES, RE-READ FROM THEIR PORTALS — run once a day by
 * `.github/workflows/deadlines.yml`, which opens or updates one pull request when a value changed.
 *
 *   node scripts/refresh-deadlines.ts [--presets <dir>] [--summary <file.md>]
 *
 * For every preset in the directory whose `portal` has an adapter (HotCRP today), the portal's public
 * deadlines page is read and compared with the preset's `deadlines`:
 *
 *   a kind the page lists at the instant the preset holds   kept as it is, its `read` day too
 *   a kind the page lists at another instant                rewritten, `read` = today
 *   a kind the page lists that the preset does not hold     added, `read` = today
 *   a kind the preset holds that the page no longer lists   KEPT and noted — a portal may drop a
 *                                                           passed deadline; the reading stays true
 *   a reading from the call                                 never touched: it is not the portal's
 *
 * Only a changed value rewrites the file, so an unchanged portal produces no diff and no pull
 * request: a `read` day says when the value was last READ DIFFERENT, not when the job last ran.
 *
 * ── IT REPORTS, IT DOES NOT BLOCK ─────────────────────────────────────────────────────────────
 * A portal that is down, gone or no longer a HotCRP page is a `::warning::` line and a line in the
 * summary, and the run exits 0 — the venue's outage is not this repository's defect, and the next
 * day's run reads it again. A preset that does not parse IS this repository's defect: `::error::`,
 * exit 1. The main CI never runs this script against the network; its tests replay the pages
 * recorded in `src/adapters/hotcrp/cassette/`.
 *
 * The block is found on the JSONC's syntax tree (TypeScript's JSON parser, the one the presets are
 * read with) and replaced; everything else in the file — its comments above all — is left as it
 * is, and Prettier formats the result as `npm run fmt` would.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import ts from "typescript";
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";
import { hotcrpDeadlines } from "../src/adapters/hotcrp/index.ts";
import {
  DEADLINE_WHATS,
  type DeadlineWhat,
  type IsoDate,
  type PortalDeadlines,
  type Reading,
} from "../src/domain/deadline.ts";
import type { Result } from "../src/domain/result.ts";
import {
  supportedPortal,
  type PortalFailure,
} from "../src/domain/submission.ts";
import { messageOf } from "../src/domain/text.ts";
import { presetsDir } from "../src/package-dirs.ts";
import { parsePreset } from "../src/tex-requirements.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Reads the deadlines page of the portal site at `site` (no trailing slash). */
export type ReadPortal = (
  site: string,
) => Promise<Result<PortalDeadlines, PortalFailure>>;

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

/** The preset's readings after the page's answer, what changed, and what is worth a note. */
export interface Refreshed {
  readonly readings: readonly Reading[];
  readonly changes: readonly string[];
  readonly notes: readonly string[];
}

/** The page's instants for one kind, earliest first. */
const pageAts = (page: PortalDeadlines, what: DeadlineWhat): string[] =>
  page.deadlines
    .filter((d) => d.what === what)
    .map((d) => d.at)
    .toSorted();

/** A kind the page does not list: the preset's reading, if it holds one, is kept and noted. */
const offThePage = (
  what: DeadlineWhat,
  held: Reading | undefined,
): Refreshed =>
  held === undefined
    ? { readings: [], changes: [], notes: [] }
    : {
        readings: [held],
        changes: [],
        notes: [`${what}: no longer on the page — kept as read ${held.read}`],
      };

/** One kind: the preset's portal reading against the page's. */
function oneKind(
  what: DeadlineWhat,
  held: Reading | undefined,
  ats: readonly string[],
  o: { readonly url: string; readonly today: IsoDate },
): Refreshed {
  const notes =
    ats.length > 1
      ? [`${what}: the page lists ${ats.join(", ")} — the earliest is recorded`]
      : [];
  const at = ats[0];
  if (at === undefined) return offThePage(what, held);
  if (held?.at === at) return { readings: [held], changes: [], notes };
  const fresh: Reading = {
    what,
    at,
    source: "portal",
    url: o.url,
    read: o.today,
  };
  const change =
    held === undefined ? `${what}: added ${at}` : `${what}: ${held.at} → ${at}`;
  return { readings: [fresh], changes: [change], notes };
}

/**
 * The preset's readings after the portal answered `page` at `url` on `today`. The call's readings
 * are kept as they are; the portal's are kept, rewritten or added kind by kind. Pure.
 */
export function refreshReadings(
  current: readonly Reading[],
  page: PortalDeadlines,
  url: string,
  today: IsoDate,
): Refreshed {
  const perKind = DEADLINE_WHATS.map((what) => {
    const portal = oneKind(
      what,
      current.find((r) => r.what === what && r.source === "portal"),
      pageAts(page, what),
      { url, today },
    );
    const call = current.filter((r) => r.what === what && r.source === "call");
    return { ...portal, readings: [...portal.readings, ...call] };
  });
  return {
    readings: perKind.flatMap((k) => k.readings),
    changes: perKind.flatMap((k) => k.changes),
    notes: perKind.flatMap((k) => k.notes),
  };
}

/** The top-level property `name` of a JSONC object, on its syntax tree; undefined when absent. */
function property(
  file: ts.JsonSourceFile,
  name: string,
): ts.PropertyAssignment | undefined {
  const top = file.statements[0]?.expression;
  if (top === undefined || !ts.isObjectLiteralExpression(top)) return undefined;
  return top.properties
    .filter(ts.isPropertyAssignment)
    .find((p) => ts.isStringLiteral(p.name) && p.name.text === name);
}

/**
 * The preset's text with `deadlines` set to `readings`: the value replaced where the key is, or the
 * key inserted after `portal`. Formatted as the repository formats a preset.
 */
export async function withDeadlines(
  text: string,
  file: string,
  readings: readonly Reading[],
): Promise<string> {
  const tree = ts.parseJsonText(file, text);
  const json = JSON.stringify(readings, null, 2);
  const held = property(tree, "deadlines");
  const spliced =
    held === undefined
      ? insertAfterPortal(tree, text, json)
      : text.slice(0, held.initializer.getStart(tree)) +
        json +
        text.slice(held.initializer.end);
  return format(spliced, { filepath: file });
}

/** `"deadlines": …` after the `portal` property — only a preset with a portal is ever refreshed. */
function insertAfterPortal(
  tree: ts.JsonSourceFile,
  text: string,
  json: string,
): string {
  const portal = property(tree, "portal");
  if (portal === undefined)
    throw new Error(`${tree.fileName}: no "portal" to put "deadlines" after`);
  return `${text.slice(0, portal.end)},\n\n  "deadlines": ${json}${text.slice(portal.end)}`;
}

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
  readonly read: ReadPortal;
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
  const page = await o.read(portal.value.url);
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

export interface MainOptions {
  readonly presetsDir: string;
  readonly read: ReadPortal;
  readonly today: IsoDate;
  readonly log: (line: string) => void;
  readonly write: (file: string, text: string) => void;
  /** Where the pull request's body goes; null: nowhere. */
  readonly summary: string | null;
}

/** Every preset of the directory, refreshed — a changed one written back. */
async function outcomesOf(
  o: MainOptions,
): Promise<readonly { readonly name: string; readonly out: Outcome }[]> {
  const names = readdirSync(o.presetsDir)
    .filter((f) => f.endsWith(".jsonc"))
    .toSorted();
  return Promise.all(
    names.map(async (name) => {
      const file = join(o.presetsDir, name);
      const text = readFileSync(file, "utf8");
      const out = await refreshPreset({
        file,
        text,
        read: o.read,
        today: o.today,
      });
      if (out.kind === "changed") o.write(file, out.text);
      return { name, out };
    }),
  );
}

/** Every preset of the directory, refreshed. 0 unless a preset does not parse. */
export async function main(o: MainOptions): Promise<number> {
  const outcomes = await outcomesOf(o);
  const reports = outcomes.map(({ name, out }) => report(name, out));
  reports
    .flatMap((r) => r.log)
    .forEach((l) => {
      o.log(l);
    });
  const count = (k: Outcome["kind"]) =>
    outcomes.filter((x) => x.out.kind === k).length;
  const read = count("changed") + count("unchanged");
  o.log(
    count("changed") === 0
      ? `✓ no deadline changed: ${String(read)} preset(s) with a portal read, ${String(count("skipped"))} skipped`
      : `${String(count("changed"))} preset(s) changed`,
  );
  if (o.summary !== null)
    o.write(
      o.summary,
      summaryOf(
        o.today,
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
    await main({
      presetsDir: args.presets,
      read: (site) => hotcrpDeadlines({ url: site }).read(),
      // The clock is read here, at the edge: the day a reading was taken.
      today: new Date().toISOString().slice(0, 10),
      log: console.log,
      write: (file, text) => {
        writeFileSync(file, text);
      },
      summary: args.summary,
    }),
  );
}
