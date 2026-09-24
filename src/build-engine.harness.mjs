/**
 * `build-engine.ts` — `rpp build`'s engine step: facts gathered from a cache on disk and a PATH,
 * the decision acted on. The TeX Lives here are directories with a `pdflatex` file and a fake
 * runner standing in for their `kpsewhich`; the question and the install are injected.
 *
 * Tables, in the order the mutation battery relies on:
 *   1. the pure texts: the question, the refusal line, what counts as "yes";
 *   2. prepareEngine: use the cache · use the system · refuse without a human · ask, decline,
 *      accept and install · dry-run never asks or installs.
 */
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const E = await import(join(HERE, "build-engine.ts"));

let n = 0;
const check = (label, cond, detail = "") => {
  assert.ok(cond, `${label}${detail ? ` — ${detail}` : ""}`);
  n++;
};

// ── 1. texts ────────────────────────────────────────────────────────────────────────────
const noCache = {
  supported: true,
  cache: null,
  system: null,
  interactive: true,
  required: ["acmart", "libertine"],
};
check(
  "question: no TeX Live at all — size, time, and where it goes",
  E.question(noCache, "/c") ===
    "TeX Live is not installed (needed to compile paper.tex, ~230 MB, ~2 min). Install it now into /c? [Y/n] ",
);
check(
  "question: a partial cache — only its gaps are offered",
  E.question(
    { ...noCache, cache: { label: "c", bin: "/c/b", missing: ["kastrup"] } },
    "/c",
  ) === "TeX Live in /c lacks 1 package(s): kastrup. Install them now? [Y/n] ",
);
const refused = E.refusal(
  { kind: "refuse", reason: "not-installed", missing: ["acmart", "libertine"] },
  {
    ...noCache,
    interactive: false,
    system: { label: "s", bin: "/usr/bin", missing: ["cm-super"] },
  },
);
check(
  "refusal: ONE line naming `npx rpp toolchain`, the missing packages, and why the system TeX was passed over",
  !refused.includes("\n") &&
    refused.includes("run `npx rpp toolchain`") &&
    refused.includes("missing: 2 package(s): acmart, libertine") &&
    refused.includes("/usr/bin/pdflatex lacks: cm-super"),
  refused,
);
check(
  "refusal on an unsupported platform says so",
  E.refusal(
    { kind: "refuse", reason: "unsupported", missing: ["x"] },
    noCache,
  ).includes("Windows is not supported"),
);
for (const [a, yes] of [
  ["", true],
  ["y", true],
  ["YES", true],
  [" y ", true],
  ["n", false],
  ["no", false],
  ["maybe", false],
  [null, false],
])
  check(`isYes(${JSON.stringify(a)}) is ${yes}`, E.isYes(a) === yes);

// ── 2. prepareEngine ────────────────────────────────────────────────────────────────────
const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-engine-h-")));
const TEX = {
  packages: { acmart: ["acmart.cls"], libertine: ["libertine.sty"] },
  tools: {},
};
const ALL = "/t/acmart.cls\n/t/libertine.sty\n";
/**
 * A TeX Live on disk: a bin directory with a RUNNABLE pdflatex file. The execute bit is load-bearing:
 * a pdflatex that cannot be started is not a TeX Live (`isExecutable` in engine.ts).
 */
const texAt = (dir) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pdflatex"), "");
  chmodSync(join(dir, "pdflatex"), 0o755);
  return dir;
};
const cacheBin = texAt(join(work, "cache", "2026", "bin", "x86_64-linux"));
const sysBin = texAt(join(work, "usr", "bin"));
const emptyBin = join(work, "nothing");
mkdirSync(emptyBin);

/** kpsewhich answers per tree: `found[bin]` is what it prints. */
const fakeRun = (found) => (cmd) => ({
  stdout: found[dirname(cmd)] ?? "",
  status: 0,
});
const go = async (o) => {
  const out = [];
  const err = [];
  const asked = [];
  let installs = 0;
  const r = await E.prepareEngine({
    tex: TEX,
    log: (l) => out.push(l),
    err: (l) => err.push(l),
    ask: async (q) => {
      asked.push(q);
      return o.answer ?? "";
    },
    install: () => {
      installs++;
      return o.onInstall ? o.onInstall() : { ok: false };
    },
    platform: "linux",
    ...o,
  });
  return {
    r,
    out: out.join("\n"),
    err: err.join("\n"),
    asked,
    installs: () => installs,
  };
};
const envWith = (cacheRoot, path) => ({
  RPP_TEXLIVE_DIR: cacheRoot,
  PATH: path,
});

{
  const x = await go({
    env: envWith(join(work, "cache"), sysBin),
    run: fakeRun({ [cacheBin]: ALL, [sysBin]: ALL }),
  });
  check(
    "a complete cache: used, named, and PATH starts with its bin",
    x.r.ok &&
      x.out.includes("engine: TeX Live 2026 — rpp cache") &&
      x.r.env.PATH.split(delimiter)[0] === cacheBin,
    `${x.out} ${JSON.stringify(x.r)}`,
  );
}
{
  // Two TeX Live years in the cache: a 2027 install that stopped after install-tl, and 2026.
  const years = join(work, "years");
  const old = texAt(join(years, "2026", "bin", "x86_64-linux"));
  const cut = texAt(join(years, "2027", "bin", "x86_64-linux"));
  const x = await go({
    env: envWith(years, emptyBin),
    run: fakeRun({ [old]: ALL, [cut]: "" }),
  });
  check(
    "🔴 two years, the newer incomplete: the newest COMPLETE one builds",
    x.r.ok &&
      x.out.includes("engine: TeX Live 2026 — rpp cache") &&
      x.r.env.PATH.split(delimiter)[0] === old,
    x.out,
  );
  const y = await go({
    env: envWith(years, emptyBin),
    run: fakeRun({ [old]: ALL, [cut]: ALL }),
  });
  check(
    "two years, both complete: the newer one",
    y.r.ok && y.r.env.PATH.split(delimiter)[0] === cut,
    y.out,
  );
}
{
  const x = await go({
    env: envWith(join(work, "cache"), sysBin),
    run: fakeRun({ [cacheBin]: "/t/acmart.cls\n", [sysBin]: ALL }),
  });
  check(
    "a partial cache, a complete system TeX: the system one, PATH untouched",
    x.r.ok &&
      x.out.includes(
        `engine: TeX Live on PATH (${join(sysBin, "pdflatex")})`,
      ) &&
      x.r.env.PATH === sysBin,
    x.out,
  );
}
{
  const x = await go({
    env: envWith(join(work, "none"), `${emptyBin}${delimiter}${sysBin}`),
    run: fakeRun({ [sysBin]: "/t/acmart.cls\n" }),
    interactive: false,
  });
  check(
    "🔴 no human, nothing qualifies: refused in one line, NOTHING asked, NOTHING installed",
    !x.r.ok &&
      x.r.code === 1 &&
      x.err.includes("npx rpp toolchain") &&
      x.err.includes("libertine") &&
      x.asked.length === 0 &&
      x.installs() === 0,
    x.err,
  );
}
{
  const x = await go({
    env: envWith(join(work, "none"), emptyBin),
    run: fakeRun({}),
    interactive: true,
    answer: "n",
  });
  check(
    "a terminal, declined: asked ONCE, nothing installed, refusal printed",
    !x.r.ok &&
      x.asked.length === 1 &&
      x.installs() === 0 &&
      x.err.includes("npx rpp toolchain"),
    JSON.stringify(x),
  );
}
{
  const x = await go({
    env: envWith(join(work, "none"), emptyBin),
    run: fakeRun({}),
    interactive: true,
    ask: async () => {
      throw new Error("Aborted with Ctrl+D");
    },
  });
  check(
    "a question that cannot be answered (Ctrl+D) is a no, not a crash",
    !x.r.ok && x.installs() === 0,
  );
}
// The accept path needs the fake kpsewhich to answer for a tree that appears DURING the run.
const x_run = { found: {} };
{
  const fresh = join(work, "fresh2");
  const x = await go({
    env: envWith(fresh, emptyBin),
    run: (cmd) => ({ stdout: x_run.found[dirname(cmd)] ?? "", status: 0 }),
    interactive: true,
    answer: "",
    onInstall: () => {
      const bin = texAt(join(fresh, "2026", "bin", "x86_64-linux"));
      x_run.found[bin] = ALL;
      return {
        ok: true,
        tree: { dir: dirname(dirname(bin)), year: "2026", bin },
      };
    },
  });
  check(
    "a terminal, Enter (default yes): installs once, then builds with the cache",
    x.r.ok &&
      x.installs() === 1 &&
      x.out.includes("engine: TeX Live 2026 — rpp cache") &&
      basename(x.r.env.PATH.split(delimiter)[0]) === "x86_64-linux",
    `${x.out}\n${x.err}`,
  );
}
{
  const x = await go({
    env: envWith(join(work, "none"), emptyBin),
    run: fakeRun({}),
    interactive: true,
    answer: "y",
    onInstall: () => ({ ok: false }),
  });
  check("an install that fails stops the build", !x.r.ok && x.installs() === 1);
}
{
  const x = await go({
    env: envWith(join(work, "none"), emptyBin),
    run: fakeRun({}),
    interactive: true,
    dryRun: true,
  });
  check(
    "--dry-run: prints what would stop the build, never asks, never installs",
    x.r.ok &&
      x.asked.length === 0 &&
      x.installs() === 0 &&
      x.out.includes("engine: none — a real run would stop here"),
    x.out,
  );
}

rmSync(work, { recursive: true, force: true });
console.log(`build-engine: ${n} checks passed`);
