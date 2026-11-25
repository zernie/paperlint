/**
 * The default rule set as a record: each rule a project gets with no configuration, at the highest
 * level any of paperlint's own config blocks gives it. `default-levels.test.ts` keeps it in
 * `default-rules.json`, and the release reads that file (`scripts/release-type.ts`): a rule that
 * joins the set at `error`, or rises to `error`, makes the release a major one.
 */
import { pipe, flatMap, groupBy, mapValues, firstBy, entries } from "remeda";
import type { ConfigBlock } from "./rules-config.ts";

export type Level = "warn" | "error";

const LEVEL_OF: Readonly<Record<string, Level | "off">> = {
  off: "off",
  warn: "warn",
  error: "error",
  "0": "off",
  "1": "warn",
  "2": "error",
};

const RANK: Readonly<Record<Level | "off", number>> = {
  off: 0,
  warn: 1,
  error: 2,
};

/** A rule entry's level: `"error"`, `2` or `["error", options]` alike; any other value is refused. */
const levelOf = (entry: unknown): Level | "off" => {
  const severity = String(Array.isArray(entry) ? entry[0] : entry);
  const level = LEVEL_OF[severity];
  if (level === undefined)
    throw new Error(`not an ESLint severity: ${severity}`);
  return level;
};

/** Every rule the blocks turn on, by id, at its highest level; ids in order. */
export const defaultLevels = (
  blocks: readonly ConfigBlock[],
): Readonly<Record<string, Level>> => {
  const highest = pipe(
    blocks,
    flatMap((b) =>
      entries(b.rules ?? {}).map(([id, e]) => ({ id, level: levelOf(e) })),
    ),
    groupBy((r) => r.id),
    mapValues((rs) => firstBy(rs, [(r) => RANK[r.level], "desc"]).level),
  );
  return Object.fromEntries(
    Object.entries(highest)
      .filter((pair): pair is [string, Level] => pair[1] !== "off")
      .sort(([a], [b]) => a.localeCompare(b)),
  );
};
