/**
 * `paperlint toolchain` against REAL CTAN, then `paperlint build` with ONLY that
 * TeX Live reachable.
 *
 * `src/toolchain.harness.mjs` drives the installer's logic against a fake mirror on disk; this is
 * the other half: the real install-tl, the real tlmgr, the real kpsewhich, and the proof that the
 * tree they produce builds an acmart paper in the venue's own fonts.
 *
 * What it asserts, in order:
 *   1. `paperlint toolchain` exits 0 — an install from an empty directory, or a no-op on a warm cache
 *      (CI restores one; the run prints which it was);
 *   2. a SECOND run exits 0, says "nothing to do", and touches nothing (it finishes in seconds);
 *   3. `paperlint toolchain --check` exits 0;
 *   4. `paperlint build` of the acmart fixture with PATH holding node ONLY — no system TeX Live can
 *      stand in, and no PDF tool either — names paperlint's cache as the engine, and the PDF carries
 *      Libertine and Biolinum and not one Computer Modern face (read with paperlint's own pdf.js reader).
 *
 * It needs `PAPERLINT_TEXLIVE_DIR`: installing ~270 MB into a developer's home as a side effect of
 * `npm run check` would be exactly the unasked install rule 11 forbids. Without it the tests are
 * skipped; under CI that is a failure (`../need.ts`).
 *
 *   PAPERLINT_TEXLIVE_DIR=/some/dir npm run test:e2e:tex
 */
import { printed } from "../../../src/domain/text.ts";
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { check, missing } from "../need.ts";
import { parseBanalSettings } from "../../../dist/adapters/banal/index.js";
import { hostDirs } from "../../../dist/adapters/node/index.js";
import { fontNames, readBuilt } from "../read-pdf.ts";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const CLI = join(ROOT, "bin", "paperlint.mjs");
const dir = process.env.PAPERLINT_TEXLIVE_DIR ?? "";

/** The one field of the facts file this run reads. */
const FactsFile = z.object({ geometry_source: z.unknown().optional() });

const paperlint = (
  args: readonly string[],
  opts: Omit<SpawnSyncOptions, "encoding"> = {},
): { status: number | null; out: string; ms: number } => {
  const started = Date.now();
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    ...opts,
  });
  const out = printed(r.stdout) + printed(r.stderr);
  console.log(
    out
      .trim()
      .split("\n")
      .map((l) => `  │ ${l}`)
      .join("\n"),
  );
  return { status: r.status, out, ms: Date.now() - started };
};

/**
 * A consumer holding the acmart fixture, and the environment that reaches ONLY paperlint's TeX
 * Live: PATH holds node and perl (the build's measure step runs banal — perl is not TeX, so "only
 * paperlint's TeX Live was reachable" still means what it says).
 */
function cacheOnlyConsumer(): { work: string; env: NodeJS.ProcessEnv } {
  const work = realpathSync(
    mkdtempSync(join(tmpdir(), "paperlint-toolchain-e2e-")),
  );
  const bin = join(work, "bin");
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, "node"));
  const perl = spawnSync("perl", ["-e", "print $^X"], {
    encoding: "utf8",
  }).stdout;
  symlinkSync(perl, join(bin, "perl"));
  cpSync(
    join(ROOT, "fixtures", "build-e2e", "acmart"),
    join(work, "papers", "acmart"),
    { recursive: true },
  );
  writeFileSync(
    join(work, "package.json"),
    JSON.stringify({ name: "consumer", private: true }),
  );
  // 🔴 banal is where `paperlint toolchain` installed it — HOME is a temp dir here, so without
  // $PAPERLINT_BANAL_DIR the build looked in the wrong cache and wrote the facts with no geometry.
  const banalDir = parseBanalSettings(process.env, hostDirs()).cacheDir;
  const env = {
    HOME: work,
    PATH: bin,
    CI: "1",
    PAPERLINT_TEXLIVE_DIR: dir,
    PAPERLINT_BANAL_DIR: banalDir,
  };
  return { work, env };
}

/** What the build left: its facts file's geometry source, and the PDF's font names. */
async function builtAcmart(work: string): Promise<{
  geometrySource: unknown;
  fonts: string[] | null;
}> {
  const facts = join(work, "papers", "acmart", "_build", "paper.facts.json");
  const pdf = join(work, "papers", "acmart", "paper.pdf");
  return {
    geometrySource: existsSync(facts)
      ? FactsFile.parse(JSON.parse(readFileSync(facts, "utf8"))).geometry_source
      : "(no facts file)",
    fonts: existsSync(pdf) ? fontNames(await readBuilt(pdf)) : null,
  };
}

const skip = missing(
  "PAPERLINT_TEXLIVE_DIR",
  dir !== "",
  "the directory `paperlint toolchain` installs real TeX Live (~270 MB) into, and only one you name",
);

describe.skipIf(skip)("paperlint toolchain, against real CTAN", () => {
  it("1. paperlint toolchain exits 0", () => {
    const first = paperlint(["toolchain"], { timeout: 20 * 60 * 1000 });
    expect(first.status, first.out).toBe(0);
    console.log(
      `  (this run ${first.out.includes("nothing to do") ? "found a warm cache — a no-op" : "INSTALLED from an empty directory"}, ${String(Math.round(first.ms / 1000))} s)`,
    );
  });

  it("2. again: exit 0, 'nothing to do', and it took seconds, not minutes", () => {
    const second = paperlint(["toolchain"]);
    expect(second.status, second.out).toBe(0);
    expect(second.out).toContain("nothing to do");
    expect(second.ms).toBeLessThan(30_000);
  });

  it("3. paperlint toolchain --check: exit 0, every declared package present", () => {
    const checked = paperlint(["toolchain", "--check"]);
    expect(checked.status, checked.out).toBe(0);
  });

  it("4. paperlint build with ONLY paperlint's TeX Live reachable: the cache is the engine, banal measured, the venue's fonts", async () => {
    const { work, env } = cacheOnlyConsumer();
    try {
      const built = paperlint(["build", join("papers", "acmart")], {
        cwd: work,
        env,
      });
      check("exit 0", built.status === 0, built.out);
      check(
        "the engine is paperlint's cache — nothing else was on PATH",
        built.out.includes("engine: TeX Live") &&
          built.out.includes("paperlint cache"),
        built.out,
      );
      const { geometrySource, fonts } = await builtAcmart(work);
      check(
        "the facts file's page geometry was measured by banal",
        geometrySource === "banal",
        `geometry_source: ${String(geometrySource)}`,
      );
      check("the PDF exists", fonts !== null);
      check(
        "🔴 typeset in Libertine/Biolinum, and not one Computer Modern face",
        fonts !== null &&
          fonts.length > 0 &&
          fonts.every((n) => /^(LinLibertine|LinBiolinum)/.test(n)) &&
          !fonts.some((n) => /^(CMR|CMBX|CMTI|CMTT|CMSS|LMRoman)/.test(n)),
        (fonts ?? []).join(", "),
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
