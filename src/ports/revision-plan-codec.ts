/** How a revision plan's text becomes a plan: parsed once, at the boundary (src/domain/revision-plan.ts). */
import type { ParsedPlan } from "../domain/revision-plan.ts";

export interface RevisionPlanCodec {
  /** `revision-plan.json`'s text → the plan, or every reason it is not one, each at its field. */
  readonly parse: (text: string) => ParsedPlan;
}
