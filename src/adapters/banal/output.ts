/**
 * banal's output, PARSED — one schema, one type, read by both consumers (the facts file and the
 * install probe). What banal prints was measured on the pinned banal 1.2 (2026-09-25): an object
 * with `papersize` ([height, width] in points), `columns`, `bodyfontsize` — null on an empty
 * document — and `pages`, one entry per page, where a page's `type` is OMITTED when it is "body".
 */
import { z } from "zod";
import type { PageGeometry } from "../../domain/geometry.ts";
import { firstLine } from "../../domain/text.ts";
import type { ProcessExit } from "../../ports/process.ts";
import { andThen, err, ok, type Result } from "../../domain/result.ts";
import type { BanalFailure } from "./failure.ts";

const page = z.looseObject({
  type: z.string().optional(),
  reffontsize: z.number().nullable().optional(),
});

/** banal's own failure object: exit 0 and `{"error": true, …}`. It has no measurement in it. */
const banalError = z.looseObject({ error: z.literal(true) });

export const measurementSchema = z.looseObject({
  papersize: z.tuple([z.number(), z.number()]).optional(),
  columns: z.number().nullable().optional(),
  bodyfontsize: z.number().nullable().optional(),
  /** Required: banal emits it on every run, an empty document included (measured). */
  pages: z.array(page),
});

/** A measurement banal printed. banal's `{"error": true}` object cannot be one: it is refused first. */
export type BanalMeasurement = z.infer<typeof measurementSchema>;

interface Streams {
  readonly stdout: string;
  readonly stderr: string;
}

/** The process-level outcome, before stdout is read: banal's streams, or why there are none. */
function streamsOf(r: ProcessExit): Result<Streams, BanalFailure> {
  switch (r.kind) {
    case "not-found":
      return err({ kind: "perl-missing" });
    case "spawn-failed":
      return err({ kind: "spawn-failed", message: r.message });
    case "timed-out":
      return err({ kind: "timed-out", afterMs: r.afterMs });
    case "signalled":
      return err({
        kind: "signalled",
        signal: r.signal,
        stderrHead: firstLine(r.stderr),
      });
    case "exited":
      return r.status === 0
        ? ok(r)
        : err({
            kind: "process-failed",
            status: r.status,
            stderrHead: firstLine(r.stderr),
          });
  }
}

function jsonOf(stdout: string): Result<unknown, null> {
  try {
    return ok(JSON.parse(stdout));
  } catch {
    return err(null);
  }
}

/** What banal printed, as a measurement — or which failure it is. */
function measurementOf(o: Streams): Result<BanalMeasurement, BanalFailure> {
  const json = jsonOf(o.stdout);
  if (!json.ok)
    return err({
      kind: "no-json",
      head: firstLine(o.stdout) || firstLine(o.stderr),
    });
  if (banalError.safeParse(json.value).success)
    return err({ kind: "banal-error", stderrHead: firstLine(o.stderr) });
  const m = measurementSchema.safeParse(json.value);
  return m.success
    ? ok(m.data)
    : err({
        kind: "unexpected-shape",
        issues: m.error.issues.map(
          (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
        ),
      });
}

/** A banal run as a measurement, or which failure it was. Total over `ProcessExit`. */
export const parseBanalOutput = (
  r: ProcessExit,
): Result<BanalMeasurement, BanalFailure> =>
  andThen(streamsOf(r), measurementOf);

const inches = (pt: number | undefined): number | null =>
  pt === undefined ? null : Number((pt / 72).toFixed(3));

type Page = BanalMeasurement["pages"][number];

/**
 * 🔴 banal OMITS a page's `type` when it is "body" (its line 1022: `push … if $page->{type} ne
 * "body"`), so counting pages whose type equals "body" gives ZERO for every paper in the world —
 * that is how the first page-limit gate was written, and it could not fire once. A page without a
 * type IS a body page.
 */
const typeOf = (p: Page): string => p.type ?? "body";

/** Pages per type, body pages included under "body". */
function countByType(pages: readonly Page[]): Record<string, number> {
  const byType: Record<string, number> = {};
  for (const p of pages) byType[typeOf(p)] = (byType[typeOf(p)] ?? 0) + 1;
  return byType;
}

/** The reference font size: the first bibliography page that has one. */
const refFontSize = (pages: readonly Page[]): number | null =>
  pages.find((p) => p.type === "bib" && p.reffontsize != null)?.reffontsize ??
  null;

/** The measurement → the domain's page geometry. */
export function geometryOf(m: BanalMeasurement): PageGeometry {
  const byType = countByType(m.pages);
  const refPages = byType["bib"] ?? 0;
  const appendixPages = byType["appendix"] ?? 0;
  return {
    // banal gives papersize as [height, width] in points — checked against live output 2026-08-26.
    pageWidthIn: inches(m.papersize?.[1]),
    pageHeightIn: inches(m.papersize?.[0]),
    columns: m.columns ?? null,
    bodyPt: m.bodyfontsize ?? null,
    refPt: refFontSize(m.pages),
    bodyPages: m.pages.length - refPages - appendixPages,
    refPages,
    appendixPages,
    pagesByType: byType,
  };
}
