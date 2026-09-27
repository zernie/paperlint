import assert from "node:assert/strict";
import { test } from "vitest";
import { createChecker, failureMessage, renderDetail } from "./check.ts";

test("renderDetail: a string verbatim, nothing for empty, a value inspected, a thunk called", () => {
  assert.deepEqual(
    [
      renderDetail("as is"),
      renderDetail(""),
      renderDetail(undefined),
      renderDetail(null),
      renderDetail({ a: [1, 2] }),
      renderDetail(() => "lazy"),
      renderDetail(() => undefined),
    ],
    ["as is", "", "", "", "{ a: [ 1, 2 ] }", "lazy", ""],
  );
});

test("failureMessage: label alone, label — detail, or label on its own line above a multi-line detail", () => {
  assert.deepEqual(
    [
      failureMessage("L", undefined),
      failureMessage("L", "d"),
      failureMessage("L", "one\ntwo"),
    ],
    ["L", "L — d", "L\none\ntwo"],
  );
});

test("createChecker: counts every call, stays silent on a pass", () => {
  const printed: string[] = [];
  const check = createChecker({ log: (s) => printed.push(s) });
  check("a", true);
  check("b", 1 === 1, "unused detail");
  assert.deepEqual({ count: check.count, printed }, { count: 2, printed: [] });
});

test("createChecker: a failure throws AND prints the label with its detail, and is counted", () => {
  const printed: string[] = [];
  const check = createChecker({ log: (s) => printed.push(s) });
  // Guards: the detail reaches the reader — the drift this helper replaced dropped it.
  assert.throws(
    () => {
      check("the label", false, { got: 3 });
    },
    {
      name: "AssertionError",
      message: "the label — { got: 3 }",
    },
  );
  assert.deepEqual(
    { count: check.count, printed },
    { count: 1, printed: ["✗ the label — { got: 3 }"] },
  );
});

test("createChecker: a detail thunk is only evaluated on failure", () => {
  let calls = 0;
  const check = createChecker({ log: () => {} });
  check("pass", true, () => {
    calls++;
    return "x";
  });
  assert.throws(() => {
    check("fail", false, () => {
      calls++;
      return "x";
    });
  });
  assert.equal(calls, 1);
});
