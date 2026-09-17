/**
 * OBSERVE the `claude` CLI version instead of merely probing for the binary.
 *
 * ── THE DEFECT THIS EXISTS FOR (issue #7, measured) ─────────────────────────────
 * `plan-paper-timeline.effects.harness.mjs` is a CHARACTERIZATION test: its job is to go red
 * when the upstream CLI changes under it. It named the version it characterized — 2.1.227 —
 * in prose, and then threw away the version it actually saw:
 *
 *     spawnSync("claude", ["--version"], { stdio: "ignore" })   // ← only `status` was read
 *
 * `stdio: "ignore"` discards the output, so `claude --version` ran as a PRESENCE probe. The
 * string it printed was never read, never reported and never compared with the prose. Measured
 * on this machine: the binary is **2.1.273**, the docblock says **2.1.227** — forty-six patch
 * releases of drift, invisible to a reader of a green log.
 *
 * 🔴 WHY NOT PIN THE VERSION. A pin defeats the test: it is SUPPOSED to see upstream move. The
 * repair is not to stop the drift but to stop the SILENCE about it — observe what is already
 * spawned, carry the characterized number as a VALUE beside it, and let a reader see the two
 * diverge instead of inferring it. CI installs `@anthropic-ai/claude-code` unpinned on purpose.
 *
 * ── WHY A MODULE AND NOT THREE LINES IN THE HARNESS ─────────────────────────────
 * The three lines the issue suggests are correct and untestable where they were proposed. The
 * harness that would exercise them spawns the real CLI, so its assertions about the observation
 * depend on which version the machine happens to carry — and the one case that matters most,
 * "the probe discards its output", cannot be staged at all when the spawn is hard-wired. With
 * the spawner INJECTED, every case becomes deterministic: absent binary, drifted version,
 * matching version, and the discarding probe itself.
 */

/**
 * The version the effects harness's characterization was written against.
 *
 * 🔴 A VALUE, NOT A SENTENCE, and that is the whole point of this constant. The number lived in
 * a docblock, where nothing could compare it with anything. Here it is compared on every run.
 * Moving it means deliberately re-characterizing — which is the edit that should be conscious.
 */
export const CHARACTERIZED_CLI = "2.1.227";

/** What `claude --version` prints: `2.1.273 (Claude Code)`. */
const VERSION_IN = /\b(\d+\.\d+\.\d+)\b/;

/**
 * @typedef {object} CliObservation
 * @property {boolean} present  the binary answered `--version` with status 0
 * @property {string}  raw      the full line it printed, trimmed
 * @property {string}  version  the dotted version parsed out of it
 * @property {string}  characterized  the version the assertions were written against
 * @property {boolean} drifted  observed and characterized differ
 * @property {string}  note     one line naming BOTH numbers, for the report and for failures
 */

/**
 * @param {object} deps
 * @param {Function} deps.spawnSync  injected, so every case below is stageable
 * @param {string}  [deps.program]
 * @param {string}  [deps.characterized]
 * @returns {CliObservation}
 */
export function observeAgentCli({ spawnSync, program = "claude", characterized = CHARACTERIZED_CLI }) {
  // 🔴 `encoding: "utf8"` IS THE FIX. With `stdio: "ignore"` — the shape this replaces — the
  // child's output goes nowhere and `probe.stdout` comes back null, so everything downstream
  // would be describing a string that was never read.
  const probe = spawnSync(program, ["--version"], { encoding: "utf8" });

  if (probe.status !== 0)
    return {
      present: false,
      raw: "",
      version: "",
      characterized,
      drifted: false,
      note: `the \`${program}\` CLI is not installed, so no run can be observed`,
    };

  const raw = (probe.stdout ?? "").trim();
  const version = VERSION_IN.exec(raw)?.[1] ?? "";

  // ⚠️ EXIT 0 AND NOTHING ON STDOUT IS NOT A CLEAN OBSERVATION — it is exactly what the discarded
  // probe looked like, and reporting `characterized against ""` would be the same lie in a new
  // place. This is rule 4 of CLAUDE.md applied to the check that enforces it.
  if (version === "")
    throw new Error(
      `\`${program} --version\` exited 0 but printed no version on stdout (got ${JSON.stringify(raw)}` +
        `${probe.stderr ? `, stderr ${JSON.stringify(String(probe.stderr).trim().slice(0, 200))}` : ""}). ` +
        `A presence probe is not an observation: this is the \`stdio: "ignore"\` shape that issue #7 ` +
        `is about, and a version nobody read must not be reported as one.`,
    );

  const drifted = version !== characterized;
  return {
    present: true,
    raw,
    version,
    characterized,
    drifted,
    note: drifted
      ? `observed \`${program}\` ${version} — the assertions here were characterized against ` +
        `${characterized}. They still hold, which is itself the result: a characterization test that ` +
        `silently still holds is indistinguishable from one nobody re-checked.`
      : `observed \`${program}\` ${version} — the version these assertions were characterized against.`,
  };
}
