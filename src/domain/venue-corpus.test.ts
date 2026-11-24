import { describe, expect, it } from "vitest";
import { editionCountIssue, type Edition, type Paper } from "./venue-corpus.ts";

const EDITION: Edition = {
  edition: 2026,
  listed_from: "https://example.org/accepted",
  read_on: "2026-11-03",
  accepted: 2,
  capped: null,
  proxy: null,
};

const row = (
  key: string,
  group: "accepted" | "award",
  edition = 2026,
): Paper => ({
  key,
  edition,
  group,
  title: key,
  ids: { doi: `10.1/${key}` },
  copies: [],
});

const SISTER: Paper = {
  key: "other",
  group: "sister",
  venue: "nlbse",
  year: 2026,
  listed_from: "https://example.org/nlbse",
  title: "other",
  ids: { doi: "10.1/other" },
  copies: [],
};

describe("an edition's papers against what it accepted", () => {
  it("🔴 uncapped: the winners and the ordinary papers together are all it accepted", () => {
    // Guards: an award row is one of the accepted papers; a sister or another edition's row is not.
    expect(
      editionCountIssue(EDITION, [
        row("a", "accepted"),
        row("b", "award"),
        row("c", "accepted", 2025),
        SISTER,
      ]),
    ).toBeNull();
  });

  it("🔴 uncapped: fewer rows than it accepted is a list copied in part", () => {
    expect(editionCountIssue(EDITION, [row("a", "accepted")])).toBe(
      "1 papers of 2026 are listed and 2 were accepted: list them all, or say in capped what was left out",
    );
  });

  it("🔴 uncapped: more rows than it accepted", () => {
    expect(
      editionCountIssue(EDITION, [
        row("a", "accepted"),
        row("b", "accepted"),
        row("c", "award"),
      ]),
    ).toBe(
      "3 papers of 2026 are listed and 2 were accepted: list them all, or say in capped what was left out",
    );
  });

  it("🔴 capped: fewer rows than it accepted is what capped says", () => {
    expect(
      editionCountIssue({ ...EDITION, capped: "the research track only" }, [
        row("a", "accepted"),
      ]),
    ).toBeNull();
  });

  it("🔴 capped: still never more rows than it accepted", () => {
    expect(
      editionCountIssue({ ...EDITION, capped: "the research track only" }, [
        row("a", "accepted"),
        row("b", "accepted"),
        row("c", "accepted"),
      ]),
    ).toBe("3 papers of 2026 are listed, more than the 2 it accepted");
  });
});
