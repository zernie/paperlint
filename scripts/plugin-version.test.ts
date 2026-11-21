import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { useTempDir, writeTree } from "../test/support.ts";
import { main, PLACEHOLDER, withVersion } from "./plugin-version.ts";

const dir = useTempDir("paperlint-plugin-version-");
const MANIFEST = { name: "paperlint", version: PLACEHOLDER, skills: "./skills/" };

const packageAt = (name: string, pkg: object): string => {
  const root = join(dir, name);
  writeTree(root, {
    "package.json": JSON.stringify(pkg),
    ".claude-plugin/plugin.json": JSON.stringify(MANIFEST),
  });
  return root;
};
const manifestOf = (root: string): unknown =>
  JSON.parse(readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8"));

describe("plugin-version", () => {
  it("stamp writes the package's version, restore puts the placeholder back, the rest kept", () => {
    const root = packageAt("release", { version: "1.2.3" });
    const stamped = [main("stamp", root), manifestOf(root)];
    const restored = [main("restore", root), manifestOf(root)];
    expect([stamped, restored]).toEqual([
      [0, { ...MANIFEST, version: "1.2.3" }],
      [0, MANIFEST],
    ]);
  });

  it("a package.json without a version stamps the placeholder; an unknown verb writes nothing", () => {
    const root = packageAt("bare", { name: "x" });
    expect([main("stamp", root), main("publish", root), main(undefined, root), manifestOf(root)]).toEqual([
      0,
      2,
      2,
      MANIFEST,
    ]);
  });

  it("withVersion: the two-space form with a final newline; a manifest that is not an object is refused", () => {
    expect(withVersion('{"name":"p"}', "9.9.9")).toBe(
      '{\n  "name": "p",\n  "version": "9.9.9"\n}\n',
    );
    expect(() => withVersion("[1]", "9.9.9")).toThrow(
      "plugin.json is not a JSON object",
    );
  });

  it("the tracked manifest carries the placeholder, as the tracked package.json does", () => {
    const tracked = (file: string): unknown =>
      JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
    expect([tracked(".claude-plugin/plugin.json"), tracked("package.json")]).toEqual([
      expect.objectContaining({ version: PLACEHOLDER }),
      expect.objectContaining({ version: PLACEHOLDER }),
    ]);
  });
});
