/**
 * Battery for `doc/fields`: six mutations, each removes its own load-bearing property.
 *
 * The last two are about wounds the predecessor would not have shown at all:
 * normalizing js-yaml's `Date` (otherwise the date gate silently stops working) and
 * failing closed on a missing header (otherwise the check is bypassed by deleting it).
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RULE = join(HERE, "doc-fields.mjs");
const HARNESS = join(HERE, "doc-fields.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "a missing field stops being a finding",
        harness: HARNESS,
        expect: 'case 2: the finding must name "no field"',
        disables: "the verdict itself — a card with no field declared passes silently",
        edits: [[RULE, 'if (!(name in data) || data[name] === null || data[name] === "") {', "if (false) {"]],
      },
      {
        name: "the value stops being checked against the vocabulary",
        harness: HARNESS,
        expect: "case 3: a value outside the vocabulary must produce one finding",
        disables: "the value check — `read: fully` becomes allowed",
        edits: [[RULE, "if (!values.includes(actual))", "if (false)"]],
      },
      {
        name: "'rule from a date' stops exempting",
        harness: HARNESS,
        expect: "known debt, not a finding",
        disables: "the exemption of the historical corpus — 22 old cards go red at once",
        edits: [
          [RULE, "if (sinceCreated && (!created || created < sinceCreated)) return;", "if (false) return;"],
        ],
      },
      {
        name: "🔴 a missing frontmatter exempts again",
        harness: HARNESS,
        expect: "case 7: a document with no frontmatter must produce a finding",
        disables: "fail-closed — the gate is bypassed again by deleting the header, like the predecessor",
        edits: [[RULE, "if (seenFrontmatter) return;", "if (true) return;"]],
      },
      {
        name: "🔴 js-yaml's `Date` stops being normalized to a string",
        harness: HARNESS,
        expect: "case 8: an unquoted NEW date must TURN ON the check",
        disables:
          "normalizing the YAML 1.1 timestamp — comparing a Date to a string SILENTLY gives false, and the date gate dies unnoticed",
        edits: [[RULE, "if (v instanceof Date) return v.toISOString().slice(0, 10);", ""]],
      },
      {
        name: "broken YAML stops having its own verdict",
        harness: HARNESS,
        expect: "a broken header must have ITS OWN verdict",
        disables: "the separation of causes — an unparseable header becomes indistinguishable from silence",
        edits: [[RULE, 'messageId: "malformed",\n                data: { why: e.reason', 'messageId: "missing",\n                data: { why: e.reason']],
      },
    ],
  }),
);
