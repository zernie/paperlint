#!/usr/bin/env node
/**
 * A VENUE'S ACCEPTED PAPERS, MEASURED INTO ITS PRESET — the `shape` block `pdf/venue-shape` compares
 * a built paper with (docs/rules/pdf/venue-shape.md, docs/design/venue-shape.md).
 *
 *   node scripts/measure-venue-shape.ts <preset.jsonc> --corpus <corpus.json> [--cache <dir>]
 *   node scripts/measure-venue-shape.ts <preset.jsonc> [--cache <dir>]
 *
 * The corpus file names the papers: `{ "source": "…", "url": "<the accepted list>", "papers":
 * [{ "paper": "<title>", "url": "<an open PDF>" }] }`. Without `--corpus`, the papers the preset's
 * `shape` already lists are measured again — what a change to the counter owes the shipped presets.
 *
 * Each PDF is downloaded once into the cache directory (default: a folder under the system's temp
 * directory, kept between runs), read with pdf.js — the reader `paperlint build` writes the facts
 * with — and measured by `shapeOf` (src/domain/venue-shape.ts), the counter the rule applies to the
 * paper. So the venue's numbers and the paper's come from one counter, never from a figure measured
 * some other way. The quartiles are not stored: the rule derives them from the rows each run.
 *
 * ── IT SAYS WHAT IT COULD NOT DO ───────────────────────────────────────────────────────────────
 * A PDF that cannot be fetched or read is left out and named, and the summary says how many of the
 * corpus were measured — a silently shorter corpus gives quietly wrong quartiles. A PDF whose first
 * pages do not carry the title's first words is kept, and named for a look by hand: an arXiv title
 * can differ from the proceedings', and a wrong URL measures some other paper. Exit 1 when the
 * corpus file is not a corpus or nothing was measured; the preset is then not touched.
 *
 * The block is replaced on the JSONC's syntax tree (as `refresh-deadlines.ts` does), so the
 * preset's comments survive, and Prettier formats the result as `npm run fmt` would.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { format } from "prettier";
import ts from "typescript";
import { z } from "zod";
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";
import {
  distributionOf,
  shapeOf,
  SHAPE_MEASURES,
  type Shape,
} from "../src/domain/venue-shape.ts";
import { messageOf } from "../src/domain/text.ts";
import { readPdf } from "../src/pdf-facts.ts";
import { parsePreset } from "../src/tex-requirements.ts";
import { property } from "./refresh-deadlines.ts";

const Corpus = z.strictObject({
  source: z.string().min(1),
  url: z.url(),
  papers: z
    .array(z.strictObject({ paper: z.string().min(1), url: z.url() }))
    .min(1),
});
export type Corpus = z.infer<typeof Corpus>;

/** What reading one paper's PDF gave: its page texts, or why there are none. */
export type PaperRead =
  | { readonly ok: true; readonly pageTexts: readonly string[] }
  | { readonly ok: false; readonly why: string };
export type ReadPaper = (url: string) => Promise<PaperRead>;

/** One measured paper, as the preset's `shape.papers` holds it. */
export type Row = {
  readonly paper: string;
  readonly url: string;
  readonly pages: number;
} & Shape;

export interface Measured {
  readonly rows: readonly Row[];
  /** Papers left out, each with why. */
  readonly failed: readonly string[];
  /** Papers kept whose first pages do not carry the title. */
  readonly unsure: readonly string[];
}

const words = (t: string): readonly string[] =>
  t
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Whether the first two pages carry the title's first six words, in order. */
export function titleFound(
  title: string,
  pageTexts: readonly string[],
): boolean {
  const want = words(title).slice(0, 6).join(" ");
  return words(pageTexts.slice(0, 2).join(" ")).join(" ").includes(want);
}

/** Every paper of the corpus read and measured, in the corpus's order. */
export async function measureCorpus(
  corpus: Corpus,
  read: ReadPaper,
): Promise<Measured> {
  const reads = await Promise.all(
    corpus.papers.map(async (p) => ({ p, r: await read(p.url) })),
  );
  return {
    rows: reads.flatMap(({ p, r }) =>
      r.ok
        ? [
            {
              paper: p.paper,
              url: p.url,
              pages: r.pageTexts.length,
              ...shapeOf(r.pageTexts),
            },
          ]
        : [],
    ),
    failed: reads.flatMap(({ p, r }) =>
      r.ok ? [] : [`${p.paper} (${p.url}): ${r.why}`],
    ),
    unsure: reads.flatMap(({ p, r }) =>
      r.ok && !titleFound(p.paper, r.pageTexts)
        ? [`${p.paper} (${p.url})`]
        : [],
    ),
  };
}

/**
 * The preset's text with `shape` set to `value`: replaced where the key is, else added as the last
 * property. Formatted as the repository formats a preset.
 */
export async function withShape(
  text: string,
  file: string,
  value: unknown,
): Promise<string> {
  const tree = ts.parseJsonText(file, text);
  const json = JSON.stringify(value, null, 2);
  const held = property(tree, "shape");
  const top = tree.statements[0]?.expression;
  if (held !== undefined)
    return format(
      text.slice(0, held.initializer.getStart(tree)) +
        json +
        text.slice(held.initializer.end),
      { filepath: file },
    );
  if (top === undefined || !ts.isObjectLiteralExpression(top))
    throw new Error(`${file}: not a JSON object`);
  const close = top.getEnd() - 1;
  const before = text.slice(0, close).trimEnd();
  const comma = before.endsWith(",") || before.endsWith("{") ? "" : ",";
  return format(
    `${before}${comma}\n\n  "shape": ${json}\n${text.slice(close)}`,
    {
      filepath: file,
    },
  );
}

/** One line per measure: how many papers carry it, and its five numbers. */
export function summaryOf(rows: readonly Row[]): readonly string[] {
  return SHAPE_MEASURES.map((m) => {
    const d = distributionOf(rows.flatMap((r) => r[m] ?? []));
    return d === null
      ? `${m}: counted on none`
      : `${m}: n=${String(d.n)}  min ${String(d.min)} · q1 ${String(d.q1)} · median ${String(d.median)} · q3 ${String(d.q3)} · max ${String(d.max)}`;
  });
}

export interface MainOptions {
  readonly preset: string;
  /** The corpus file's path, or null to measure again the papers the preset lists. */
  readonly corpus: string | null;
  readonly read: ReadPaper;
  /** The day of the measurement, YYYY-MM-DD. */
  readonly today: string;
  readonly log: (line: string) => void;
}

/** The corpus to measure: the file's, or the one the preset's `shape` lists. */
function corpusOf(o: MainOptions, text: string): Corpus {
  if (o.corpus !== null) {
    const parsed = Corpus.safeParse(JSON.parse(readFileSync(o.corpus, "utf8")));
    if (!parsed.success)
      throw new Error(
        `${o.corpus} is not a corpus: ${z.prettifyError(parsed.error)}`,
      );
    return parsed.data;
  }
  const shape = parsePreset(text, o.preset).shape;
  if (shape === null)
    throw new Error(
      `${o.preset} has no "shape" to measure again — name the papers with --corpus`,
    );
  return {
    source: shape.source,
    url: shape.url,
    papers: shape.papers.map(({ paper, url }) => ({ paper, url })),
  };
}

/** The corpus, or why there is none, in one line. */
function corpusOrWhy(o: MainOptions, text: string): Corpus | string {
  try {
    return corpusOf(o, text);
  } catch (e) {
    return messageOf(e);
  }
}

/** The papers left out, and the ones kept whose title the PDF does not carry. */
function reportMisses(m: Measured, log: (line: string) => void): void {
  m.failed.forEach((f) => {
    log(`✗ not measured: ${f}`);
  });
  m.unsure.forEach((u) => {
    log(`? the title is not on its first pages — check the PDF by hand: ${u}`);
  });
}

/** Measure the corpus, write the preset, print what was and was not measured. 0, or 1 when nothing was. */
export async function main(o: MainOptions): Promise<number> {
  const text = readFileSync(o.preset, "utf8");
  const corpus = corpusOrWhy(o, text);
  if (typeof corpus === "string") {
    o.log(`✗ ${corpus}`);
    return 1;
  }
  const m = await measureCorpus(corpus, o.read);
  reportMisses(m, o.log);
  const of = `${String(m.rows.length)} of ${String(corpus.papers.length)}`;
  if (m.rows.length === 0) {
    o.log(`✗ measured ${of} papers — ${o.preset} not written`);
    return 1;
  }
  const shape = {
    source: corpus.source,
    url: corpus.url,
    measured: o.today,
    papers: m.rows,
  };
  writeFileSync(o.preset, await withShape(text, o.preset, shape));
  summaryOf(m.rows).forEach((l) => {
    o.log(`  ${l}`);
  });
  o.log(`✓ measured ${of} papers into ${o.preset}`);
  return 0;
}

/**
 * The reader the script runs with: each URL fetched once into `cache` (named by the URL's SHA-256),
 * then read by pdf.js. The effects live here, at the edge.
 */
export function pdfReader(cache: string): ReadPaper {
  return async (url) => {
    mkdirSync(cache, { recursive: true });
    const file = join(
      cache,
      `${createHash("sha256").update(url).digest("hex")}.pdf`,
    );
    if (!existsSync(file)) {
      const fetched = await fetch(url).then(
        async (r) =>
          r.ok
            ? new Uint8Array(await r.arrayBuffer())
            : `HTTP ${String(r.status)}`,
        (e: unknown) => `unreachable: ${messageOf(e)}`,
      );
      if (typeof fetched === "string") return { ok: false, why: fetched };
      writeFileSync(file, fetched);
    }
    const r = await readPdf(file);
    return r.ok
      ? { ok: true, pageTexts: r.facts.pageTexts }
      : { ok: false, why: `${r.reason}: ${r.detail}` };
  };
}

/** The preset, `--corpus <file>` and `--cache <dir>` from the command line. */
export function argsOf(argv: readonly string[]): {
  readonly preset: string | null;
  readonly corpus: string | null;
  readonly cache: string;
} {
  const value = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : (argv[i + 1] ?? null);
  };
  const flags = new Set(["--corpus", "--cache"]);
  const preset = argv.find(
    (a, i) => !a.startsWith("--") && !flags.has(argv[i - 1] ?? ""),
  );
  return {
    preset: preset ?? null,
    corpus: value("--corpus"),
    cache: value("--cache") ?? join(tmpdir(), "paperlint-venue-shape"),
  };
}

const USAGE =
  "usage: node scripts/measure-venue-shape.ts <preset.jsonc> [--corpus <corpus.json>] [--cache <dir>]";

// `isMain`, not a comparison with `file://${argv[1]}`: that is false through a symlink (consumer.mjs).
if (isMain(import.meta.url)) {
  const args = argsOf(process.argv.slice(2));
  if (args.preset === null) {
    console.error(USAGE);
    process.exit(2);
  }
  process.exit(
    await main({
      preset: args.preset,
      corpus: args.corpus,
      read: pdfReader(args.cache),
      // The clock is read here, at the edge: the day the papers were measured.
      today: new Date().toISOString().slice(0, 10),
      log: console.log,
    }),
  );
}
