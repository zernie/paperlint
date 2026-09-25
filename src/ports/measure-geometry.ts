/** The port `facts-file.ts` measures page geometry through — shaped by the need, not by a tool. */
import type { Geometry } from "../domain/geometry.ts";
import type { PageLayout } from "../domain/page-layout.ts";

/** Measure a paper's page geometry from its text boxes. Never throws: "not measured" is a value. */
export interface MeasureGeometry {
  measure(pages: readonly PageLayout[]): Geometry;
}
