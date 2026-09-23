/**
 * Battery for `readme-anchors.mjs`. Each case turns the pointer check into one that reports
 * green while a pointer leads nowhere — the only way this check can fail its purpose.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "readme-anchors.mjs");
const HARNESS = join(HERE, "readme-anchors.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "a broken pointer is not reported",
        harness: HARNESS,
        expect: "a pointer to a heading that does not exist FAILS",
        disables:
          "the check itself: a renamed heading leaves the pointer in code leading nowhere, green",
        edits: [
          [
            SRC,
            "  return { pointers, broken: pointers.filter((p) => !anchors.has(p.anchor)) };",
            "  return { pointers, broken: [] };",
          ],
        ],
      },
      {
        name: "zero pointers passes",
        harness: HARNESS,
        expect: "zero pointers is a FAILURE",
        disables:
          "the green-zero guard. Delete every pointer, or break the comment finder, and the gate " +
          "reports a pass over nothing",
        edits: [[SRC, "  if (pointers.length === 0) {", "  if (false) {"]],
      },
      {
        name: "the whole text is searched instead of the comments",
        harness: HARNESS,
        expect: "a string or template literal is NOT a pointer",
        disables:
          "the reason this uses a parser. A test that plants a bad anchor in a string literal " +
          "turns the gate red over a pointer nobody wrote",
        edits: [
          [
            SRC,
            "  visit(sf);\n  return [...found.values()];",
            "  return [{ text: source, line: 1 }];",
          ],
        ],
      },
      {
        name: "the anchor is taken from the raw heading instead of GitHub's slug",
        harness: HARNESS,
        expect: "headings become GitHub's anchors",
        disables:
          "agreement with the anchor a reader clicks: a heading with inline code or punctuation " +
          "gets an anchor GitHub never renders, and a correct pointer reads as broken",
        edits: [
          [
            SRC,
            "    out.push(slugger.slug(text));",
            '    out.push(text.toLowerCase().replaceAll(" ", "-"));',
          ],
        ],
      },
    ],
  }),
);
