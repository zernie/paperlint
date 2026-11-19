/**
 * docs/venues.md lists what paperlint ships. Both halves: every shipped preset is named there as
 * `paperlint:<id>`, and every `paperlint:<id>` it names is a shipped preset — a planted list that
 * misses one, or names one that is gone, is reported.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { presetsDir } from "../src/package-dirs.ts";
import { shippedPresets } from "../src/presets.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = readFileSync(join(REPO, "docs", "venues.md"), "utf8");

/** Every `paperlint:<id>` a text names, once each; placeholders (`paperlint:<series>-<year>`) are not ids. */
const namedIn = (text: string): readonly string[] => [
  ...new Set(
    [...text.matchAll(/paperlint:([a-z0-9]+(?:-[a-z0-9]+)*)(?![\w-])/gu)].map(
      (m) => String(m[1]),
    ),
  ),
];

/** What a doc gets wrong about the shipped presets: the ones it misses, and the ones that do not exist. */
function coverage(
  text: string,
  shipped: readonly string[],
): {
  readonly missing: readonly string[];
  readonly unknown: readonly string[];
} {
  const named = namedIn(text);
  return {
    missing: shipped.filter((id) => !named.includes(id)),
    unknown: named.filter((id) => !shipped.includes(id)),
  };
}

describe("docs/venues.md names every shipped preset, and only those", () => {
  const shipped = shippedPresets(presetsDir());

  it("the real doc: nothing missing, nothing unknown", () => {
    expect(shipped.length).toBeGreaterThan(15);
    expect(coverage(DOC, shipped)).toEqual({ missing: [], unknown: [] });
  });

  it("🔴 planted: a doc that misses an edition and names one that is gone", () => {
    const planted = DOC.replaceAll(
      "paperlint:nlbse-2027",
      "paperlint:nlbse-2026",
    );
    expect(coverage(planted, shipped)).toEqual({
      missing: ["nlbse-2027"],
      unknown: ["nlbse-2026"],
    });
  });
});
