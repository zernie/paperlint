/**
 * Battery for the mutation engine itself — the one it didn't have.
 *
 * Both cases target ONE property, added 2026-09-15: a skipped harness is a third outcome,
 * and a battery whose harness skips must REFUSE to judge. The first removes the refusal
 * itself, the second removes the ability to recognize a skip. Different causes, one
 * observable effect, and that effect already cost a false "two mutations survived"
 * diagnosis in CI (run 34966606186).
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "./mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DRIVER = join(HERE, "mutation-driver.mjs");
const HARNESS = join(HERE, "mutation-driver.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        // Revert to how it was before 09-17: anything not killed is declared survived — and
        // "the patch never landed" becomes indistinguishable from "the test is weak". The
        // mutation is caught ONLY by the harness's third outcome; the first two pass through
        // it unchanged.
        name: "\"never landed\" collapses back into \"survived\"",
        harness: HARNESS,
        expect: "the verdict must be named unusable, not survived",
        disables:
          "the distinction between two verdicts that send the reader in opposite directions: " +
          "survived — strengthen the test, unusable — fix the mutation. Conflating them sends " +
          "the engine to rewrite a working harness",
        edits: [[DRIVER, "if (unusable.length)\n    console.log(", "if (false)\n    console.log("]],
      },
      {
        name: "the refusal for a skipping harness is removed",
        harness: HARNESS,
        expect: "a skip must REFUSE",
        disables: "the refusal itself — the driver goes back to judging by a harness that never ran",
        edits: [[DRIVER, "  if (skipped.length) {", "  if (false) {"]],
      },
      {
        name: "the skip exit code stops being recognized",
        harness: HARNESS,
        expect: "a skip must REFUSE",
        disables: "recognizing the protocol code — a skip starts reading as \"red\"",
        edits: [[DRIVER, "const VIGILES_SKIP_EXIT = 77;", "const VIGILES_SKIP_EXIT = 76;"]],
      },
    ],
  }),
);
