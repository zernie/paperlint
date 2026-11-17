/**
 * The `LatexDiff` port over the `latexdiff` program: everything that knows it exists. Its name and
 * arguments, its absence and failure as one line each, and its output's markup: it wraps each stretch
 * it deleted in `\DIFdel{…}`, and in a float `\DIFdelFL{…}`. Those groups are read through the LaTeX
 * reader port (`macroTexts`), never by importing that adapter.
 *
 * `latexdiff` ships with TeX Live, so no npm package is involved (nothing in `TOOL_PACKAGES`).
 */
import { delimiter, join } from "node:path";
import { absolutePath, type AbsolutePath } from "../../domain/paths.ts";
import { err, ok, type Result } from "../../domain/result.ts";
import type { Files } from "../../ports/files.ts";
import type { LatexReader } from "../../ports/latex.ts";
import type { LatexDiff } from "../../ports/latexdiff.ts";
import type { RunProcess } from "../../ports/process.ts";

const MISSING =
  "latexdiff is not on PATH — `npx paperlint toolchain` installs it (the TeX Live package latexdiff), or install it with your TeX distribution";

/** `env` with the managed TeX Live tree's `bin` first on PATH; unchanged without a tree. */
export const withTexBin = (
  env: Readonly<Record<string, string>>,
  tree: { readonly bin: string } | null,
): Readonly<Record<string, string>> =>
  tree === null
    ? env
    : { ...env, PATH: [tree.bin, env["PATH"] ?? ""].join(delimiter) };

const bytes = (t: string): Uint8Array => new TextEncoder().encode(t);

/** What the adapter works with: the program's runner and environment, the disk, and the LaTeX reader. */
export interface LatexDiffDeps {
  readonly proc: RunProcess;
  readonly env: Readonly<Record<string, string>>;
  readonly files: Files;
  readonly latex: Pick<LatexReader, "macroTexts">;
}

/** `latexdiff approved.tex current.tex` run in `dir`: its output, or the one line saying why not. */
function run(dir: AbsolutePath, d: LatexDiffDeps): Result<string, string> {
  const r = d.proc.run({
    file: "latexdiff",
    args: ["approved.tex", "current.tex"],
    env: d.env,
    timeoutMs: 60_000,
    maxOutputBytes: 64 * 1024 * 1024,
    cwd: dir,
  });
  if (r.kind === "not-found") return err(MISSING);
  if (r.kind === "exited" && r.status === 0) return ok(r.stdout);
  return err(
    `latexdiff failed: ${r.kind === "exited" ? r.stderr.trim() || `exit ${String(r.status)}` : r.kind}`,
  );
}

export const latexDiff = (d: LatexDiffDeps): LatexDiff => ({
  removedSince(approved, current, dir) {
    const put = (name: string, text: string): void => {
      d.files.writeAtomic(absolutePath(join(dir, name)), bytes(text));
    };
    put("approved.tex", approved);
    put("current.tex", current);
    const out = run(dir, d);
    if (!out.ok) return out;
    put("diff.tex", out.value);
    return ok({
      diffTex: out.value,
      removed: d.latex.macroTexts(out.value, ["DIFdel", "DIFdelFL"]),
    });
  },
});
