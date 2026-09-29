import { describe, expect, it } from "vitest";
import {
  findLeaks,
  spellingsOf,
  tokenPattern,
  type Searchable,
} from "./anonymity.ts";

const page = (text: string, n = 1): Searchable => ({
  place: { kind: "page", page: n },
  text,
});
const found = (token: string, text: string): string[] =>
  findLeaks([token], [page(text)]).map((l) => l.found);

describe("findLeaks — the spellings of one name a PDF produces", () => {
  it("plain, and in any case (the flags fold Unicode, no locale)", () => {
    expect(found("Ada Example", "by Ada Example, 2026")).toEqual([
      "Ada Example",
    ]);
    expect(found("Ada Example", "ADA EXAMPLE")).toEqual(["ADA EXAMPLE"]);
  });

  it("Cyrillic folds too", () => {
    expect(found("Ада Пример", "АДА ПРИМЕР пишет")).toEqual(["АДА ПРИМЕР"]);
    expect(found("АДА", "ада")).toEqual(["ада"]);
  });

  it("items joined without a space where kerning split a word", () => {
    expect(found("Ada Example", "AdaExample")).toEqual(["AdaExample"]);
  });

  it("letter-spaced text", () => {
    expect(found("Ada Example", "A d a  E x a m p l e")).toEqual([
      "A d a  E x a m p l e",
    ]);
  });

  it("a word hyphenated across a line break, and a name broken across lines", () => {
    expect(found("Ada Example", "Ada Exam-\nple wrote")).toEqual([
      "Ada Exam-\nple",
    ]);
    expect(found("Ada Example", "by Ada\nExample")).toEqual(["Ada\nExample"]);
    expect(found("adaexample", "ada­example")).toEqual(["ada­example"]);
  });

  it("ligatures (NFKC on both sides)", () => {
    expect(found("Fiona", "ﬁona")).toEqual(["fiona"]);
    expect(found("ﬁona", "Fiona")).toEqual(["Fiona"]);
  });

  it("handles and addresses, as whole tokens", () => {
    expect(found("adaexample", "https://github.com/adaexample/tool")).toEqual([
      "adaexample",
    ]);
    expect(found("ada@example.org", "mail ada@example.org.")).toEqual([
      "ada@example.org",
    ]);
  });

  it("does not match inside another word", () => {
    expect(found("Ada", "Canada and adamant")).toEqual([]);
    expect(found("MIT", "submitted")).toEqual([]);
  });

  it("says nothing about a clean text", () => {
    expect(found("Ada Example", "Anonymous Authors")).toEqual([]);
  });
});

describe("findLeaks — places and tokens", () => {
  it("reports each token once per place, with the place", () => {
    const leaks = findLeaks(
      ["Ada Example", "ada@example.org"],
      [
        page("Ada Example and Ada Example", 2),
        {
          place: { kind: "metadata", field: "Author" },
          text: "ada@example.org",
        },
        {
          place: {
            kind: "link",
            page: 3,
            uri: "https://github.com/adaexample",
          },
          text: "https://github.com/adaexample",
        },
      ],
    );
    expect(leaks).toEqual([
      {
        token: "Ada Example",
        place: { kind: "page", page: 2 },
        found: "Ada Example",
      },
      {
        token: "ada@example.org",
        place: { kind: "metadata", field: "Author" },
        found: "ada@example.org",
      },
      {
        token: "Ada Example",
        place: { kind: "link", page: 3, uri: "https://github.com/adaexample" },
        found: "adaexample",
      },
    ]);
  });

  it("a token of separators only has no pattern and finds nothing", () => {
    expect(tokenPattern(" - ")).toBeNull();
    expect(findLeaks([" "], [page("anything at all")])).toEqual([]);
  });
});

describe("findLeaks — one text, two tokens", () => {
  it("is one leak, under the first token declared", () => {
    expect(
      findLeaks(["Ada Example", "adaexample"], [page("by AdaExample")]),
    ).toEqual([
      {
        token: "Ada Example",
        place: { kind: "page", page: 1 },
        found: "AdaExample",
      },
    ]);
  });
});

describe("spellingsOf — a personal name as a reference list prints it", () => {
  it("adds initials and surname-first forms to a name of two to four words", () => {
    expect(spellingsOf("Ada Example")).toEqual([
      "Ada Example",
      "A. Example",
      "Example, Ada",
      "Example, A.",
    ]);
    expect(spellingsOf("Ada Byron Example")).toEqual([
      "Ada Byron Example",
      "A. B. Example",
      "Example, Ada Byron",
      "Example, A. B.",
    ]);
  });

  it("leaves a handle, an address, one word, or lowercase words alone", () => {
    expect(spellingsOf("adaexample")).toEqual(["adaexample"]);
    expect(spellingsOf("ada@example.org")).toEqual(["ada@example.org"]);
    expect(spellingsOf("Example")).toEqual(["Example"]);
    expect(spellingsOf("example tool")).toEqual(["example tool"]);
    expect(spellingsOf("A B C D E")).toEqual(["A B C D E"]);
  });

  it("a self-citation's author list finds the declared name", () => {
    expect(
      found("Ada Example", "[3] A. Example and B. Other, “A tool,” 2025."),
    ).toEqual(["A. Example"]);
    expect(found("Ada Example", "Example, A., and Other, B. (2025)")).toEqual([
      "Example, A.",
    ]);
    expect(found("Ada Example", "B. Example wrote")).toEqual([]);
  });
});
