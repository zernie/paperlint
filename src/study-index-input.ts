/**
 * What `paperlint studies index` and `studies new` generate the index from beyond the registry: each
 * row's plan, and each decide-first study's history as git gives it now (src/domain/index-columns.ts).
 */
import { indexHistory } from "./domain/index-columns.ts";
import type { IndexInput, RegistryState } from "./domain/study-registry.ts";
import {
  decideFirstStudies,
  type OrderDeps,
} from "./outputs-before-decision-rule.ts";
import { plansOf, readableFolders } from "./study-registry-rule.ts";

/** The plans and the histories of the paper folder `paper`, whose registry is `r`. */
export const indexInputOf = (
  paper: string,
  r: RegistryState,
  deps: OrderDeps,
): IndexInput => ({
  plans: plansOf(paper, r, deps, readableFolders(paper, deps)),
  history: new Map(
    decideFirstStudies(paper, deps).map((s) => [s.id, indexHistory(s)]),
  ),
});
