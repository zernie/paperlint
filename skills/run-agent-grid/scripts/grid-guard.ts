#!/usr/bin/env node
/**
 * grid-guard — the checks of the run-agent-grid skill that a driver or a commit hook calls, so
 * that a rule of the skill is a refusal and not a sentence.
 *
 *   lock <root> --owner <id> [--pid <pid>] [--attached]
 *                                            take the lock on a working-copy root; the holder
 *                                            must be detached (its own session) unless --attached
 *   release <root> --owner <id>              give it back
 *   gate --registry <f> --ledger <f> --unit <u> --arm <a> --model <m> --seed <s>
 *        --attempt <id> [--reserve-sec <n>]  may this cell run now? If so it is RESERVED for
 *                                            <id> in the ledger, atomically, until the attempt's
 *                                            end record or n seconds (default 6 h)
 *   overlap <ledger>                         attempts that shared a root at the same time
 *   env-probe [--allow <NAME>]... [--git]    secret-named variables, and whether git still works
 *   scan-keys <path>...                      key-shaped strings in files on disk
 *   precommit [--runs <dir>] [--done <file>] the same scan over the staged files, and staged run
 *                                            folders that have no completion record
 *
 * EXIT CODES — a driver branches on them:
 *   0  allowed, clean, done      1  refused, or a finding      2  usage
 *   3  (gate) the cell is already counted: skip it, do not run it again
 *
 * TypeScript, compiled beside itself to `grid-guard.js` by `npm run build`: a consumer runs the
 * skill from `node_modules`, where Node does not strip types. The skill names the `.js`.
 *
 * A value that looks like a key is NEVER printed, not even in part: the output of this script
 * goes into logs and transcripts, which are exactly where a leaked key gets committed.
 */
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { COMMANDS, type CommandName } from "./grid-guard-commands.ts";

class Refusal extends Error {
  readonly exitCode: number;
  constructor(exitCode: number, message: string) {
    super(message);
    this.exitCode = exitCode;
  }
}
const refuse = (exitCode: number, message: string): never => {
  throw new Refusal(exitCode, message);
};
const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
/** A property of a thrown value, whatever was thrown. */
const prop = (e: unknown, key: string): unknown => Reflect.get(Object(e), key);

// ── lock / release ──────────────────────────────────────────────────────────────────────────
// The lock sits BESIDE the root, not inside it: a driver that deletes the root's tree must not
// delete the lock that was supposed to stop it.
const Lock = z.object({
  owner: z.string(),
  pid: z.number(),
  host: z.string(),
  at: z.string(),
});
type Lock = z.infer<typeof Lock>;
const lockPath = (root: string): string => `${resolve(root)}.lock`;
const readLock = (path: string): Lock =>
  Lock.parse(JSON.parse(readFileSync(path, "utf8")));

/** Is `pid` a live process on this host? EPERM means it exists and belongs to someone else. */
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return prop(e, "code") !== "ESRCH";
  }
};

/** Create the lock file; false when someone holds it already. */
function take(path: string, me: Lock): boolean {
  try {
    writeFileSync(path, `${JSON.stringify(me)}\n`, { flag: "wx" });
    return true;
  } catch (e) {
    if (prop(e, "code") === "EEXIST") return false;
    throw e;
  }
}

// ── detached? ───────────────────────────────────────────────────────────────────────────────
// A driver started as a task the agent session tracks dies with the session (its time cap). Only
// a process in a session of its own survives that: `setsid` makes it the session leader, so its
// session id equals its pid. `GRID_GUARD_PROC` stands in for `/proc` in tests.
const procRoot = (): string => process.env.GRID_GUARD_PROC ?? "/proc";

/** The session id of `pid` from `/proc/<pid>/stat` (field 6), or null where that cannot be read. */
function sessionOf(pid: number): number | null {
  const stat = join(procRoot(), String(pid), "stat");
  if (!existsSync(stat)) return null;
  // The command name (field 2) is in parentheses and may hold spaces or parentheses itself.
  const text = readFileSync(stat, "utf8");
  const after = text.slice(text.lastIndexOf(")") + 2);
  return Number(after.split(" ")[3]);
}

/**
 * Why `pid` may not hold a grid lock, or null. Liveness is asked of the kernel (`kill(pid, 0)`),
 * which every platform answers; only the session check needs `/proc`, and where it cannot be read
 * (macOS, a hidden `/proc`) it warns and passes.
 */
function detachProblem(pid: number): string | null {
  if (!alive(pid)) return `pid ${String(pid)} is not a live process`;
  const sid = sessionOf(pid);
  if (sid === null) {
    process.stderr.write(
      `grid-guard: warning: cannot read ${join(procRoot(), String(pid), "stat")} here, so whether pid ${String(pid)} is detached is not checked\n`,
    );
    return null;
  }
  return sid === pid
    ? null
    : `pid ${String(pid)} is not detached (it runs in session ${String(sid)}), so it dies with the ` +
        `session that started it. Start the driver as \`setsid nohup <driver> > driver.log 2>&1 &\` ` +
        `and lock with --pid $$ inside it, or pass --attached for a short run.`;
}

function lock(
  root: string,
  owner: string,
  pid: string | undefined,
  attached: boolean,
): void {
  const path = lockPath(root);
  const me: Lock = {
    owner,
    pid: Number(pid ?? process.ppid),
    host: hostname(),
    at: new Date().toISOString(),
  };
  const notDetached = attached ? null : detachProblem(me.pid);
  if (notDetached !== null) refuse(1, notDetached);
  if (take(path, me)) {
    say(`locked ${path} for ${me.owner} (pid ${String(me.pid)})`);
    return;
  }
  const held = readLock(path);
  if (takeOverStale(path, me, held)) return;
  refuse(
    1,
    `${path} is held by ${held.owner} (pid ${String(held.pid)} on ${held.host} since ${held.at}). ` +
      `Wait for it, or give this driver its own working-copy root.`,
  );
}

/**
 * Take the lock from a holder that is provably gone: same host, and its process is dead. A lock
 * from another host cannot be judged from here, so it is never taken over.
 */
function takeOverStale(path: string, me: Lock, held: Lock): boolean {
  const stale = held.host === me.host && !alive(held.pid);
  if (stale) rmSync(path, { force: true });
  if (!(stale && take(path, me))) return false;
  say(
    `took over a stale lock on ${path} (holder ${held.owner}, pid ${String(held.pid)}, is gone)`,
  );
  return true;
}

function release(root: string, owner: string): void {
  const path = lockPath(root);
  if (!existsSync(path)) refuse(1, `${path} is not held`);
  const held = readLock(path);
  if (held.owner !== owner)
    refuse(1, `${path} is held by ${held.owner}, not ${owner}`);
  rmSync(path);
  say(`released ${path}`);
}

// ── the attempt ledger ──────────────────────────────────────────────────────────────────────
const Seed = z.union([z.string(), z.number()]);
/**
 * One line of the ledger. A driver appends one line when an attempt starts and one when it
 * ends, both carrying the same `attempt` id; later lines add to earlier ones, so a crashed
 * attempt is still on record — with a start and no end.
 */
const Attempt = z.looseObject({
  attempt: z.string(),
  agent: z.string().optional(),
  unit: z.string().optional(),
  arm: z.string().optional(),
  model: z.string().optional(),
  seed: Seed.optional(),
  root: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  status: z.string().optional(),
  cost: z.number().optional(),
  expires: z.string().optional(),
});
type Attempt = z.infer<typeof Attempt>;

/** A `reserved` record whose time is up: no longer holds its cell, no longer counts as spent. */
const lapsed = (r: Attempt, now: number): boolean =>
  r.status === "reserved" && Date.parse(String(r.expires)) <= now;

function readLedger(path: string): Attempt[] {
  if (!existsSync(path)) return [];
  const byId = new Map<string, Attempt>();
  readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => Attempt.parse(JSON.parse(line)))
    .forEach((rec) => {
      byId.set(rec.attempt, { ...byId.get(rec.attempt), ...rec });
    });
  return [...byId.values()];
}

interface Cell {
  readonly unit: string;
  readonly arm: string;
  readonly model: string;
  readonly seed: string;
}
const sameCell = (a: Attempt, b: Cell): boolean =>
  a.unit === b.unit &&
  a.arm === b.arm &&
  a.model === b.model &&
  String(a.seed) === b.seed;

// ── gate ────────────────────────────────────────────────────────────────────────────────────
const Unit = z.looseObject({
  id: z.string(),
  role: z.string().optional(),
  reason: z.string().optional(),
  approval: z
    .looseObject({
      by: z.string().optional(),
      at: z.string().optional(),
      channel: z.string().optional(),
    })
    .optional(),
  proof: z
    .looseObject({
      toolVisible: z.unknown().optional(),
      firesOnPinned: z.unknown().optional(),
      acceptsReference: z.unknown().optional(),
    })
    .optional(),
});
const Model = z.looseObject({
  id: z.string(),
  smoke: z
    .looseObject({
      timeoutSec: z.unknown().optional(),
      costPerRun: z.unknown().optional(),
    })
    .optional(),
});
const Registry = z.looseObject({
  author: z.string().optional(),
  draw: z.looseObject({ seed: Seed.optional() }).optional(),
  arms: z.array(z.string()).default([]),
  seeds: z.array(Seed).default([]),
  budget: z.looseObject({ cap: z.unknown().optional() }).optional(),
  models: z.array(Model).default([]),
  units: z.array(Unit).default([]),
});
type Registry = z.infer<typeof Registry>;

/** The registry as COMMITTED: a declaration that exists only in the working tree allows nothing. */
function committedRegistry(file: string): Registry {
  const abs = resolve(file);
  const git = (...args: string[]) =>
    spawnSync("git", ["-C", dirname(abs), ...args], { encoding: "utf8" });
  const top = git("rev-parse", "--show-toplevel");
  if (top.status !== 0)
    refuse(
      1,
      `${file} is not inside a git repository; the registry must be committed`,
    );
  const rel = relative(top.stdout.trim(), abs).split(sep).join("/");
  const head = git("show", `HEAD:${rel}`);
  if (head.status !== 0)
    refuse(1, `${file} is not committed; commit it before any run it allows`);
  if (head.stdout !== readFileSync(abs, "utf8"))
    refuse(
      1,
      `${file} differs from its committed version; commit the change (a dated addendum) before any run it allows`,
    );
  return Registry.parse(JSON.parse(head.stdout));
}

const filled = (v: unknown): boolean =>
  typeof v === "string" && v.trim() !== "";
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** Everything the gate decides from, computed once. */
function facts(reg: Registry, cell: Cell, ledgerPath: string) {
  const unit = reg.units.find((u) => u.id === cell.unit);
  const model = reg.models.find((m) => m.id === cell.model);
  const timeoutSec = num(model?.smoke?.timeoutSec);
  const costPerRun = num(model?.smoke?.costPerRun);
  const smoked = timeoutSec !== null && costPerRun !== null;
  const counted = unit?.role === "counted";
  const ledger = readLedger(ledgerPath);
  const now = Date.now();
  const spent = ledger
    .filter((r) => !lapsed(r, now))
    .reduce((sum, r) => sum + (r.cost ?? 0), 0);
  const cap = num(reg.budget?.cap);
  const next = counted && costPerRun !== null ? costPerRun : 0;
  return {
    now,
    unit,
    model,
    smoked,
    counted,
    ledger,
    spent,
    cap,
    next,
    timeoutSec,
  };
}

type Facts = ReturnType<typeof facts>;
type Check = readonly [boolean, string];

/** Is the cell declared at all? */
function declared(reg: Registry, cell: Cell, f: Facts): Check[] {
  const role = String(f.unit?.role);
  const why = filled(f.unit?.reason) ? ` (${String(f.unit?.reason)})` : "";
  return [
    [!f.unit, `unit "${cell.unit}" is not in the registry`],
    [
      f.unit !== undefined && !["counted", "smoke"].includes(role),
      `unit "${cell.unit}" has role "${role}"${why}; only "counted" and "smoke" units run`,
    ],
    [!reg.arms.includes(cell.arm), `arm "${cell.arm}" is not declared`],
    [!f.model, `model "${cell.model}" is not declared`],
    [
      !reg.seeds.map(String).includes(cell.seed),
      `seed "${cell.seed}" is not declared`,
    ],
    [
      reg.units.some((u) => u.role === "excluded" && !filled(u.reason)),
      `an excluded unit has no reason`,
    ],
    [f.cap === null, `the registry declares no budget.cap`],
  ];
}

/** What a COUNTED run needs on top: approval, proof, a draw, a smoked model. */
function countedNeeds(reg: Registry, cell: Cell, f: Facts): Check[] {
  const a = f.unit?.approval ?? {};
  const p = f.unit?.proof ?? {};
  const approved =
    filled(reg.author) &&
    a.by === reg.author &&
    filled(a.at) &&
    filled(a.channel);
  const proven = [p.toolVisible, p.firesOnPinned, p.acceptsReference].every(
    (v) => v === true,
  );
  return [
    [
      !approved,
      `unit "${cell.unit}" has no approval by the author (approval.by = author, with at and channel)`,
    ],
    [
      !proven,
      `unit "${cell.unit}" has no sandbox proof (toolVisible, firesOnPinned, acceptsReference)`,
    ],
    [reg.draw?.seed === undefined, `the registry records no draw seed`],
    [
      f.model !== undefined && !f.smoked,
      `model "${cell.model}" has no smoke result (smoke.timeoutSec, smoke.costPerRun)`,
    ],
  ];
}

/** Every reason this cell may not run, in a fixed order. */
function problems(reg: Registry, cell: Cell, f: Facts): string[] {
  const over = f.cap !== null && f.spent + f.next > f.cap;
  const checks: readonly Check[] = [
    ...declared(reg, cell, f),
    ...(f.counted ? countedNeeds(reg, cell, f) : []),
    [
      over,
      `budget: spent ${String(f.spent)} + next ${String(f.next)} exceeds the cap ${String(f.cap)}`,
    ],
  ];
  return checks.filter(([bad]) => bad).map(([, message]) => message);
}

/** Who already holds this cell: a counted attempt (exit 3), a live reservation (exit 3), or nobody. */
function holder(f: Facts, cell: Cell): string | null {
  const mine = f.ledger.filter((r) => sameCell(r, cell));
  if (mine.some((r) => r.status === "complete"))
    return `${JSON.stringify(cell)} is already counted; skip it`;
  const held = mine.find((r) => r.status === "reserved" && !lapsed(r, f.now));
  return held
    ? `${JSON.stringify(cell)} is reserved by attempt ${held.attempt} until ${String(held.expires)}; skip it`
    : null;
}

/**
 * May this cell run now — and if so, CLAIM it. Read, check and append happen under the ledger's
 * lock, so two drivers asking at once cannot both get one cell, nor both fit under the cap: the
 * `reserved` record holds the cell and counts its estimated cost until the driver's end record for
 * the same attempt replaces it, or until it lapses.
 */
/** The cell a gate call names. */
const cellOf = (o: Values): Cell => ({
  unit: String(o.unit),
  arm: String(o.arm),
  model: String(o.model),
  seed: String(o.seed),
});

function gate(o: Values): void {
  const reg = committedRegistry(String(o.registry));
  const cell = cellOf(o);
  const ledgerPath = String(o.ledger);
  const attempt = String(o.attempt);
  withLedgerLock(ledgerPath, () => {
    const f = facts(reg, cell, ledgerPath);
    const found = problems(reg, cell, f);
    if (found.length)
      refuse(
        1,
        `refused ${JSON.stringify(cell)}:\n  - ${found.join("\n  - ")}`,
      );
    const taken = holder(f, cell);
    if (taken !== null) refuse(3, taken);
    if (f.ledger.some((r) => r.attempt === attempt))
      refuse(
        1,
        `attempt ${attempt} is already on the ledger; give each attempt its own id`,
      );
    reserve(ledgerPath, {
      attempt,
      cell,
      f,
      seconds: Number(o["reserve-sec"]),
    });
  });
}

/** Append the cell's reservation for `attempt`, and report the gate's answer. */
function reserve(
  ledgerPath: string,
  r: { attempt: string; cell: Cell; f: Facts; seconds: number },
): void {
  const record = {
    attempt: r.attempt,
    ...r.cell,
    status: "reserved",
    cost: r.f.next,
    start: new Date(r.f.now).toISOString(),
    expires: new Date(r.f.now + r.seconds * 1000).toISOString(),
  };
  appendFileSync(ledgerPath, `${JSON.stringify(record)}\n`);
  say(
    JSON.stringify({
      allowed: true,
      cell: r.cell,
      attempt: r.attempt,
      counted: r.f.counted,
      timeoutSec: r.f.smoked ? r.f.timeoutSec : null,
      spent: r.f.spent,
    }),
  );
}

// ── the ledger's lock ───────────────────────────────────────────────────────────────────────
/** How long a gate waits for another gate's turn. `GRID_GUARD_LEDGER_WAIT_MS` shortens it in tests. */
const ledgerWaitMs = (): number =>
  Number(process.env.GRID_GUARD_LEDGER_WAIT_MS ?? 10_000);

/** Sleep without spinning: the process blocks until the time passes. */
const pause = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/**
 * The ledger lock's owner, or null while it cannot be read — another gate may have created the
 * file and not yet written it, so an unreadable lock is a held one.
 */
const peekLock = (path: string): Lock | null => {
  try {
    return readLock(path);
  } catch {
    return null;
  }
};

/** Take `<ledger>.lock`, waiting for a live holder and replacing a dead one on this host. */
function acquireLedger(path: string, deadline: number): void {
  const me: Lock = {
    owner: "gate",
    pid: process.pid,
    host: hostname(),
    at: new Date().toISOString(),
  };
  if (take(path, me)) return;
  const held = peekLock(path);
  if (held !== null && held.host === me.host && !alive(held.pid))
    rmSync(path, { force: true });
  else if (Date.now() >= deadline)
    refuse(
      1,
      held === null
        ? `${path} exists and names no owner; if no gate is running, delete it`
        : `${path} is held by pid ${String(held.pid)} on ${held.host} since ${held.at}; another gate is writing the ledger — try again`,
    );
  else pause(25);
  acquireLedger(path, deadline);
}

function withLedgerLock(ledger: string, work: () => void): void {
  const path = `${resolve(ledger)}.lock`;
  acquireLedger(path, Date.now() + ledgerWaitMs());
  try {
    work();
  } finally {
    rmSync(path, { force: true });
  }
}

// ── overlap ─────────────────────────────────────────────────────────────────────────────────
interface Window {
  readonly attempt: string;
  readonly root: string;
  readonly status: string | undefined;
  readonly from: number;
  readonly to: number;
}

/** Pairs of attempts on one root whose windows intersect, at least one of them counted. */
const sharedRoots = (recs: readonly Window[]): string[] =>
  recs.flatMap((a, i) =>
    recs
      .slice(i + 1)
      .filter(
        (b) =>
          a.root === b.root &&
          (a.status === "complete" || b.status === "complete") &&
          a.from < b.to &&
          b.from < a.to,
      )
      .map((b) => `${a.attempt} and ${b.attempt} shared ${a.root}`),
  );

function overlap(file: string): void {
  if (!existsSync(file)) refuse(1, `no ledger at ${file}`);
  const recs: Window[] = readLedger(file).map((r) => ({
    attempt: r.attempt,
    status: r.status,
    root: resolve(String(r.root)),
    from: Date.parse(String(r.start)),
    to: r.end === undefined ? Infinity : Date.parse(r.end),
  }));
  const findings = [
    ...recs
      .filter((r) => Number.isNaN(r.from) || Number.isNaN(r.to))
      .map((r) => `${r.attempt}: start or end is not a date`),
    ...sharedRoots(recs),
  ];
  if (findings.length)
    refuse(
      1,
      `${findings.join("\n")}\nmark each contaminated attempt "harness-error" (keep it) and run the cell again`,
    );
  say(`no overlap among ${String(recs.length)} attempts`);
}

// ── env-probe ───────────────────────────────────────────────────────────────────────────────
const SECRET_NAME =
  /KEY|TOKEN|SECRET|PASSW|CREDENTIAL|COOKIE|SESSION|AUTH(?!OR)/i;

function envProbe(allow: readonly string[], withGit: boolean): void {
  const allowed = new Set(allow);
  const names = Object.keys(process.env)
    .filter((n) => SECRET_NAME.test(n) && !allowed.has(n))
    .sort();
  if (names.length)
    refuse(
      1,
      `secret-named variables reach this environment (names only): ${names.join(", ")}`,
    );
  if (withGit) gitProbe();
  say(
    `no secret-named variables${withGit ? "; git init, add and commit work" : ""}`,
  );
}

/** The policy that drops secrets must not drop what the agent's tools need: prove git commits. */
function gitProbe(): void {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "grid-git-probe-")));
  try {
    writeFileSync(join(dir, "probe.txt"), "probe\n");
    [
      ["init", "-q"],
      ["add", "probe.txt"],
      ["commit", "-q", "-m", "probe"],
    ].forEach((args) => {
      const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
      if (r.status !== 0)
        refuse(
          1,
          `git ${String(args[0])} fails in this environment: ${(r.stderr || String(r.error)).trim()}`,
        );
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── scan-keys / precommit ───────────────────────────────────────────────────────────────────
// Shapes, not vendors: each names a FORM a credential takes. The last one catches an
// environment dump — NAME=value lines — which is how secrets got into transcripts.
const KEY_SHAPES: readonly (readonly [string, RegExp])[] = [
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["access key id", /\bAKIA[0-9A-Z]{16}\b/],
  [
    "git host token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/,
  ],
  ["chat bot token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["cloud api key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["sk- api key", /\bsk-[A-Za-z0-9_-]{20,}/],
  [
    "secret-named assignment",
    /\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSW(?:OR)?D)[A-Z0-9_]*["']?\s*[=:]\s*["']?(?![<$])[^\s"'<>]{12,}/,
  ],
];

/** `file:line: shape` for every key-shaped string in `text`; the value is never part of it. */
const scanText = (name: string, text: string): string[] =>
  text.includes("\0")
    ? []
    : text
        .split("\n")
        .flatMap((line, i) =>
          KEY_SHAPES.filter(([, re]) => re.test(line)).map(
            ([shape]) => `${name}:${String(i + 1)}: ${shape}`,
          ),
        );

const SKIP_DIRS = new Set([".git", "node_modules"]);
const walk = (path: string): string[] =>
  statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((e) => !SKIP_DIRS.has(e))
        .flatMap((e) => walk(join(path, e)))
    : [path];

function reportKeys(findings: readonly string[], scanned: number): void {
  if (findings.length)
    refuse(1, `key-shaped strings (values not shown):\n${findings.join("\n")}`);
  say(`no key-shaped strings in ${String(scanned)} files`);
}

function scanKeys(paths: readonly string[]): void {
  const files = paths.flatMap(walk);
  reportKeys(
    files.flatMap((f) => scanText(f, readFileSync(f, "utf8"))),
    files.length,
  );
}

/** Staged run folders under `runs` whose completion record `done` is not in the index. */
const halfWritten = (
  staged: readonly string[],
  index: ReadonlySet<string>,
  runs: string,
  done: string,
): string[] =>
  [
    ...new Set(
      staged
        .filter((f) => f.startsWith(`${runs}/`))
        .map((f) => f.slice(runs.length + 1).split("/"))
        .filter((parts) => parts.length > 1)
        .map((parts) => `${runs}/${String(parts[0])}`),
    ),
  ].filter((dir) => !index.has(`${dir}/${done}`));

/** stdout of a git command run where the caller stands; a failure is a refusal. */
const gitOut = (...args: string[]): string => {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) refuse(1, `git ${String(args[0])}: ${r.stderr.trim()}`);
  return r.stdout;
};
const nulList = (s: string): string[] => s.split("\0").filter(Boolean);

function precommit(runsOpt: string | undefined, done: string): void {
  const top = gitOut("rev-parse", "--show-toplevel").trim();
  const cached = (...filter: string[]): string[] =>
    nulList(
      gitOut("-C", top, "diff", "--cached", "--name-only", "-z", ...filter),
    );
  // Content is scanned only where it exists in the index; a run folder is affected by any staged
  // path in it, a DELETION included — deleting a completion record must not pass as finished.
  const staged = cached("--diff-filter=ACMR");
  const touched = cached();
  const keys = staged.flatMap((f) =>
    scanText(f, gitOut("-C", top, "show", `:${f}`)),
  );
  const index = new Set(nulList(gitOut("-C", top, "ls-files", "-z")));
  const half = runsOpt
    ? halfWritten(touched, index, runsOpt.replace(/\/+$/, ""), done)
    : [];
  if (half.length)
    refuse(
      1,
      `run folders without ${done} are staged (commit only finished runs):\n${half.join("\n")}`,
    );
  reportKeys(keys, staged.length);
}

// ── command line ────────────────────────────────────────────────────────────────────────────
/** The options every command reads, after parsing. */
interface Opts {
  readonly owner?: string;
  readonly pid?: string;
  readonly registry?: string;
  readonly ledger?: string;
  readonly unit?: string;
  readonly arm?: string;
  readonly model?: string;
  readonly seed?: string;
  readonly attempt?: string;
  readonly "reserve-sec": string;
  readonly allow: readonly string[];
  readonly git: boolean;
  readonly attached: boolean;
  readonly runs?: string;
  readonly done: string;
}
type Values = Opts;

type Command = readonly [
  required: readonly (keyof Opts)[],
  arity: number,
  run: (paths: readonly string[], o: Opts) => void,
];
/**
 * Each command: the options it requires, how many paths it takes (-1: one or more), what it does.
 * Keyed by the names in `grid-guard-commands.ts`, all of them and nothing else.
 */
const DISPATCH: { readonly [K in CommandName]: Command } = {
  lock: [
    ["owner"],
    1,
    (p, o) => {
      lock(String(p[0]), String(o.owner), o.pid, o.attached);
    },
  ],
  release: [
    ["owner"],
    1,
    (p, o) => {
      release(String(p[0]), String(o.owner));
    },
  ],
  gate: [
    ["registry", "ledger", "unit", "arm", "model", "seed", "attempt"],
    0,
    (_, o) => {
      gate(o);
    },
  ],
  overlap: [
    [],
    1,
    (p) => {
      overlap(String(p[0]));
    },
  ],
  "env-probe": [
    [],
    0,
    (_, o) => {
      envProbe(o.allow, o.git);
    },
  ],
  "scan-keys": [
    [],
    -1,
    (p) => {
      scanKeys(p);
    },
  ],
  precommit: [
    [],
    0,
    (_, o) => {
      precommit(o.runs, o.done);
    },
  ],
};

const BY_NAME = new Map<string, Command>(Object.entries(DISPATCH));
const USAGE = `usage: grid-guard.js <${Object.values(COMMANDS).join("|")}> … (see the header of this file)`;

/** The command line, parsed; an unknown option is a usage error. */
function parse(): { positionals: string[]; opts: Opts } {
  try {
    const { values: v, positionals } = parseArgs({
      allowPositionals: true,
      strict: true,
      options: {
        owner: { type: "string" },
        pid: { type: "string" },
        registry: { type: "string" },
        ledger: { type: "string" },
        unit: { type: "string" },
        arm: { type: "string" },
        model: { type: "string" },
        seed: { type: "string" },
        attempt: { type: "string" },
        "reserve-sec": { type: "string", default: "21600" },
        allow: { type: "string", multiple: true, default: [] },
        git: { type: "boolean", default: false },
        attached: { type: "boolean", default: false },
        runs: { type: "string" },
        done: { type: "string", default: "done.json" },
      },
    });
    return { positionals, opts: v };
  } catch (e) {
    return refuse(2, `${String(prop(e, "message"))}\n${USAGE}`);
  }
}

function main(): void {
  const { positionals, opts } = parse();
  const [name, ...paths] = positionals;
  const command = BY_NAME.get(String(name));
  if (!command) return refuse(2, USAGE);
  const [required, arity, run] = command;
  const missing = required.filter((k) => opts[k] === undefined);
  const badArity = arity === -1 ? paths.length === 0 : paths.length !== arity;
  if (missing.length || badArity)
    refuse(
      2,
      `${String(name)}: ${missing.length ? `needs --${missing.join(", --")}` : "wrong number of paths"}\n${USAGE}`,
    );
  run(paths, opts);
}

try {
  main();
} catch (e) {
  process.stderr.write(`grid-guard: ${String(prop(e, "message"))}\n`);
  process.exitCode = e instanceof Refusal ? e.exitCode : 1;
}
