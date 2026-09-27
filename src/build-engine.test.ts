/**
 * build-engine.ts arms the harness does not reach: a system pdflatex that lacks packages (said
 * before asking), an install that fails, an install that leaves packages missing, a cache used from
 * an environment with no PATH, and the refusal line for a decision that is neither refuse nor ask.
 */
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "vitest";
import { useTempDir } from "../test/support.mjs";
import { prepareEngine, refusal } from "./build-engine.ts";

const work = useTempDir("paperlint-build-engine-test-");
const TEX = { packages: { acmart: ["acmart.cls"] }, tools: {} };
/** A runnable pdflatex in `dir`. */
const texAt = (dir: string): string => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pdflatex"), "");
  chmodSync(join(dir, "pdflatex"), 0o755);
  return dir;
};
/** kpsewhich answers per bin directory. */
const fakeRun = (found: Record<string, string>) =>
  ((cmd: string) => ({
    stdout: found[dirname(cmd)] ?? "",
    status: 0,
  })) as never;

async function go(o: Parameters<typeof prepareEngine>[0]) {
  const out: string[] = [];
  const err: string[] = [];
  const r = await prepareEngine({
    log: (l) => out.push(l),
    err: (l) => err.push(l),
    platform: "linux",
    interactive: true,
    ask: async () => "y",
    ...o,
  });
  return { r, out, err };
}

test("a system pdflatex lacking packages is named before asking; a failed install stops the run", async () => {
  const sys = texAt(join(work, "sys", "bin"));
  const x = await go({
    tex: TEX,
    env: { PAPERLINT_TEXLIVE_DIR: join(work, "empty-cache"), PATH: sys },
    run: fakeRun({}),
    install: () => ({ ok: false }),
  });
  assert.deepEqual(
    [x.r, x.out],
    [
      { ok: false, code: 1 },
      [`${join(sys, "pdflatex")} is not used: it lacks acmart`],
    ],
  );
});

test("an install that verifies but still lacks a package is refused, naming it", async () => {
  const cache = join(work, "cache-lacking");
  const x = await go({
    tex: TEX,
    env: { PAPERLINT_TEXLIVE_DIR: cache, PATH: join(work, "nothing") },
    run: fakeRun({}),
    install: () => {
      texAt(join(cache, "2026", "bin", "x86_64-linux"));
      return { ok: true, tree: { dir: "", year: "2026", bin: "" } };
    },
  });
  assert.deepEqual(x.r, { ok: false, code: 1 });
  assert.match(x.err.join("\n"), /missing: 1 package\(s\): acmart/);
});

test("an install that leaves no tree at all is refused with nothing named missing", async () => {
  const x = await go({
    tex: TEX,
    env: {
      PAPERLINT_TEXLIVE_DIR: join(work, "cache-none"),
      PATH: join(work, "nothing"),
    },
    run: fakeRun({}),
    install: () => ({ ok: true, tree: { dir: "", year: "2026", bin: "" } }),
  });
  assert.deepEqual(x.r, { ok: false, code: 1 });
  assert.match(x.err.join("\n"), /missing: 0 package\(s\): \)/);
});

test("a complete cache is used from an environment with no PATH at all", async () => {
  const bin = texAt(join(work, "cache-ok", "2026", "bin", "x86_64-linux"));
  const x = await go({
    tex: TEX,
    env: { PAPERLINT_TEXLIVE_DIR: join(work, "cache-ok") },
    run: fakeRun({ [bin]: "/t/acmart.cls\n" }),
  });
  assert.deepEqual(x.r, {
    ok: true,
    env: { PAPERLINT_TEXLIVE_DIR: join(work, "cache-ok"), PATH: `${bin}:` },
  });
});

test("the refusal line for a decision to use a tree names nothing missing", () => {
  assert.equal(
    refusal({ kind: "use-cache" } as never, { system: null } as never),
    "✗ paperlint build: no TeX Live with every package these papers need — run `npx paperlint toolchain` (missing: 0 package(s): )",
  );
});

test("without an ask or an install given: Enter is yes, and the default install runs (here: every mirror fails)", async () => {
  const cache = join(work, "cache-default");
  const calls: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const r = await prepareEngine({
    tex: TEX,
    log: (l) => out.push(l),
    err: (l) => err.push(l),
    platform: "linux",
    interactive: true,
    env: {
      PAPERLINT_TEXLIVE_DIR: cache,
      PAPERLINT_CTAN_MIRROR: "https://mirror.invalid/tlnet",
      PATH: join(work, "nothing"),
    },
    run: ((cmd: string) => {
      calls.push(cmd.split("/").pop() ?? cmd);
      return {
        status: 22,
        stdout: "",
        stderr: "curl: (6) could not resolve\n",
      };
    }) as never,
  });
  assert.deepEqual(r, { ok: false, code: 1 });
  assert.ok(calls.includes("curl"), calls.join(","));
  assert.match(err.join("\n"), /no CTAN mirror returned install-tl/);
});
