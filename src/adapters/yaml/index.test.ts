/** `parseYaml`: the value, a bare date as a `Date`, or the parser's own message. */
import { expect, test } from "vitest";
import { parseYaml } from "./index.ts";

test("parses a mapping, a date without quotes as a Date; refuses what is not YAML with the reason", () => {
  expect(parseYaml("a: 1\nd: 2026-07-22\n")).toStrictEqual({
    ok: true,
    value: { a: 1, d: new Date("2026-07-22T00:00:00.000Z") },
  });
  const bad = parseYaml("a: [");
  expect(bad.ok).toBe(false);
  expect(!bad.ok && bad.error).toMatch(/unexpected end of the stream/);
});
