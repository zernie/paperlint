#!/usr/bin/env node
/**
 * test/e2e/toolchain.mjs — `rpp toolchain` against REAL CTAN, then `rpp build` with ONLY that
 * TeX Live reachable.
 *
 * `src/toolchain.harness.mjs` drives the installer's logic against a fake mirror on disk; this is
 * the other half: the real install-tl, the real tlmgr, the real kpsewhich, and the proof that the
 * tree they produce builds an acmart paper in the venue's own fonts.
 *
 * What it asserts, in order:
 *   1. `rpp toolchain` exits 0 — an install from an empty directory, or a no-op on a warm cache
 *      (CI restores one; the run prints which it was);
 *   2. a SECOND run exits 0, says "nothing to do", and touches nothing (it finishes in seconds);
 *   3. `rpp toolchain --check` exits 0;
 *   4. `rpp build` of the acmart fixture with PATH holding node and poppler ONLY — no system TeX
 *      Live can stand in — names rpp's cache as the engine, and the PDF carries Libertine and
 *      Biolinum and not one Computer Modern face.
 *
 * It needs `RPP_TEXLIVE_DIR`: installing ~270 MB into a developer's home as a side effect of
 * `npm run check` would be exactly the unasked install rule 11 forbids. Without it the run is a
 * declared skip (77); under --strict (CI) a failure.
 *
 *   RPP_TEXLIVE_DIR=/some/dir node test/e2e/toolchain.mjs [--strict]
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFonts } from "../../skills/render-paper/extract-pdf-facts.mjs";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const CLI = join(ROOT, "bin", "rpp.mjs");
const strict = process.argv.includes("--strict");
const dir = process.env.RPP_TEXLIVE_DIR;

const which = (b) => {
  const r = spawnSync("command", ["-v", b], { shell: true, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
};
const need = ["pdffonts", "pdftotext", "pdfinfo"];
const absent = [
  ...(dir ? [] : ["RPP_TEXLIVE_DIR"]),
  ...need.filter((b) => !which(b)),
];
if (absent.length) {
  const say = `toolchain-e2e: skipped — not set or not installed: ${absent.join(", ")}.`;
  if (!strict) {
    console.log(
      `${say}\nIt installs real TeX Live (~270 MB) and only into a directory you name.`,
    );
    process.exit(77);
  }
  console.error(`${say}\nIn --strict this is a FAILURE: CI must run it.`);
  process.exit(2);
}

let bad = 0;
const check = (label, cond, detail = "") => {
  console.log(
    `  ${cond ? "✓" : "✗"} ${label}${detail && !cond ? ` — ${detail}` : ""}`,
  );
  if (!cond) bad++;
};
const rpp = (args, opts = {}) => {
  const started = Date.now();
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    ...opts,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  console.log(
    out
      .trim()
      .split("\n")
      .map((l) => `  │ ${l}`)
      .join("\n"),
  );
  return { status: r.status, out, ms: Date.now() - started };
};

console.log("rpp toolchain");
const first = rpp(["toolchain"], { timeout: 20 * 60 * 1000 });
check("exit 0", first.status === 0, first.out);
console.log(
  `  (this run ${first.out.includes("nothing to do") ? "found a warm cache — a no-op" : "INSTALLED from an empty directory"}, ${Math.round(first.ms / 1000)} s)`,
);

console.log("\nrpp toolchain, again");
const second = rpp(["toolchain"]);
check(
  "exit 0 and 'nothing to do'",
  second.status === 0 && second.out.includes("nothing to do"),
  second.out,
);
check(
  "and it took seconds, not minutes",
  second.ms < 30_000,
  `${second.ms} ms`,
);

console.log("\nrpp toolchain --check");
const checked = rpp(["toolchain", "--check"]);
check(
  "exit 0, every declared package present",
  checked.status === 0,
  checked.out,
);

console.log("\nrpp build with ONLY rpp's TeX Live reachable");
const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-toolchain-e2e-")));
try {
  const bin = join(work, "bin");
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, "node"));
  for (const b of need) symlinkSync(which(b), join(bin, b));
  cpSync(
    join(ROOT, "fixtures", "build-e2e", "acmart"),
    join(work, "papers", "acmart"),
    {
      recursive: true,
    },
  );
  writeFileSync(
    join(work, "rpp.json"),
    JSON.stringify({ papersDir: "papers" }),
  );
  const built = rpp(["build", join("papers", "acmart")], {
    cwd: work,
    env: { HOME: work, PATH: bin, CI: "1", RPP_TEXLIVE_DIR: dir },
  });
  check("exit 0", built.status === 0, built.out);
  check(
    "the engine is rpp's cache — nothing else was on PATH",
    built.out.includes("engine: TeX Live") && built.out.includes("rpp cache"),
    built.out,
  );
  const pdf = join(work, "papers", "acmart", "paper.pdf");
  check("the PDF exists", existsSync(pdf));
  if (existsSync(pdf)) {
    const f = readFonts(
      execFileSync("pdffonts", [pdf], { encoding: "utf8" }),
    ).map((x) => x.name);
    check(
      "🔴 typeset in Libertine/Biolinum, and not one Computer Modern face",
      f.length > 0 &&
        f.every((n) => /^(LinLibertine|LinBiolinum)/.test(n)) &&
        !f.some((n) => /^(CMR|CMBX|CMTI|CMTT|CMSS|LMRoman)/.test(n)),
      f.join(", "),
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(
  bad === 0
    ? "\n✅ toolchain e2e: everything matched"
    : `\n🔴 toolchain e2e: ${bad} mismatch(es)`,
);
process.exit(bad === 0 ? 0 : 1);
