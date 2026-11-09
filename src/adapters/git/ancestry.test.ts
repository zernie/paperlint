/**
 * The in-memory ancestry of the commits git lists: who is below whom, and the order of a commit
 * against the commits that touched a decision.
 */
import { expect, it } from "vitest";
import { ancestryOf, orderAmong } from "./ancestry.ts";

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);
const D = "d".repeat(40);
const E = "e".repeat(40);
// A is a root; B and C descend from A; D merges B and C; E is another root.
const LOG = `${A} \n${B} ${A}\n${C} ${A}\n${D} ${B} ${C}\n${E} \n`;
const log = ancestryOf(LOG);

it("a merge is after both its sides and everything below them; siblings and roots are not after each other", () => {
  // Guards: the transitive closure through a merge, and no ancestry between lines of history.
  expect([
    orderAmong(log, D, [A]),
    orderAmong(log, D, [C]),
    orderAmong(log, B, [C]),
    orderAmong(log, E, [A]),
    orderAmong(log, A, [D]),
  ]).toEqual(["after", "after", "not-after", "not-after", "not-after"]);
});

it("a commit that is itself among the touching ones, with none of them below it, is the same", () => {
  // Guards: `same` needs the commit among the touching and no strict ancestor among them.
  expect([
    orderAmong(log, A, [A]),
    orderAmong(log, B, [B, E]),
    orderAmong(log, B, [A, B]),
  ]).toEqual(["same", "same", "after"]);
});

it("a commit git did not list, or a touching commit it did not list, has no order", () => {
  // Guards: unknown is never read as not-after.
  expect([
    orderAmong(log, "f".repeat(40), [A]),
    orderAmong(log, B, ["f".repeat(40)]),
  ]).toEqual([undefined, undefined]);
});

it("blank lines are skipped, a root has no parents, and a parent git did not list is ignored", () => {
  // Guards: the trailing newline of git's output is not a commit.
  expect([...ancestryOf(`${A} \n\n${B} ${E}\n`)]).toEqual([
    [A, { bit: 1n, upto: 1n }],
    [B, { bit: 2n, upto: 2n }],
  ]);
});
