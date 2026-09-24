/**
 * `rpp toolchain` — install upstream TeX Live, with exactly the packages the venue profiles
 * declare, into rpp's own cache. `rpp build` offers the same install on a terminal.
 *
 * 🔴 WHY rpp INSTALLS TeX AT ALL (rule 11). "Install TeX Live yourself" was a manual step with a
 * trap in it: the distribution packages cost 2.1 GB, and a smaller hand-picked set silently typeset
 * acmart papers in Computer Modern. The engine decision (2026-09-24) is TeX Live's pdflatex,
 * installed the way Playwright installs browsers: one command, a cache directory, idempotent.
 *
 * ── WHAT IT DOES ───────────────────────────────────────────────────────────────
 *   1. download install-tl-unx from the first CTAN mirror that returns a real archive — several
 *      mirrors, each download with its own time limit, TLS always verified (no `-k`, ever);
 *   2. install `scheme-basic` into `<cache>/<TeX Live year>` (measured 2026-09-01: 147 MB, 65 s);
 *   3. `tlmgr install` the union of every package the profiles declare;
 *   4. ACCEPT BY RESULT, NOT BY EXIT CODE: `kpsewhich` must find every declared proof file and
 *      every declared tool must be an executable in the bin directory. A gap fails the command
 *      and names the package. (tlmgr exits 1 on "package already present", and an apt step here
 *      once reported success having installed nothing: installers' exit codes are not evidence.)
 * A second run with everything present does nothing and says so; `--check` only reports.
 *
 * Where: `$RPP_TEXLIVE_DIR` when set (CI points its cache there), else
 * `$XDG_CACHE_HOME/rpp/texlive`, else `~/.cache/rpp/texlive` — one tree per TeX Live year inside.
 * Processes run through the injected `run` (the port `build.ts` uses), so the harness drives the
 * real download/unpack/verify logic against a fake mirror on disk, never the network.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  missingTools,
  probeTree,
  supportedPlatform,
  type Runner,
} from "./engine.ts";
import {
  declaredUnion,
  packageNames,
  type TexRequirements,
} from "./tex-requirements.ts";

export const CACHE_ENV = "RPP_TEXLIVE_DIR";
export const MIRROR_ENV = "RPP_CTAN_MIRROR";

/**
 * The CTAN mirrors, redirector first. 🔴 SEVERAL, AND THAT IS A MEASUREMENT: run 33650803245 died
 * on `curl: (60) SSL certificate problem` because `mirror.ctan.org` REDIRECTED to a community
 * mirror with an incomplete chain, and retrying follows the same redirect. The named university
 * mirrors after it keep stable chains. The cure is another mirror, never an unverified connection.
 */
export const DEFAULT_MIRRORS: readonly string[] = [
  "https://mirror.ctan.org/systems/texlive/tlnet",
  "https://ctan.math.illinois.edu/systems/texlive/tlnet",
  "https://mirrors.mit.edu/CTAN/systems/texlive/tlnet",
  "https://ftp.tu-chemnitz.de/pub/tex/systems/texlive/tlnet",
];

/** Per-download time limit, seconds: install-tl-unx is ~6 MB. */
export const DOWNLOAD_SECONDS = 180;
/** install-tl and tlmgr fetch hundreds of files; a hang still has to end. */
const INSTALL_MS = 20 * 60 * 1000;
const TLMGR_MS = 15 * 60 * 1000;

/** What the installer needs from the world. Everything else is computed. */
export interface ToolchainIO {
  readonly run: Runner;
  readonly log: (line: string) => void;
  readonly env: NodeJS.ProcessEnv;
}

/** One installed TeX Live in the cache. */
export interface CachedTree {
  readonly dir: string;
  readonly year: string;
  readonly bin: string;
}

// ── where ────────────────────────────────────────────────────────────────────────────

export function cacheRoot(
  env: NodeJS.ProcessEnv,
  home: string = homedir(),
): string {
  if (env[CACHE_ENV]) return env[CACHE_ENV];
  return join(env["XDG_CACHE_HOME"] || join(home, ".cache"), "rpp", "texlive");
}

/** The platform directory under `<tree>/bin` that holds pdflatex — found, not guessed per arch. */
function binDirOf(tree: string): string | null {
  const bins = join(tree, "bin");
  if (!existsSync(bins)) return null;
  const arch = readdirSync(bins).find((a) =>
    existsSync(join(bins, a, "pdflatex")),
  );
  return arch ? join(bins, arch) : null;
}

/** The newest year in the cache that holds a working tree, or null. */
export function cachedTree(root: string): CachedTree | null {
  if (!existsSync(root)) return null;
  const years = readdirSync(root)
    .filter((y) => /^\d{4}$/.test(y))
    .sort()
    .reverse();
  for (const year of years) {
    const bin = binDirOf(join(root, year));
    if (bin) return { dir: join(root, year), year, bin };
  }
  return null;
}

export function mirrorsFrom(env: NodeJS.ProcessEnv): readonly string[] {
  const own = env[MIRROR_ENV];
  return own ? [own.replace(/\/+$/, "")] : DEFAULT_MIRRORS;
}

// ── pure pieces ──────────────────────────────────────────────────────────────────────

/** `release-texlive.txt`'s first line: "TeX Live (https://tug.org/texlive) version 2026". */
export function tlYear(release: string): string | null {
  const first = release.split("\n", 1)[0] ?? "";
  return /\bversion (\d{4})\b/.exec(first)?.[1] ?? null;
}

/** The install-tl profile: scheme-basic, no docs or sources, every tree variable inside `dir`. */
export function tlProfile(dir: string): string {
  return [
    "selected_scheme scheme-basic",
    `TEXDIR ${dir}`,
    `TEXMFLOCAL ${dir}/texmf-local`,
    `TEXMFSYSVAR ${dir}/texmf-var`,
    `TEXMFSYSCONFIG ${dir}/texmf-config`,
    `TEXMFVAR ${dir}/user-var`,
    `TEXMFCONFIG ${dir}/user-config`,
    `TEXMFHOME ${dir}/texmf-home`,
    "instopt_adjustpath 0",
    "instopt_adjustrepo 1",
    "tlpdbopt_install_docfiles 0",
    "tlpdbopt_install_srcfiles 0",
    "",
  ].join("\n");
}

/** Package names tlmgr refused as unknown — an invented or renamed name, not a network problem. */
export function unknownPackages(tlmgrOutput: string): string[] {
  return tlmgrOutput
    .split("\n")
    .filter((l) => l.includes("not present in repository"))
    .map((l) => /package (\S+) not present/.exec(l)?.[1])
    .filter((n): n is string => Boolean(n));
}

/** What a tree lacks: packages by `kpsewhich`, tools by executable. */
export interface Gaps {
  readonly packages: readonly string[];
  readonly tools: readonly string[];
}

export const noGaps = (g: Gaps): boolean =>
  g.packages.length === 0 && g.tools.length === 0;

/** `acmart (acmart.cls), texcount (texcount)` — a gap named with the file that proves it. */
export function describeGaps(g: Gaps, tex: TexRequirements): string {
  const named = (
    names: readonly string[],
    proofs: TexRequirements["packages"],
  ) => names.map((n) => `${n} (${(proofs[n] ?? []).join(", ")})`);
  return [
    ...named(g.packages, tex.packages),
    ...named(g.tools, tex.tools),
  ].join(", ");
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60
    ? `${s}s`
    : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

// ── processes ────────────────────────────────────────────────────────────────────────

const quiet = (io: ToolchainIO, timeout?: number) => ({
  encoding: "utf8" as const,
  stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
  env: io.env,
  maxBuffer: 64 * 1024 * 1024,
  ...(timeout ? { timeout } : {}),
});

/** The last lines a process printed — what a failure shows. */
function tail(r: ReturnType<Runner>, n = 12): string[] {
  const text = `${String(r.stdout ?? "")}\n${String(r.stderr ?? "")}`;
  return text
    .split("\n")
    .filter((l) => l.trim())
    .slice(-n);
}

/** Ask the tree's own `kpsewhich` and bin directory what is missing. */
export function gapsOf(
  tree: CachedTree,
  tex: TexRequirements,
  run: Runner,
): Gaps {
  return {
    packages: probeTree(tree.bin, tex.packages, run),
    tools: missingTools(tex.tools, tree.bin),
  };
}

/**
 * Download install-tl-unx from the first mirror that returns a real archive. The archive is
 * judged by LISTING it: a truncated file and a mirror's HTML error page both have a size.
 */
export function downloadInstaller(
  io: ToolchainIO,
  mirrors: readonly string[],
  dest: string,
): string | null {
  for (const mirror of mirrors) {
    const url = `${mirror}/install-tl-unx.tar.gz`;
    const r = io.run(
      "curl",
      [
        "-fsSL",
        "--retry",
        "2",
        "--retry-delay",
        "2",
        "--max-time",
        String(DOWNLOAD_SECONDS),
        "-o",
        dest,
        url,
      ],
      quiet(io),
    );
    if (r.error || r.status !== 0) {
      io.log(
        `  ⚠ ${url}: ${tail(r, 1)[0] ?? r.error?.message ?? `curl exited ${String(r.status)}`}`,
      );
      continue;
    }
    if (io.run("tar", ["tzf", dest], quiet(io)).status === 0) return mirror;
    io.log(
      `  ⚠ ${url} returned something that is not a .tar.gz — trying the next mirror`,
    );
  }
  return null;
}

/** Unpack the installer into `work` and return its directory (`install-tl-YYYYMMDD`). */
function unpack(io: ToolchainIO, archive: string, work: string): string | null {
  const r = io.run("tar", ["xzf", archive, "-C", work], quiet(io));
  if (r.status !== 0) return null;
  const dir = readdirSync(work).find((d) => d.startsWith("install-tl-"));
  return dir ? join(work, dir) : null;
}

export type Step<T> = { ok: true; value: T } | { ok: false; lines: string[] };

/** Download, unpack and run install-tl: a fresh scheme-basic tree in `<root>/<year>`. */
export function installBase(
  io: ToolchainIO,
  root: string,
  mirrors: readonly string[],
): Step<{ tree: CachedTree; mirror: string }> {
  const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-install-tl-")));
  try {
    io.log(`  downloading install-tl…`);
    const mirror = downloadInstaller(
      io,
      mirrors,
      join(work, "install-tl.tar.gz"),
    );
    if (!mirror)
      return {
        ok: false,
        lines: [
          `no CTAN mirror returned install-tl — tried ${mirrors.join(", ")}`,
          `set ${MIRROR_ENV}=<a tlnet URL> to use another one`,
        ],
      };
    const installer = unpack(io, join(work, "install-tl.tar.gz"), work);
    const release = installer ? join(installer, "release-texlive.txt") : "";
    const year =
      installer && existsSync(release)
        ? tlYear(readFileSync(release, "utf8"))
        : null;
    if (!installer || !year)
      return {
        ok: false,
        lines: [
          `the archive from ${mirror} does not hold an install-tl with a release-texlive.txt`,
        ],
      };
    return runInstallTl(io, { installer, root, year, mirror, work });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function runInstallTl(
  io: ToolchainIO,
  a: {
    installer: string;
    root: string;
    year: string;
    mirror: string;
    work: string;
  },
): Step<{ tree: CachedTree; mirror: string }> {
  const dir = join(a.root, a.year);
  mkdirSync(dir, { recursive: true });
  const profile = join(a.work, "rpp.profile");
  writeFileSync(profile, tlProfile(dir));
  io.log(
    `  install-tl: TeX Live ${a.year} scheme-basic from ${a.mirror} (~150 MB, about a minute)…`,
  );
  const r = io.run(
    join(a.installer, "install-tl"),
    ["-profile", profile, "-repository", a.mirror, "-no-interaction"],
    quiet(io, INSTALL_MS),
  );
  const bin = binDirOf(dir);
  if (r.error || r.status !== 0 || !bin)
    return {
      ok: false,
      lines: [
        `install-tl failed (${r.error?.message ?? `exit ${String(r.status)}`}) — its last lines:`,
        ...tail(r),
      ],
    };
  return {
    ok: true,
    value: { tree: { dir, year: a.year, bin }, mirror: a.mirror },
  };
}

/**
 * `tlmgr install` the missing packages, trying the mirrors in turn. Success is judged by the
 * GAPS AFTERWARDS, not by tlmgr's exit code (it exits 1 on "already present"). An unknown package
 * name fails at once: another mirror will not know it either.
 */
export function installPackages(
  io: ToolchainIO,
  tree: CachedTree,
  tex: TexRequirements,
  mirrors: readonly string[],
): Step<{ gaps: Gaps; tail: string[] }> {
  let gaps = gapsOf(tree, tex, io.run);
  let last: string[] = [];
  for (const mirror of mirrors) {
    if (noGaps(gaps)) break;
    const want = [...gaps.packages, ...gaps.tools];
    io.log(`  tlmgr: installing ${want.length} package(s) from ${mirror}…`);
    const r = io.run(
      join(tree.bin, "tlmgr"),
      ["--repository", mirror, "install", ...want],
      quiet(io, TLMGR_MS),
    );
    const unknown = unknownPackages(
      `${String(r.stdout ?? "")}\n${String(r.stderr ?? "")}`,
    );
    if (unknown.length)
      return {
        ok: false,
        lines: [
          `tlmgr does not know: ${unknown.join(", ")} — the name in the venue profile is wrong or was renamed on CTAN`,
          `find the package by file: tlmgr search --global --file <file>`,
        ],
      };
    last = tail(r);
    gaps = gapsOf(tree, tex, io.run);
  }
  return { ok: true, value: { gaps, tail: last } };
}

/** Total size of a directory in MB — measured, so the success line never quotes a stale number. */
export function sizeMB(dir: string): number {
  let bytes = 0;
  for (const e of readdirSync(dir, { recursive: true, withFileTypes: true }))
    if (e.isFile()) bytes += statSync(join(e.parentPath, e.name)).size;
  return Math.round(bytes / 1024 / 1024);
}

// ── the command ──────────────────────────────────────────────────────────────────────

export interface ToolchainOptions {
  readonly check?: boolean;
  readonly log?: (line: string) => void;
  readonly err?: (line: string) => void;
  readonly env?: NodeJS.ProcessEnv;
  readonly run?: Runner;
  readonly platform?: NodeJS.Platform;
  readonly home?: string;
  /** The requirements to install — every profile's union by default. */
  readonly tex?: TexRequirements;
  readonly now?: () => number;
}

export type InstallResult =
  { readonly ok: true; readonly tree: CachedTree } | { readonly ok: false };

/**
 * Make the cache hold every package of `tex`: install TeX Live when there is none, add only the
 * missing packages when there is one, verify either way. Used by `rpp toolchain` and by `rpp build`
 * after a "yes".
 */
export function ensureTexLive(
  tex: TexRequirements,
  o: Required<Omit<ToolchainOptions, "check" | "platform" | "tex">>,
): InstallResult {
  const io: ToolchainIO = { run: o.run, log: o.log, env: o.env };
  const root = cacheRoot(o.env, o.home);
  const mirrors = mirrorsFrom(o.env);
  const started = o.now();
  let tree = cachedTree(root);
  if (!tree) {
    const base = installBase(io, root, mirrors);
    if (!base.ok) return fail(o.err, base.lines);
    tree = base.value.tree;
  }
  const added = installPackages(io, tree, tex, mirrors);
  if (!added.ok) return fail(o.err, added.lines);
  if (!noGaps(added.value.gaps))
    return fail(o.err, [
      `TeX Live ${tree.year} in ${tree.dir} still lacks, after tlmgr: ${describeGaps(added.value.gaps, tex)}`,
      `add the package that carries the file to the venue profile; find it with: tlmgr search --global --file <file>`,
      ...(added.value.tail.length
        ? [`tlmgr's last lines:`, ...added.value.tail]
        : []),
    ]);
  const files = new Set(Object.values(tex.packages).flat()).size;
  o.log(
    `✓ TeX Live ${tree.year} is ready in ${tree.dir}: ${packageNames(tex).length} packages verified ` +
      `(${files} files found by kpsewhich, ${Object.keys(tex.tools).length} tools), ` +
      `${sizeMB(tree.dir)} MB, ${formatDuration(o.now() - started)}`,
  );
  o.log(binLine(tree));
  return { ok: true, tree };
}

/**
 * `rpp build` finds the tree itself; a script that calls `pdflatex` directly needs this directory
 * first on PATH, so every success says where it is.
 */
export const binLine = (tree: CachedTree): string => `  bin: ${tree.bin}`;

function fail(
  err: (line: string) => void,
  lines: readonly string[],
): InstallResult {
  const [head, ...rest] = lines;
  err(`✗ rpp toolchain: ${head ?? "failed"}`);
  for (const l of rest) err(`    ${l}`);
  return { ok: false };
}

function withDefaults(o: ToolchainOptions): Required<ToolchainOptions> {
  return {
    check: o.check ?? false,
    log: o.log ?? console.log,
    err: o.err ?? console.error,
    env: o.env ?? process.env,
    run: o.run ?? spawnSync,
    platform: o.platform ?? process.platform,
    home: o.home ?? homedir(),
    tex: o.tex ?? declaredUnion().tex,
    now: o.now ?? Date.now,
  };
}

export const UNSUPPORTED =
  "Windows is not supported: rpp installs TeX Live with install-tl-unx (Linux, macOS). " +
  "Install TeX Live yourself (https://tug.org/texlive/windows.html) — rpp build uses a TeX Live on PATH " +
  "once it has every package the venue declares.";

/** `--check`: report, change nothing. Exit 0 only when every declared package is present. */
function report(
  o: Required<ToolchainOptions>,
  tree: CachedTree | null,
): number {
  const n = packageNames(o.tex).length;
  if (!tree) {
    o.log(
      `✗ no TeX Live in ${cacheRoot(o.env, o.home)} — \`npx rpp toolchain\` installs ${n} packages (~230 MB, ~2 min)`,
    );
    return 1;
  }
  const gaps = gapsOf(tree, o.tex, o.run);
  if (noGaps(gaps)) {
    o.log(
      `✓ TeX Live ${tree.year} in ${tree.dir} has all ${n} declared packages`,
    );
    o.log(binLine(tree));
    return 0;
  }
  const count = gaps.packages.length + gaps.tools.length;
  o.log(
    `✗ TeX Live ${tree.year} in ${tree.dir} lacks ${count} of ${n} declared packages: ${describeGaps(gaps, o.tex)}`,
  );
  o.log(`  run \`npx rpp toolchain\` to install them`);
  return 1;
}

/** `rpp toolchain [--check]`. */
export function runToolchain(options: ToolchainOptions = {}): number {
  const o = withDefaults(options);
  if (!supportedPlatform(o.platform)) {
    o.err(`✗ rpp toolchain: ${UNSUPPORTED}`);
    return 1;
  }
  const tree = cachedTree(cacheRoot(o.env, o.home));
  if (o.check) return report(o, tree);
  const n = packageNames(o.tex).length;
  if (tree && noGaps(gapsOf(tree, o.tex, o.run))) {
    o.log(
      `✓ TeX Live ${tree.year} in ${tree.dir} already has all ${n} declared packages — nothing to do`,
    );
    o.log(binLine(tree));
    return 0;
  }
  o.log(
    `rpp toolchain: TeX Live with ${n} packages into ${cacheRoot(o.env, o.home)}`,
  );
  return ensureTexLive(o.tex, o).ok ? 0 : 1;
}
