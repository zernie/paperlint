import { expect, it } from "vitest";
import { scopeOf } from "./venue-scope.ts";

it("a preset with no scope has none", () => {
  expect(scopeOf(undefined)).toBeNull();
});

it("a scope without topics carries an empty topic list, the rest as written", () => {
  // Guards: a reader can print topics without asking whether the call gave any.
  expect(
    scopeOf({
      url: "https://example.org/cfp",
      read: "2026-11-25",
      sentences: ["Papers on X."],
    }),
  ).toEqual({
    url: "https://example.org/cfp",
    read: "2026-11-25",
    sentences: ["Papers on X."],
    topics: [],
  });
});

it("a scope's topics are kept verbatim and in order", () => {
  expect(
    scopeOf({
      url: "https://example.org/cfp",
      read: "2026-11-25",
      sentences: ["Papers on X."],
      topics: ["B topic", "A topic"],
    })?.topics,
  ).toEqual(["B topic", "A topic"]);
});
