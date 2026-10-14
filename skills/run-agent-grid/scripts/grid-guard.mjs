#!/usr/bin/env node
/**
 * grid-guard.mjs — the checks of the run-agent-grid skill that a driver or a commit hook calls,
 * so that a rule of the skill is a refusal and not a sentence. Node's standard library only.
 *
 *   lock <root> --owner <id> [--pid <pid>]   take the lock on a working-copy root
 *   release <root> --owner <id>              give it back
 *   gate --registry <f> --ledger <f> --unit <u> --arm <a> --model <m> --seed <s>
 *                                            may this cell run now?
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
 * A value that looks like a key is NEVER printed, not even in part: the output of this script
 * goes into logs and transcripts, which are exactly where a leaked key gets committed.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

class Refusal extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const refuse = (code, message) => {
  throw new Refusal(code, message);
};
const say = (line) => process.stdout.write(`${line}\n`);

// ── lock / release ──────────────────────────────────────────────────────────────────────────
// The lock sits BESIDE the root, not inside it: a driver that deletes the root's tree must not
// delete the lock that was supposed to stop it.
const lockPath = (root) => `${resolve(root)}.lock`;

/** Is `pid` a live process on this host? EPERM means it exists and belongs to someone else. */
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== "ESRCH";
  }
};

function lock(root, opts) {
  const path = lockPath(root);
  const me = {
    owner: opts.owner,
    pid: Number(opts.pid ?? process.ppid),
    host: hostname(),
    at: new Date().toISOString(),
  };
  const take = () => {
    try {
      writeFileSync(path, `${JSON.stringify(me)}\n`, { flag: "wx" });
      return true;
    } catch (e) {
      if (e.code === "EEXIST") return false;
      throw e;
    }
  };
  if (take()) return say(`locked ${path} for ${me.owner} (pid ${me.pid})`);
  const held = JSON.parse(readFileSync(path, "utf8"));
  // A holder is stale only when it provably is: same host, and its process is gone. A lock from
  // another host cannot be judged from here, so it is never taken over.
  const stale = held.host === me.host && !alive(held.pid);
  if (stale) rmSync(path, { force: true });
  if (stale && take())
    return say(
      `took over a stale lock on ${path} (holder ${held.owner}, pid ${held.pid}, is gone)`,
    );
  return refuse(
    1,
    `${path} is held by ${held.owner} (pid ${held.pid} on ${held.host} since ${held.at}). ` +
      `Wait for it, or give this driver its own working-copy root.`,
  );
}

function release(root, opts) {
  const path = lockPath(root);
  if (!existsSync(path)) refuse(1, `${path} is not held`);
  const held = JSON.parse(readFileSync(path, "utf8"));
  if (held.owner !== opts.owner)
    refuse(1, `${path} is held by ${held.owner}, not ${opts.owner}`);
  rmSync(path);
  say(`released ${path}`);
}

// ── the attempt ledger ──────────────────────────────────────────────────────────────────────
/**
 * The ledger is JSON lines; a driver appends one line when an attempt starts and one when it
 * ends, both carrying the same `attempt` id. Later lines add to earlier ones, so a crashed
 * attempt is still on record — with a start and no end.
 */
function readLedger(path) {
  if (!existsSync(path)) return [];
  const byId = new Map();
  readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .forEach((line) => {
      const rec = JSON.parse(line);
      byId.set(rec.attempt, { ...byId.get(rec.attempt), ...rec });
    });
  return [...byId.values()];
}

const sameCell = (a, b) =>
  ["unit", "arm", "model"].every((k) => a[k] === b[k]) &&
  String(a.seed) === String(b.seed);

// ── gate ────────────────────────────────────────────────────────────────────────────────────
/** The registry as COMMITTED: a declaration that exists only in the working tree allows nothing. */
function committedRegistry(file) {
  const abs = resolve(file);
  const git = (...args) =>
    spawnSync("git", ["-C", dirname(abs), ...args], { encoding: "utf8" });
  const top = git("rev-parse", "--show-toplevel");
  if (top.status !== 0)
    refuse(1, `${file} is not inside a git repository; the registry must be committed`);
  const rel = relative(top.stdout.trim(), abs).split(sep).join("/");
  const head = git("show", `HEAD:${rel}`);
  if (head.status !== 0)
    refuse(1, `${file} is not committed; commit it before any run it allows`);
  if (head.stdout !== readFileSync(abs, "utf8"))
    refuse(
      1,
      `${file} differs from its committed version; commit the change (a dated addendum) before any run it allows`,
    );
  return JSON.parse(head.stdout);
}

const filled = (v) => typeof v === "string" && v.trim() !== "";
const list = (v) => (Array.isArray(v) ? v : []);

function gate(opts) {
  const reg = committedRegistry(opts.registry);
  const cell = {
    unit: opts.unit,
    arm: opts.arm,
    model: opts.model,
    seed: opts.seed,
  };
  const unit = list(reg.units).find((u) => u.id === cell.unit);
  const model = list(reg.models).find((m) => m.id === cell.model);
  const smoke = model?.smoke ?? {};
  const smoked =
    typeof smoke.timeoutSec === "number" && typeof smoke.costPerRun === "number";
  const counted = unit?.role === "counted";
  const approval = unit?.approval ?? {};
  const proof = unit?.proof ?? {};
  const ledger = readLedger(opts.ledger);
  const spent = ledger.reduce((sum, r) => sum + (Number(r.cost) || 0), 0);
  const cap = reg.budget?.cap;
  const next = counted && smoked ? smoke.costPerRun : 0;

  const problems = [
    [!unit, `unit "${cell.unit}" is not in the registry`],
    [
      unit && !["counted", "smoke"].includes(unit.role),
      `unit "${cell.unit}" has role "${unit?.role}"${filled(unit?.reason) ? ` (${unit.reason})` : ""}; only "counted" and "smoke" units run`,
    ],
    [!list(reg.arms).includes(cell.arm), `arm "${cell.arm}" is not declared`],
    [!model, `model "${cell.model}" is not declared`],
    [
      !list(reg.seeds).map(String).includes(String(cell.seed)),
      `seed "${cell.seed}" is not declared`,
    ],
    [
      list(reg.units).some((u) => u.role === "excluded" && !filled(u.reason)),
      `an excluded unit has no reason`,
    ],
    [typeof cap !== "number", `the registry declares no budget.cap`],
    [
      counted && !(filled(reg.author) && approval.by === reg.author && filled(approval.at) && filled(approval.channel)),
      `unit "${cell.unit}" has no approval by the author (approval.by = author, with at and channel)`,
    ],
    [
      counted && !(proof.toolVisible === true && proof.firesOnPinned === true && proof.acceptsReference === true),
      `unit "${cell.unit}" has no sandbox proof (toolVisible, firesOnPinned, acceptsReference)`,
    ],
    [counted && !filled(reg.draw?.seed?.toString()), `the registry records no draw seed`],
    [
      counted && model && !smoked,
      `model "${cell.model}" has no smoke result (smoke.timeoutSec, smoke.costPerRun)`,
    ],
    [
      typeof cap === "number" && spent + next > cap,
      `budget: spent ${spent} + next ${next} exceeds the cap ${cap}`,
    ],
  ]
    .filter(([bad]) => bad)
    .map(([, why]) => why);

  if (problems.length)
    refuse(1, `refused ${JSON.stringify(cell)}:\n  - ${problems.join("\n  - ")}`);
  if (ledger.some((r) => r.status === "complete" && sameCell(r, cell)))
    refuse(3, `${JSON.stringify(cell)} is already counted; skip it`);
  say(
    JSON.stringify({
      allowed: true,
      cell,
      counted,
      timeoutSec: smoked ? smoke.timeoutSec : null,
      spent,
    }),
  );
}

// ── overlap ─────────────────────────────────────────────────────────────────────────────────
function overlap(file) {
  if (!existsSync(file)) refuse(1, `no ledger at ${file}`);
  const recs = readLedger(file).map((r) => ({
    ...r,
    root: resolve(String(r.root)),
    from: Date.parse(r.start),
    to: r.end === undefined ? Infinity : Date.parse(r.end),
  }));
  const undated = recs.filter((r) => Number.isNaN(r.from) || Number.isNaN(r.to));
  const pairs = recs.flatMap((a, i) =>
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
  const findings = [
    ...undated.map((r) => `${r.attempt}: start or end is not a date`),
    ...pairs,
  ];
  if (findings.length)
    refuse(
      1,
      `${findings.join("\n")}\nmark each contaminated attempt "harness-error" (keep it) and run the cell again`,
    );
  say(`no overlap among ${recs.length} attempts`);
}

// ── env-probe ───────────────────────────────────────────────────────────────────────────────
const SECRET_NAME = /KEY|TOKEN|SECRET|PASSW|CREDENTIAL|COOKIE|SESSION|AUTH/i;

function envProbe(opts) {
  const allowed = new Set(opts.allow);
  const names = Object.keys(process.env)
    .filter((n) => SECRET_NAME.test(n) && !allowed.has(n))
    .sort();
  if (names.length)
    refuse(
      1,
      `secret-named variables reach this environment (names only): ${names.join(", ")}`,
    );
  if (opts.git) gitProbe();
  say(
    `no secret-named variables${opts.git ? "; git init, add and commit work" : ""}`,
  );
}

/** The policy that drops secrets must not drop what the agent's tools need: prove git commits. */
function gitProbe() {
  const dir = mkdtempSync(join(tmpdir(), "grid-git-probe-"));
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
          `git ${args[0]} fails in this environment: ${(r.stderr || String(r.error)).trim()}`,
        );
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── scan-keys / precommit ───────────────────────────────────────────────────────────────────
// Shapes, not vendors: each names a FORM a credential takes. The last one catches an
// environment dump — NAME=value lines — which is how secrets got into transcripts.
const KEY_SHAPES = [
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["access key id", /\bAKIA[0-9A-Z]{16}\b/],
  ["git host token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/],
  ["chat bot token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["cloud api key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["sk- api key", /\bsk-[A-Za-z0-9_-]{20,}/],
  [
    "secret-named assignment",
    /\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSW(?:OR)?D)[A-Z0-9_]*["']?\s*[=:]\s*["']?(?![<$])[^\s"'<>]{12,}/,
  ],
];

/** `file:line: shape` for every key-shaped string in `text`; the value is never part of it. */
const scanText = (name, text) =>
  text.includes("\0")
    ? []
    : text.split("\n").flatMap((line, i) =>
        KEY_SHAPES.filter(([, re]) => re.test(line)).map(
          ([shape]) => `${name}:${i + 1}: ${shape}`,
        ),
      );

const SKIP_DIRS = new Set([".git", "node_modules"]);
const walk = (path) =>
  statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((e) => !SKIP_DIRS.has(e))
        .flatMap((e) => walk(join(path, e)))
    : [path];

function reportKeys(findings, scanned) {
  if (findings.length)
    refuse(
      1,
      `key-shaped strings (values not shown):\n${findings.join("\n")}`,
    );
  say(`no key-shaped strings in ${scanned} files`);
}

function scanKeys(paths) {
  const files = paths.flatMap(walk);
  reportKeys(
    files.flatMap((f) => scanText(f, readFileSync(f, "utf8"))),
    files.length,
  );
}

function precommit(opts) {
  const git = (...args) => {
    const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });
    if (r.status !== 0) refuse(1, `git ${args[0]}: ${r.stderr.trim()}`);
    return r.stdout;
  };
  const top = git("rev-parse", "--show-toplevel").trim();
  const z = (s) => s.split("\0").filter(Boolean);
  const staged = z(
    git("-C", top, "diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"),
  );
  const keys = staged.flatMap((f) => scanText(f, git("-C", top, "show", `:${f}`)));
  const runs = opts.runs?.replace(/\/+$/, "");
  const index = new Set(z(git("-C", top, "ls-files", "-z")));
  const halfWritten = runs
    ? [
        ...new Set(
          staged
            .filter((f) => f.startsWith(`${runs}/`))
            .map((f) => f.slice(runs.length + 1).split("/"))
            .filter((parts) => parts.length > 1)
            .map((parts) => `${runs}/${parts[0]}`),
        ),
      ].filter((dir) => !index.has(`${dir}/${opts.done}`))
    : [];
  if (halfWritten.length)
    refuse(
      1,
      `run folders without ${opts.done} are staged (commit only finished runs):\n${halfWritten.join("\n")}`,
    );
  reportKeys(keys, staged.length);
}

// ── command line ────────────────────────────────────────────────────────────────────────────
const OPTIONS = {
  owner: { type: "string" },
  pid: { type: "string" },
  registry: { type: "string" },
  ledger: { type: "string" },
  unit: { type: "string" },
  arm: { type: "string" },
  model: { type: "string" },
  seed: { type: "string" },
  allow: { type: "string", multiple: true, default: [] },
  git: { type: "boolean", default: false },
  runs: { type: "string" },
  done: { type: "string", default: "done.json" },
};

/** Each command: the options it requires, how many paths it takes, and what it does. */
const COMMANDS = {
  lock: [["owner"], 1, (p, o) => lock(p[0], o)],
  release: [["owner"], 1, (p, o) => release(p[0], o)],
  gate: [["registry", "ledger", "unit", "arm", "model", "seed"], 0, (_, o) => gate(o)],
  overlap: [[], 1, (p) => overlap(p[0])],
  "env-probe": [[], 0, (_, o) => envProbe(o)],
  "scan-keys": [[], -1, (p) => scanKeys(p)],
  precommit: [[], 0, (_, o) => precommit(o)],
};

const USAGE = `usage: grid-guard.mjs <${Object.keys(COMMANDS).join("|")}> … (see the header of this file)`;

try {
  const { values, positionals } = (() => {
    try {
      return parseArgs({ options: OPTIONS, allowPositionals: true, strict: true });
    } catch (e) {
      return refuse(2, `${e.message}\n${USAGE}`);
    }
  })();
  const [name, ...paths] = positionals;
  const command = COMMANDS[name];
  if (!command) refuse(2, USAGE);
  const [required, arity, run] = command;
  const missing = required.filter((k) => values[k] === undefined);
  const badArity = arity === -1 ? paths.length === 0 : paths.length !== arity;
  if (missing.length || badArity)
    refuse(
      2,
      `${name}: ${missing.length ? `needs --${missing.join(", --")}` : "wrong number of paths"}\n${USAGE}`,
    );
  run(paths, values);
} catch (e) {
  process.stderr.write(`grid-guard: ${e.message}\n`);
  process.exitCode = e instanceof Refusal ? e.code : 1;
}
