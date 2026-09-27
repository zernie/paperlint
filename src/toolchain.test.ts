/**
 * toolchain.ts edges the harness (a fixture mirror) does not reach, with a scripted runner: curl
 * that fails with and without output, a mirror serving something that is not a tarball, an archive
 * without install-tl or without its release file, install-tl that cannot start, tlmgr with nothing
 * to install; and the pure readers on inputs their happy paths never see.
 */
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { join } from "node:path";
import { test } from "vitest";
import { useTempDir, writeTree } from "../test/support.ts";
import {
  cachedTrees,
  CACHE_ENV,
  describeGaps,
  downloadInstaller,
  ensureTexLive,
  installBase,
  installPackages,
  releaseGap,
  runToolchain,
  tlYear,
  UNSUPPORTED,
  type ToolchainIO,
} from "./toolchain.ts";

const root = useTempDir("paperlint-toolchain-test-");
type Answer = {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
};
/** A runner answering by program name (the last path segment); `onRun` may write files first. */
function io(
  answers: Record<string, (args: string[]) => Answer>,
): ToolchainIO & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    log: (l) => lines.push(l),
    env: {},
    run: ((cmd: string, args: string[]) => {
      const name = cmd.split("/").pop() ?? cmd;
      const answer = answers[`${name} ${args[0] ?? ""}`] ?? answers[name];
      if (!answer) throw new Error(`unexpected ${name} ${args.join(" ")}`);
      return answer(args);
    }) as never,
  };
}
const ok = (stdout = ""): Answer => ({ status: 0, stdout, stderr: "" });

test("pure readers: a release file with no year, a `local:` line with no year, a gap with no proof file", () => {
  assert.equal(tlYear(""), null);
  assert.equal(releaseGap("local: soon\nrepository: 2026"), null);
  assert.equal(
    describeGaps(
      { packages: ["acmart"], tools: [], dependencies: [] },
      { packages: {}, tools: {} },
    ),
    "acmart ()",
  );
});

test("the cache: a year whose bin directory holds no runnable pdflatex is not a tree", () => {
  const cache = join(root, "cache");
  mkdirSync(join(cache, "2025", "bin", "x86_64-linux"), { recursive: true });
  writeFileSync(join(cache, "2025", "bin", "x86_64-linux", "pdflatex"), "");
  mkdirSync(join(cache, "2026", "bin", "x86_64-linux"), { recursive: true });
  const exe = join(cache, "2026", "bin", "x86_64-linux", "pdflatex");
  writeFileSync(exe, "#!/bin/sh\n");
  chmodSync(exe, 0o755);
  assert.deepEqual(
    cachedTrees(cache).map((t) => t.year),
    ["2026"],
  );
});

test("download: curl failing with its own line, with only an error, with only a code; then a non-tarball", () => {
  const t = io({
    curl: (args) => {
      const url = args[args.length - 1] ?? "";
      if (url.startsWith("m1"))
        return { status: 22, stdout: "", stderr: "curl: (22) 404\n" };
      if (url.startsWith("m2"))
        return { status: null, error: new Error("spawn curl ENOENT") };
      if (url.startsWith("m3")) return { status: 7 };
      return ok();
    },
    "tar tzf": () => ({ status: 2 }),
  });
  assert.equal(
    downloadInstaller(t, ["m1", "m2", "m3", "m4"], join(root, "x.tgz")),
    null,
  );
  assert.deepEqual(t.lines, [
    "  ⚠ m1/install-tl-unx.tar.gz: curl: (22) 404",
    "  ⚠ m2/install-tl-unx.tar.gz: spawn curl ENOENT",
    "  ⚠ m3/install-tl-unx.tar.gz: curl exited 7",
    "  ⚠ m4/install-tl-unx.tar.gz returned something that is not a .tar.gz — trying the next mirror",
  ]);
});

/** A runner whose download succeeds and whose `tar xzf` lays out `files` in the work directory. */
const unpacking = (
  files: Record<string, string> | null,
  more: Record<string, (args: string[]) => Answer> = {},
) =>
  io({
    curl: () => ok(),
    "tar tzf": () => ok(),
    "tar xzf": (args) => {
      if (files === null) return { status: 2 };
      writeTree(args[args.length - 1] ?? "", files);
      return ok();
    },
    ...more,
  });

test("install: an archive that does not unpack, holds no install-tl, or no release file", () => {
  const bad = [
    unpacking(null),
    unpacking({ "other/x": "" }),
    unpacking({ "install-tl-20260101/install-tl": "" }),
  ].map((t) => installBase(t, join(root, "tl"), ["m"]));
  for (const r of bad)
    assert.deepEqual(r, {
      ok: false,
      lines: [
        "the archive from m does not hold an install-tl with a release-texlive.txt",
      ],
    });
});

test("install: install-tl that cannot start names the error and its last lines", () => {
  const t = unpacking(
    {
      "install-tl-20260101/install-tl": "",
      "install-tl-20260101/release-texlive.txt":
        "TeX Live (https://tug.org/texlive) version 2026\n",
    },
    {
      "install-tl": () => ({ status: null, error: new Error("spawn EACCES") }),
    },
  );
  assert.deepEqual(installBase(t, join(root, "tl2"), ["m"]), {
    ok: false,
    lines: ["install-tl failed (spawn EACCES) — its last lines:"],
  });
});

test("tlmgr: nothing missing, nothing installed", () => {
  const t = io({ kpsewhich: () => ok(), tlmgr: () => ok() });
  const tree = { dir: "/t/2026", year: "2026", bin: "/t/2026/bin/x" };
  assert.deepEqual(
    installPackages(t, tree, { packages: {}, tools: {} }, ["m"]),
    {
      ok: true,
      value: { gaps: { packages: [], tools: [], dependencies: [] }, tail: [] },
    },
  );
});

test("tlmgr: a run that prints nothing still leaves the gap to verify", () => {
  let kpse = 0;
  const t = io({
    kpsewhich: () => ok(kpse++ ? "/t/acmart.cls\n" : ""),
    "tlmgr check": () => ok(),
    "tlmgr --repository": () => ({ status: 0 }),
  });
  const tree = { dir: "/t/2026", year: "2026", bin: "/t/2026/bin/x" };
  const r = installPackages(
    t,
    tree,
    { packages: { acmart: ["acmart.cls"] }, tools: {} },
    ["m"],
  );
  assert.deepEqual(r, {
    ok: true,
    value: { gaps: { packages: [], tools: [], dependencies: [] }, tail: [] },
  });
});

/** A cache holding one tree for `year` with a runnable pdflatex; returns the cache root. */
function cacheWith(name: string, year: string): string {
  const cache = join(root, name);
  const exe = join(cache, year, "bin", "x86_64-linux", "pdflatex");
  mkdirSync(dirname(exe), { recursive: true });
  writeFileSync(exe, "#!/bin/sh\n");
  chmodSync(exe, 0o755);
  return cache;
}
const ACMART = { packages: { acmart: ["acmart.cls"] }, tools: {} };
function ensure(
  cache: string,
  answers: Record<string, (args: string[]) => Answer>,
) {
  const t = io(answers);
  const errs: string[] = [];
  const r = ensureTexLive(ACMART, {
    run: t.run,
    log: t.log,
    err: (l) => errs.push(l),
    env: { [CACHE_ENV]: cache },
    home: root,
    now: () => 0,
  });
  return { r, errs };
}

test("ensure: tlmgr leaves the package missing — the verdict quotes tlmgr's last lines", () => {
  const cache = cacheWith("lacks", "2026");
  const { r, errs } = ensure(cache, {
    kpsewhich: () => ok(),
    "tlmgr check": () => ok(),
    "tlmgr --repository": () =>
      ok("tlmgr: package acmart installed, but nothing changed\n"),
  });
  assert.deepEqual(
    [r, errs.slice(-2)],
    [
      { ok: false },
      [
        "    tlmgr's last lines:",
        "    tlmgr: package acmart installed, but nothing changed",
      ],
    ],
  );
});

test("ensure: tlmgr refuses across releases, the new tree is installed, and tlmgr still refuses", () => {
  const cache = cacheWith("newer", "2025");
  const refusal = ok(
    "tlmgr: Local TeX Live (2025) is older than remote repository (2026).\n",
  );
  const { r, errs } = ensure(cache, {
    kpsewhich: () => ok(),
    "tlmgr check": () => ok(),
    "tlmgr --repository": () => refusal,
    curl: () => ok(),
    "tar tzf": () => ok(),
    "tar xzf": (args) => {
      writeTree(args[args.length - 1] ?? "", {
        "install-tl-20260101/install-tl": "",
        "install-tl-20260101/release-texlive.txt":
          "TeX Live (https://tug.org/texlive) version 2026\n",
      });
      return ok();
    },
    "install-tl": () => {
      const exe = join(cache, "2026", "bin", "x86_64-linux", "pdflatex");
      mkdirSync(dirname(exe), { recursive: true });
      writeFileSync(exe, "#!/bin/sh\n");
      chmodSync(exe, 0o755);
      return ok();
    },
  });
  assert.deepEqual(
    [r, errs],
    [
      { ok: false },
      [
        `✗ paperlint toolchain: tlmgr still refuses: the repository is TeX Live 2026 and the new tree in ${join(cache, "2026")} is 2025`,
      ],
    ],
  );
});

test("runToolchain with only its installer: the console is the default output", () => {
  const seen: unknown[] = [];
  const saved = console.error;
  console.error = (...a: unknown[]) => void seen.push(a.join(" "));
  try {
    assert.equal(runToolchain({ platform: "win32", banal: {} as never }), 1);
  } finally {
    console.error = saved;
  }
  assert.deepEqual(seen, [`✗ paperlint toolchain: ${UNSUPPORTED}`]);
});
