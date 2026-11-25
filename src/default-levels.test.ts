/**
 * The default rule set, kept in `default-rules.json` at the repository root. The release compares the
 * file at the last release tag with HEAD (`scripts/release-type.ts`), so a change here that the file
 * does not show would release without its version bump. After an intended change:
 * `npx vitest run src/default-levels.test.ts -u`, and commit the file.
 */
import { describe, expect, it } from "vitest";
import { buildConfig } from "./cli.ts";
import { defaultLevels } from "./default-levels.ts";

describe("defaultLevels", () => {
  it("keeps each rule's highest level, in every severity form, and drops what is off", () => {
    // Guards: a rule at warn in one block and error in another is an error rule.
    expect(
      defaultLevels([
        { rules: { "a/x": "warn", "a/off": "off", "b/y": 1 } },
        { rules: { "a/x": ["error", { n: 1 }], "a/off": 0, "c/z": 2 } },
      ]),
    ).toEqual({ "a/x": "error", "b/y": "warn", "c/z": "error" });
  });

  it("refuses a value that is no severity", () => {
    // Guards: ESLint refuses it too; read as "off", it would drop a rule from the snapshot unseen.
    expect(() => defaultLevels([{ rules: { "a/x": "loud" } }])).toThrow(
      "not an ESLint severity: loud",
    );
  });

  it("an empty config has no default rules", () => {
    expect(defaultLevels([{}, { rules: {} }])).toEqual({});
  });
});

describe("default-rules.json", () => {
  it("is the default rule set of a project with no configuration", async () => {
    const levels = defaultLevels(buildConfig({}, { sentinel: "tex language" }));
    // Guards: a broken read of the config would snapshot nothing and pass.
    expect(Object.keys(levels).length).toBeGreaterThan(30);
    await expect(`${JSON.stringify(levels, null, 2)}\n`).toMatchFileSnapshot(
      "../default-rules.json",
    );
  });
});
