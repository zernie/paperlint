/**
 * `renderTree` (`src/domain/layout-tree.ts`): the drawing every layout message and rule page shows.
 * Branches drawn as `tree` draws them, nested entries indented under a continuing or a closed branch,
 * every note in one column.
 */
import { describe, expect, it } from "vitest";
import { leaf, renderTree } from "./layout-tree.ts";

describe("renderTree", () => {
  it("draws nested entries under open and closed branches, notes in one column", () => {
    expect(
      renderTree("root/", [
        { name: "a/", note: "first", children: [leaf("x", "inner")] },
        leaf("bb", "middle"),
        { name: "c/", note: "last", children: [leaf("y", "under last")] },
      ]),
    ).toBe(
      [
        "root/",
        "├── a/     ← first",
        "│   └── x  ← inner",
        "├── bb     ← middle",
        "└── c/     ← last",
        "    └── y  ← under last",
      ].join("\n"),
    );
  });

  it("an empty layout is its root alone", () => {
    expect(renderTree("root/", [])).toBe("root/");
  });
});
