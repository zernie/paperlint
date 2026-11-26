import { describe, expect, it } from "vitest";
import { limitsText, reviewText } from "./limits.ts";

const kind = (
  name: string,
  pagesMax: number | null,
  bodyPagesMax: number | null,
  refPagesMax: number | null,
) => ({ kind: name, pagesMax, bodyPagesMax, refPagesMax });

describe("limitsText", () => {
  it("says the format only when the edition has no kinds", () => {
    // Guards: a minimal preset (ICSE 2027) reads as a format, not as an empty sentence.
    expect(limitsText([])).toBe("The format only; page limits not checked.");
  });

  it("lists body pages once, then the references they share", () => {
    expect(
      limitsText([kind("short", null, 5, 2), kind("full", null, 10, 2)]),
    ).toBe("short 5, full 10 pages, + 2 pages of references.");
  });

  it("adds the total when the kinds share one, and says when references are not counted", () => {
    expect(
      limitsText([kind("research", 12, 10, 2), kind("sok", 12, 10, 2)]),
    ).toBe("research 10, sok 10 pages, + 2 pages of references, 12 in all.");
    expect(
      limitsText([
        kind("regular", null, 12, null),
        kind("short", null, 6, null),
      ]),
    ).toBe("regular 12, short 6 pages, references not counted.");
  });

  it("lists a total-only limit as the whole paper", () => {
    expect(
      limitsText([kind("full", 8, null, null), kind("short", 5, null, null)]),
    ).toBe("full 8, short 5 pages.");
  });

  it("spells each kind out when their limits differ", () => {
    // Guards: IEEE S&P's two kinds count references differently; one shared tail would misstate one.
    expect(
      limitsText([kind("research", 18, 13, 5), kind("sok", null, 13, null)]),
    ).toBe(
      "research 13 pages + 5 of references, 18 in all; sok 13 pages, references not counted.",
    );
    expect(
      limitsText([kind("full", 8, null, null), kind("talk", null, null, null)]),
    ).toBe("full 8 pages; talk page limit not checked.");
  });

  it("names the kinds when none has a page limit", () => {
    expect(
      limitsText([
        kind("long", null, null, null),
        kind("short", null, null, null),
      ]),
    ).toBe("long, short: page limits not checked.");
  });
});

describe("reviewText", () => {
  it("names double-blind review when the preset says so, and nothing otherwise", () => {
    // Guards: the popover never claims a review mode the preset does not record.
    expect([reviewText(true), reviewText(false)]).toEqual([
      "Double-blind review.",
      null,
    ]);
  });
});
