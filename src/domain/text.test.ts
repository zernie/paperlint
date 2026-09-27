import assert from "node:assert/strict";
import { test } from "vitest";
import { codeOf, firstLine, messageOf, printed } from "./text.ts";

test("messageOf: an Error's message, and anything else thrown as its text", () => {
  assert.equal(messageOf(new Error("boom")), "boom");
  // `throw "x"` and `throw 3` are legal JavaScript; `(e as Error).message` read them as undefined.
  assert.equal(messageOf("plain string"), "plain string");
  assert.equal(messageOf(3), "3");
});

test("codeOf: a string `code` only", () => {
  assert.equal(
    codeOf(Object.assign(new Error("x"), { code: "ENOENT" })),
    "ENOENT",
  );
  assert.equal(codeOf(new Error("no code")), undefined);
  assert.equal(codeOf({ code: 3 }), undefined);
  assert.equal(codeOf(null), undefined);
  assert.equal(codeOf("ENOENT"), undefined);
});

test("printed: a stream a failed spawn left undefined reads as empty text", () => {
  assert.equal(printed(undefined), "");
  assert.equal(printed(null), "");
  assert.equal(printed("out"), "out");
});

test("firstLine: the first non-blank line, trimmed", () => {
  assert.equal(firstLine("\n  \n  first \nsecond"), "first");
  assert.equal(firstLine(""), "");
});
