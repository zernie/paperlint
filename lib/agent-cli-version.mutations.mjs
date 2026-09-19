/**
 * Battery for `observeAgentCli`. Five mutations, five different assertions.
 *
 * 🔴 The first one is the issue #7 defect itself, restored verbatim: bring back
 * `stdio: "ignore"`. It is the whole point of this battery. Before the observation was pulled
 * out into its own module, there was NOWHERE to place this mutation: the spawn was baked into
 * the harness, which brings up the real CLI, and "ask the binary to print nothing" is not
 * something you can do. A green battery against a baked-in spawn would have been a finding
 * about the test, not about the defense.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "./mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MOD = join(HERE, "agent-cli-version.mjs");
const HARNESS = join(HERE, "agent-cli-version.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "🔴 revert to `stdio: \"ignore\"` — the issue #7 defect verbatim",
        harness: HARNESS,
        // ⚠️ The assertion this trips is NOT the one I was aiming for, and this was corrected
        // BY RUNNING IT, not from memory. The double hands back stdout regardless of the
        // options, so the observation succeeds, and the first thing to go red is the
        // `encoding` assertion. The `stdio` assertion itself is hit by the next case.
        expect: "without an encoding the output is a Buffer nobody reads",
        disables: "the observation itself — the version is printed into the void again, and the tier characterizes nothing",
        edits: [[MOD, 'spawnSync(program, ["--version"], { encoding: "utf8" })', 'spawnSync(program, ["--version"], { stdio: "ignore" })']],
      },
      {
        name: "`stdio: \"ignore\"` added ALONGSIDE encoding — output still goes nowhere",
        harness: HARNESS,
        expect: "is the discarded-output defect itself",
        disables: "the second call-shape assertion: `encoding` is present, but the stream is still killed",
        edits: [[MOD, 'spawnSync(program, ["--version"], { encoding: "utf8" })', 'spawnSync(program, ["--version"], { encoding: "utf8", stdio: "ignore" })']],
      },
      {
        name: "empty stdout at exit code 0 stops being a failure",
        harness: HARNESS,
        expect: "must fail loudly, not be reported as a version",
        disables: "rule 4 — `exit 0` with empty output reads as a clean measurement again",
        edits: [[MOD, 'if (version === "")', "if (false)"]],
      },
      {
        name: "drift is computed as a constant, not a comparison",
        harness: HARNESS,
        expect: "must be computed, not eyeballed",
        disables: "the comparison of observed against characterized — the divergence becomes invisible again",
        edits: [[MOD, "const drifted = version !== characterized;", "const drifted = false;"]],
      },
      {
        name: "only one of the two numbers survives into the message",
        harness: HARNESS,
        expect: "must name BOTH numbers",
        disables: "showing the divergence — the reader is back to having to remember the second number",
        edits: [[MOD, "`observed \\`${program}\\` ${version} — the assertions here were characterized against ` +\n        `${characterized}.", "`observed \\`${program}\\` ${version} — characterized elsewhere."]],
      },
      {
        name: "the version is not parsed out of the string, taken whole instead",
        harness: HARNESS,
        expect: "must be PARSED out of the line, not left raw",
        disables: "parsing the version string — `2.1.273 (Claude Code)` stops being comparable to `2.1.227`",
        edits: [[MOD, "const version = VERSION_IN.exec(raw)?.[1] ?? \"\";", "const version = raw;"]],
      },
    ],
  }),
);
