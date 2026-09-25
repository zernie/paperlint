// expect: boundaries/dependencies
import { rule } from "../../eslint-rules/rule.mjs";

/** The domain reads none of the package's `.mjs` modules: they are the outside's. */
export const r = rule;
