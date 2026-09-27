import assert from "node:assert/strict";
import { test } from "vitest";
import { fieldOf, isRecord, numbersOf } from "./record.ts";

test("isRecord: an object, and not null, an array or a string", () => {
  assert.deepEqual(
    [isRecord({}), isRecord(null), isRecord([]), isRecord("x")],
    [true, false, false, false],
  );
});

test("fieldOf reads an own or inherited field of a record, and nothing of anything else", () => {
  assert.equal(fieldOf({ a: 1 }, "a"), 1);
  assert.equal(fieldOf(new TypeError("x"), "name"), "TypeError");
  assert.equal(fieldOf("text", "length"), undefined);
});

test("numbersOf keeps numbers as they are", () => {
  assert.deepEqual(numbersOf([1, -0.5, 0]), [1, -0.5, 0]);
});
