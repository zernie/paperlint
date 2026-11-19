import { readFileSync } from "node:fs";
import * as R from "remeda";
import { describe, expect, it } from "vitest";
import { cn, themeTokens } from "./utils.ts";

const css = readFileSync(
  new URL("../../app/styles/globals.css", import.meta.url),
  "utf8",
);

/** The names globals.css declares under `--<key>-`, sub-properties (`--text-hero--line-height`) aside. */
const declared = (key: string): readonly string[] =>
  R.pipe(
    [...css.matchAll(new RegExp(`^\\s*--${key}-([a-z0-9-]+):`, "gm"))],
    R.map((m) => m[1] ?? ""),
    R.filter((name) => !name.includes("--")),
  );

describe("cn", () => {
  it("keeps a named size beside a colour, and lets a later size win", () => {
    expect(cn("text-hero", "text-copy")).toBe("text-hero text-copy");
    expect(cn("text-hero", "text-lead")).toBe("text-lead");
  });

  it("merges the named spacing, widths and shadows by group", () => {
    expect(cn("pt-hero", "pt-section", "max-w-page", "max-w-prose")).toBe(
      "pt-section max-w-prose",
    );
    expect(cn("shadow-soft", "shadow-shot", "bg-card")).toBe(
      "shadow-shot bg-card",
    );
  });
});

describe("themeTokens", () => {
  it.each(R.keys(themeTokens))(
    "names every --%s- token globals.css declares",
    (key) => {
      expect(declared(key)).toEqual(themeTokens[key]);
    },
  );

  it("a token globals.css does not declare is caught", () => {
    expect(declared("text")).not.toContain("jumbo");
  });
});
