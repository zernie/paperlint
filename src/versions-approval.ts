/**
 * EXPERIMENTAL — a quick version; the docs page says what may change.
 * TODO(approved-version): `approve` freezes only the source (`approved.tex`), not a PDF; the proper
 * version freezes the built PDF too and refuses a stale build, as `submission --save` does.
 * TODO(diff-build): `diff.tex` is not built into a PDF.
 *
 * `paperlint versions approve` and `versions diff` — the text the author approved, and what the draft
 * has lost since. The approved text is a frozen version like the others: `versions/<cycle>/approved.tex`
 * (a stage in src/domain/versions.ts), recorded in `versions/lock.json`. It lives nowhere else — no tag,
 * no second record — so `diff` reads it from there.
 *
 *   approve   paper.tex (its includes spliced, as `submitted.tex` is) written as the open or accepted
 *             attempt's `approved.tex`, then the lock brought up to date; approving again replaces it
 *   diff      `latexdiff` between the newest `approved.tex` and the draft, written to
 *             `_build/diff/diff.tex`, and the sentences the approved text had that the draft lacks
 *
 * `diff.tex` is not built into a PDF: that needs the paper's whole TeX setup, and the list answers
 * "what did I take out". Removed text is read from latexdiff's `\DIFdel` markup (src/domain/
 * latexdiff-removed.ts); a changed figure or macro is not listed.
 */
import { join } from "node:path";
import { callerPath } from "./caller-path.ts";
import { venueCycleOf, type Cycles } from "./domain/cycle.ts";
import { removedSentences } from "./domain/latexdiff-removed.ts";
import { err, ok, type Result } from "./domain/result.ts";
import { frozenKey } from "./domain/versions.ts";
import { draftText, versionsDir } from "./versions.ts";
import type { VersionsCommandDeps } from "./versions-command.ts";

const DIFF_DIR = "_build/diff";
const LATEXDIFF_MISSING =
  "latexdiff is not on PATH — `npx paperlint toolchain` installs it (the TeX Live package latexdiff), or install it with your TeX distribution";

const bytes = (t: string): Uint8Array => new TextEncoder().encode(t);

/** `approve`: freeze paper.tex as the attempt's `approved.tex`, then `lock` records it. */
export function runApprove(
  paperDir: string,
  cycles: Cycles,
  deps: VersionsCommandDeps,
  lock: () => number,
): number {
  const c = venueCycleOf(cycles.current);
  if (c === null)
    return (
      deps.err(
        "no open or accepted attempt in paperlint.json: an approved version belongs to an attempt (versions/<cycle>/)",
      ),
      2
    );
  const source = draftText(paperDir, deps);
  if (source === null) return (deps.err("no paper.tex to approve"), 2);
  const key = frozenKey(c.id, "approved", "tex");
  deps.files.writeAtomic(
    callerPath(join(versionsDir(paperDir), key)),
    bytes(source),
  );
  deps.log(
    `approved      versions/${key} — \`npx paperlint versions diff\` lists what changed since`,
  );
  return lock();
}

/** The newest attempt's `approved.tex`: its key and bytes, or null when no attempt has one. */
function newestApproved(
  paperDir: string,
  cycles: Cycles,
  deps: VersionsCommandDeps,
): { readonly key: string; readonly bytes: Uint8Array } | null {
  return (
    [...cycles.list]
      .reverse()
      .flatMap((c) => {
        const key = frozenKey(c.id, "approved", "tex");
        const b = deps.files.readBytes(
          callerPath(join(versionsDir(paperDir), key)),
        );
        return b === null ? [] : [{ key, bytes: b }];
      })
      .at(0) ?? null
  );
}

/** latexdiff run in `dir` on the two files written there: its output, or the one line saying why not. */
function latexdiff(
  dir: string,
  deps: VersionsCommandDeps,
): Result<string, string> {
  const r = deps.proc.run({
    file: "latexdiff",
    args: ["approved.tex", "current.tex"],
    env: deps.processEnv,
    timeoutMs: 60_000,
    maxOutputBytes: 64 * 1024 * 1024,
    cwd: callerPath(dir),
  });
  if (r.kind === "not-found") return err(LATEXDIFF_MISSING);
  if (r.kind === "exited" && r.status === 0) return ok(r.stdout);
  return err(
    `latexdiff failed: ${r.kind === "exited" ? r.stderr.trim() || `exit ${String(r.status)}` : r.kind}`,
  );
}

/** What `diff` prints: where it compared, where it wrote, and each sentence that is gone. */
const report = (key: string, gone: readonly string[]): readonly string[] => [
  `approved      versions/${key}`,
  `wrote         ${DIFF_DIR}/diff.tex (not built)`,
  gone.length === 0
    ? "nothing of the approved text is gone"
    : `in the approved text, gone now (${String(gone.length)}):`,
  ...gone.map((s) => `  - ${s}`),
];

/** `diff`: the approved text against the draft, `diff.tex` written, and what is gone listed. */
export function runDiff(
  paperDir: string,
  cycles: Cycles,
  deps: VersionsCommandDeps,
): number {
  const approved = newestApproved(paperDir, cycles, deps);
  if (approved === null)
    return (
      deps.err(
        "no approved version: `npx paperlint versions approve` freezes the text you accept",
      ),
      2
    );
  const now = draftText(paperDir, deps);
  if (now === null) return (deps.err("no paper.tex to compare"), 2);
  const dir = join(paperDir, DIFF_DIR);
  const put = (name: string, b: Uint8Array): void => {
    deps.files.writeAtomic(callerPath(join(dir, name)), b);
  };
  put("approved.tex", approved.bytes);
  put("current.tex", bytes(now));
  const diff = latexdiff(dir, deps);
  if (!diff.ok) return (deps.err(diff.error), 2);
  put("diff.tex", bytes(diff.value));
  report(approved.key, removedSentences(diff.value)).forEach((l) => {
    deps.log(l);
  });
  return 0;
}
