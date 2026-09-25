/**
 * Does a banal RUN — accepted by a measurement, not by the download's exit code. The probe is one
 * US-letter page of 50 lines of 10 pt text: enough for banal to measure a body font size.
 */
import { err, ok, type Result } from "../../domain/result.ts";
import type { BanalFailure } from "./failure.ts";
import type { BanalMeasurement } from "./output.ts";
import type { PageLayout } from "../../domain/page-layout.ts";

/** One text line of 90 characters, 10 pt, at line `i` of a one-column page. */
const probeLine = (i: number) => ({
  top: 72 + i * 12,
  left: 72,
  width: 468,
  height: 10,
  size: 10,
  font: "Times-Roman",
  text: "x".repeat(90),
  upright: true,
  fill: { kind: "unknown" } as const,
});

export const PROBE_PAGE: PageLayout = {
  widthPt: 612,
  heightPt: 792,
  boxes: Array.from({ length: 50 }, (_, i) => probeLine(i)),
};

/** A probe measurement is accepted when banal saw the one page and measured its body size. */
export const acceptProbe = (
  m: BanalMeasurement,
): Result<BanalMeasurement, BanalFailure> =>
  m.pages.length === 1 && typeof m.bodyfontsize === "number"
    ? ok(m)
    : err({ kind: "probe-rejected", got: m });
