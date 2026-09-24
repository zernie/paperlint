/**
 * `toolchain.ts` — the TeX Live installer, driven against a FAKE CTAN MIRROR ON DISK.
 *
 * 🔴 NOT ONE BYTE OF TeX LIVE IS DOWNLOADED HERE. The mirror is a directory served by `file://`
 * URLs: the real `curl` fetches from it, the real `tar` lists and unpacks it, and the installer
 * inside is `fixtures/toolchain-mirror/install-tl`, which lays out a tree whose `kpsewhich` and
 * `tlmgr` answer from two text files. So what runs is rpp's own download, fallback, unpack,
 * install and verify logic — the part that decides success — and what is faked is only TeX.
 * The real TeX Live half is `test/e2e/toolchain.mjs`.
 *
 * Tables, in the order the mutation battery relies on:
 *   1. the pure pieces (year, profile, tlmgr's unknown names, cache location);
 *   2. the download: mirror fallback, archive check, the time limit;
 *   3. the command: fresh install, second run is a no-op, --check, partial add, and the three
 *      ways an install must FAIL naming the package.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "..", "fixtures", "toolchain-mirror");
const T = await import(join(HERE, "toolchain.ts"));

let n = 0;
const check = (label, cond, detail = "") => {
  assert.ok(cond, `${label}${detail ? ` — ${detail}` : ""}`);
  n++;
};

// ── 1. pure pieces ──────────────────────────────────────────────────────────────────────
check(
  "tlYear: the year from release-texlive.txt's first line",
  T.tlYear("TeX Live (https://tug.org/texlive) version 2026\n\nmore") ===
    "2026",
);
check(
  "tlYear: a year on a LATER line is not the release",
  T.tlYear("something else\nversion 2026") === null,
);
const profile = T.tlProfile("/c/2026");
check(
  "tlProfile: scheme-basic, TEXDIR and every tree variable inside it, no docs, no sources",
  profile.includes("selected_scheme scheme-basic\n") &&
    profile.includes("TEXDIR /c/2026\n") &&
    profile.includes("TEXMFHOME /c/2026/texmf-home\n") &&
    profile.includes("tlpdbopt_install_docfiles 0\n") &&
    profile.includes("tlpdbopt_install_srcfiles 0\n"),
  profile,
);
check(
  "unknownPackages: tlmgr's own wording names the package",
  JSON.stringify(
    T.unknownPackages(
      "tlmgr install: package urw-base35 not present in repository.\npackage already present: acmart\n",
    ),
  ) === '["urw-base35"]',
);
check(
  "cacheRoot: RPP_TEXLIVE_DIR wins",
  T.cacheRoot({ RPP_TEXLIVE_DIR: "/ci/tl", XDG_CACHE_HOME: "/x" }, "/h") ===
    "/ci/tl",
);
check(
  "cacheRoot: then XDG_CACHE_HOME",
  T.cacheRoot({ XDG_CACHE_HOME: "/x" }, "/h") === "/x/rpp/texlive",
);
check(
  "cacheRoot: then ~/.cache",
  T.cacheRoot({}, "/h") === "/h/.cache/rpp/texlive",
);
check(
  "mirrorsFrom: RPP_CTAN_MIRROR is the ONLY mirror, trailing slash dropped",
  JSON.stringify(T.mirrorsFrom({ RPP_CTAN_MIRROR: "https://m/tlnet/" })) ===
    '["https://m/tlnet"]',
);
check(
  "mirrorsFrom: several defaults, every one https",
  T.mirrorsFrom({}).length > 1 &&
    T.mirrorsFrom({}).every((m) => m.startsWith("https://")),
);
check("formatDuration", T.formatDuration(118_400) === "1m58s");

// ── the fake mirror ────────────────────────────────────────────────────────────────────
const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-toolchain-h-")));
const good = join(work, "good");
const garbage = join(work, "garbage");
const staging = join(work, "staging", "install-tl-20260924");
mkdirSync(staging, { recursive: true });
mkdirSync(good);
mkdirSync(garbage);
for (const f of [
  "install-tl",
  "stub-pdflatex",
  "stub-kpsewhich",
  "stub-tlmgr",
  "release-texlive.txt",
])
  copyFileSync(join(FIXTURE, f), join(staging, f));
spawnSync("chmod", [
  "+x",
  ...["install-tl", "stub-pdflatex", "stub-kpsewhich", "stub-tlmgr"].map((f) =>
    join(staging, f),
  ),
]);
spawnSync(
  "tar",
  [
    "czf",
    join(good, "install-tl-unx.tar.gz"),
    "-C",
    dirname(staging),
    "install-tl-20260924",
  ],
  { stdio: "inherit" },
);
copyFileSync(join(FIXTURE, "catalog.txt"), join(good, "catalog.txt"));
writeFileSync(
  join(garbage, "install-tl-unx.tar.gz"),
  "<html>503 Service Unavailable</html>",
);
const url = (dir) => pathToFileURL(dir).href;
const MISSING = url(join(work, "no-such-mirror"));

/** A `spawnSync` that records every program it was asked to run. */
const recorder = () => {
  const calls = [];
  const run = (cmd, args, opts) => {
    calls.push({ cmd, args });
    return spawnSync(cmd, args, opts);
  };
  return { run, calls };
};

// ── 2. the download ─────────────────────────────────────────────────────────────────────
{
  const lines = [];
  const { run, calls } = recorder();
  const dest = join(work, "dl.tar.gz");
  const got = T.downloadInstaller(
    { run, log: (l) => lines.push(l), env: process.env },
    [MISSING, url(garbage), url(good)],
    dest,
  );
  check(
    "download: falls through a missing mirror and a non-archive to the good one",
    got === url(good),
    `${got}\n${lines.join("\n")}`,
  );
  check(
    "download: both failures are SAID, one line each",
    lines.length === 2 &&
      lines[0].includes("no-such-mirror") &&
      lines[1].includes("not a .tar.gz"),
    lines.join("\n"),
  );
  const curls = calls.filter((c) => c.cmd === "curl");
  check(
    "download: every curl carries its own time limit",
    curls.length === 3 &&
      curls.every(
        (c) =>
          c.args[c.args.indexOf("--max-time") + 1] ===
          String(T.DOWNLOAD_SECONDS),
      ),
  );
  check(
    "🔴 download: TLS is never switched off",
    curls.every((c) => !c.args.some((a) => a === "-k" || a === "--insecure")),
  );
  check(
    "download: -f — an HTTP error page is a failure, not a file",
    curls.every((c) => c.args[0].includes("f")),
  );
}
{
  const lines = [];
  const got = T.downloadInstaller(
    { run: spawnSync, log: (l) => lines.push(l), env: process.env },
    [MISSING, url(garbage)],
    join(work, "dl2.tar.gz"),
  );
  check("download: no good mirror → null, not a half file", got === null);
}

// ── 3. the command ─────────────────────────────────────────────────────────────────────
const TEX = {
  packages: {
    latex: ["latex.ltx", "article.cls"],
    acmart: ["acmart.cls"],
  },
  tools: { texcount: ["texcount"] },
};
const root = join(work, "cache");
const env = {
  ...process.env,
  RPP_TEXLIVE_DIR: root,
  RPP_CTAN_MIRROR: url(good),
};
const cmd = (over = {}) => {
  const out = [];
  const err = [];
  const rec = recorder();
  const code = T.runToolchain({
    log: (l) => out.push(l),
    err: (l) => err.push(l),
    env,
    run: rec.run,
    platform: "linux",
    tex: TEX,
    now: (() => {
      let t = 0;
      return () => (t += 1000);
    })(),
    ...over,
  });
  return { code, out: out.join("\n"), err: err.join("\n"), calls: rec.calls };
};

{
  const r = cmd({ check: true });
  check(
    "--check on an empty cache: exit 1, says nothing is installed and what the command installs",
    r.code === 1 &&
      r.out.includes("no TeX Live in") &&
      r.out.includes("`npx rpp toolchain` installs 3 packages"),
    r.out,
  );
  check("--check changes nothing", !existsSync(join(root, "2026")));
}
{
  const r = cmd();
  check("fresh install: exit 0", r.code === 0, `${r.out}\n${r.err}`);
  check(
    "fresh install: the tree is <cache>/<TeX Live year>",
    existsSync(join(root, "2026", "bin", "x86_64-linux", "pdflatex")),
  );
  check(
    "fresh install: the success line counts what was VERIFIED",
    r.out.includes("✓ TeX Live 2026 is ready in") &&
      r.out.includes(
        "3 packages verified (3 files found by kpsewhich, 1 tools)",
      ),
    r.out,
  );
  const tlmgr = readFileSync(join(root, "2026", "tlmgr.log"), "utf8");
  check(
    "fresh install: tlmgr was asked for every declared package, from the mirror that served install-tl",
    tlmgr.trim() === `${url(good)} acmart latex texcount`,
    tlmgr,
  );
}
{
  const r = cmd();
  check(
    "second run: exit 0 and says there is nothing to do",
    r.code === 0 &&
      r.out.includes("already has all 3 declared packages — nothing to do"),
    r.out,
  );
  check(
    "second run: downloads nothing and installs nothing",
    !r.calls.some((c) => c.cmd === "curl" || c.cmd.endsWith("tlmgr")),
    JSON.stringify(r.calls.map((c) => c.cmd)),
  );
}
{
  const r = cmd({ check: true });
  check(
    "--check on a complete tree: exit 0",
    r.code === 0 && r.out.includes("has all 3 declared packages"),
    r.out,
  );
}
{
  // A package declared LATER: the tree exists, so only tlmgr runs, for that package alone.
  const tex = {
    ...TEX,
    packages: { ...TEX.packages, libertine: ["libertine.sty"] },
  };
  const before = cmd({ check: true, tex });
  check(
    "--check names the missing package WITH its proof file",
    before.code === 1 &&
      before.out.includes(
        "lacks 1 of 4 declared packages: libertine (libertine.sty)",
      ),
    before.out,
  );
  const r = cmd({ tex });
  check("partial: exit 0", r.code === 0, `${r.out}\n${r.err}`);
  check(
    "partial: no download, one tlmgr call for the one missing package",
    !r.calls.some((c) => c.cmd === "curl") &&
      readFileSync(join(root, "2026", "tlmgr.log"), "utf8")
        .trim()
        .split("\n")
        .at(-1) === `${url(good)} libertine`,
  );
}
{
  const r = cmd({
    tex: { ...TEX, packages: { ...TEX.packages, bogus: ["bogus.sty"] } },
  });
  check(
    "🔴 an unknown package name fails and is NAMED",
    r.code === 1 && r.err.includes("tlmgr does not know: bogus"),
    r.err,
  );
}
{
  const r = cmd({
    tex: { ...TEX, packages: { ...TEX.packages, liar: ["liar.sty"] } },
  });
  check(
    "🔴 tlmgr 'installs' it but the proof file is absent: FAIL, package and file named",
    r.code === 1 && r.err.includes("still lacks, after tlmgr: liar (liar.sty)"),
    r.err,
  );
}
{
  // A tool whose program never appears in the bin directory.
  appendFileSync(join(good, "catalog.txt"), "checkcites checkcites.lua\n");
  const r = cmd({
    tex: { ...TEX, tools: { ...TEX.tools, checkcites: ["checkcites"] } },
  });
  check(
    "🔴 a declared tool with no executable fails, named",
    r.code === 1 && r.err.includes("checkcites (checkcites)"),
    r.err,
  );
}
{
  const r = cmd({ platform: "win32" });
  check(
    "Windows: a clear refusal, nothing touched",
    r.code === 1 && r.err.includes("Windows is not supported"),
    r.err,
  );
}
{
  const fresh = join(work, "cache-fail");
  const r = cmd({
    env: {
      ...env,
      RPP_TEXLIVE_DIR: fresh,
      FAKE_INSTALL_TL_FAIL: "1",
    },
  });
  check(
    "install-tl failing: exit 1 and its own last lines are shown",
    r.code === 1 &&
      r.err.includes("install-tl failed") &&
      r.err.includes("simulated failure"),
    r.err,
  );
}
{
  const r = cmd({
    env: {
      ...env,
      RPP_TEXLIVE_DIR: join(work, "cache-nomirror"),
      RPP_CTAN_MIRROR: MISSING,
    },
  });
  check(
    "no mirror answers: exit 1, names the mirrors and the override",
    r.code === 1 &&
      r.err.includes("no CTAN mirror returned install-tl") &&
      r.err.includes("RPP_CTAN_MIRROR"),
    r.err,
  );
}

rmSync(work, { recursive: true, force: true });
console.log(`toolchain: ${n} checks passed`);
