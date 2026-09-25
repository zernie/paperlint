// expect: boundaries/dependencies
import { rule } from "../../../eslint-rules/rule.mjs";

/** Only the eslint adapter may import the package's ESLint rules. */
export const r = rule;
