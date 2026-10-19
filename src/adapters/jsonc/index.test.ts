/** A preset's `deadlines` rewritten on the JSONC's syntax tree, everything else as written. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { presetsDir } from "../../package-dirs.ts";
import { parsePreset } from "../../tex-requirements.ts";
import { jsoncPresets } from "./index.ts";

const MSR = join(presetsDir(), "msr.jsonc");
const msrText = readFileSync(MSR, "utf8");
const readings = (text: string) => parsePreset(text, MSR).deadlines ?? [];

describe("withDeadlines — located on the JSONC's syntax tree, not by text", () => {
  test.each([
    ["an object with no portal", "{}"],
    ["a list", "[]"],
    ["nothing", ""],
  ])(
    "%s has no `portal` to put `deadlines` after: refused by name",
    async (_what, text) => {
      await expect(
        jsoncPresets.withDeadlines(text, "x.jsonc", []),
      ).rejects.toThrow('x.jsonc: no "portal" to put "deadlines" after');
    },
  );

  test("writing back the readings the file holds gives the file's own bytes", async () => {
    expect(
      await jsoncPresets.withDeadlines(msrText, MSR, readings(msrText)),
    ).toBe(msrText);
  });
});
