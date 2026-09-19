/**
 * Battery for `review/findings-cause`. Three mutations, three different asserts: the rule
 * must FIRE, must STAY SILENT when there's a cause analysis, and the threshold must come
 * in as an option.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RULE = join(HERE, "review-findings-cause.mjs");
const HARNESS = join(HERE, "review-findings-cause.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "the rule stops reporting",
        harness: HARNESS,
        expect: "one finding was expected",
        disables: "the verdict itself — a report without a cause analysis passes silently",
        edits: [[RULE, "if (hasCause || findings < minFindings) return;", "if (true) return;"]],
      },
      {
        name: 'the "Cause:" marker stops being noticed',
        harness: HARNESS,
        expect: "the rule must stay silent",
        disables: "the exemption — a report WITH a cause analysis starts going red",
        edits: [[RULE, "if (node.value.includes(causeMarker)) hasCause = true;", "void node;"]],
      },
      {
        name: '"rule from a date" stops exempting',
        harness: HARNESS,
        expect: "debt, not a finding",
        disables: "exemption of the historical corpus — the rule opens with a wall of findings",
        edits: [[RULE, "if (sinceCreated && (!created || created < sinceCreated)) return;", "if (false) return;"]],
      },
      {
        name: "the threshold stops being an option",
        harness: HARNESS,
        expect: "the threshold is data",
        disables: "passing the threshold in from outside — the mechanism claims the data for itself",
        edits: [[RULE, "context.options[0] ?? {}", "{}"]],
      },
    ],
  }),
);
