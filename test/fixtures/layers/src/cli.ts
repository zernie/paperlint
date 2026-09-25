// expect: clean
import { readFileSync } from "node:fs";
import { run } from "./use-case.ts";
import { twoName } from "./adapters/two/index.ts";
import { adapterOne } from "./adapters/one/index.ts";
import { rule } from "../eslint-rules/rule.mjs";

/** The root: the only file that reads the environment and may import every layer. */
export const main = (): string =>
  [typeof run, twoName, adapterOne.name, rule, process.env["HOME"], readFileSync].join();
