// The run around run.mjs's per-item work: which items each matrix job runs, and the run's own folder of results. Node's
// own modules only, so a job that installs nothing (the commit job, which holds the write token) can use it too.
//
// GitHub runs at most 256 matrix jobs in one workflow run, and bills every job rounded up to the minute. One job per
// item cannot run past 256 items, and paid a minute (plus about 20 s of setup) for an item that took 2 s. So the items are
// split into batches, one matrix job each: items of one Node version per batch, at most BATCH_ITEMS items in a batch
// while that keeps the run within MAX_JOBS jobs, and larger batches beyond that, so a run of any size plans.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

export const MAX_JOBS = 256;
export const BATCH_ITEMS = 25;

const byNode = (a, b) => a.localeCompare(b, "en", { numeric: true });

// items (inputs.json) -> [{ batch, node, items: "i,j,k" }]: the plan job's matrix. Within one Node version, the items
// in input order, cut into batches whose sizes differ by at most one.
export function planOf(items, { batchItems = BATCH_ITEMS, maxJobs = MAX_JOBS } = {}) {
  const groups = new Map();
  items.forEach((it, index) => {
    const node = String(it.node ?? "22");
    if (!groups.has(node)) groups.set(node, []);
    groups.get(node).push(index);
  });
  if (groups.size > maxJobs) throw new Error(`${groups.size} Node versions need more than ${maxJobs} jobs`);
  const jobsAt = (size) => [...groups.values()].reduce((n, g) => n + Math.ceil(g.length / size), 0);
  // the smallest batch size from batchItems up that keeps the run within maxJobs (jobsAt only falls as size grows)
  let size = batchItems;
  if (jobsAt(size) > maxJobs) {
    let lo = size, hi = Math.max(size, items.length);
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (jobsAt(mid) > maxJobs) lo = mid + 1; else hi = mid; }
    size = lo;
  }
  return [...groups.keys()].sort(byNode).flatMap((node) => {
    const g = groups.get(node);
    const k = Math.ceil(g.length / size);
    const base = Math.floor(g.length / k), extra = g.length % k;
    return Array.from({ length: k }, (_, j) => {
      const from = j * base + Math.min(j, extra);
      return { node, items: g.slice(from, from + base + (j < extra ? 1 : 0)).join(",") };
    });
  }).map((b, batch) => ({ batch, ...b }));
}

// "--items 3,4,5" -> [3, 4, 5]; anything else is refused.
export function itemsArg(text, count) {
  const ids = String(text ?? "").split(",").map((s) => (/^\d+$/.test(s) ? Number(s) : NaN));
  if (!ids.length || ids.some((i) => !Number.isInteger(i) || i >= count)) throw new Error(`--items ${text}: indices of inputs.json (0..${count - 1}), comma-separated`);
  return ids;
}

// ---- One folder per run ---------------------------------------------------------------------------------------------
// Every result of a run goes into <out>/<run key>/, the key being the Actions run id and attempt ("41852334655-1"). An
// item counts as done only by a result in that folder, so a run never reads, skips on, or overwrites another run's
// result; results of runs before run folders sit flat in <out>/ and are never "done" for a new run.
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export function runDirOf(outDir, key) {
  if (typeof key !== "string" || !NAME.test(key) || key.includes("..")) throw new Error(`run key ${JSON.stringify(key)}: letters, digits, '.', '_', '-'`);
  return path.join(outDir, key);
}
const checkedId = (id) => { if (typeof id !== "string" || !NAME.test(id) || id.includes("..")) throw new Error(`item id ${JSON.stringify(id)} is not a file name`); return id; };
export const resultPath = (dir, id) => path.join(dir, `${checkedId(id)}.json.gz`);

// A result file: <id>.json.gz, the JSON gzipped, written whole or not at all (a temporary file renamed); readers also
// take a plain .json (earlier runs).
export function writeResult(dir, id, result) {
  const file = resultPath(dir, id), tmp = `${file}.tmp`;
  writeFileSync(tmp, gzipSync(JSON.stringify(result, null, 1) + "\n"));
  renameSync(tmp, file);
  return file;
}
export function readResult(file) {
  const raw = readFileSync(file);
  return JSON.parse((file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8"));
}
export const isDone = (runDir, id) => existsSync(resultPath(runDir, id));

// ---- One batch: each item in a worker process, stopped by the runner before the job's own timeout ----------------------
// A job killed at its `timeout-minutes` uploads nothing of the item it was on. So every item runs in a worker process
// (run.mjs --worker) of its own process group, which the runner kills at the item's limit: the smaller of the item limit
// and what is left before the run step's deadline. The runner then writes the item's result itself: what the worker had
// reached (its progress file, written after each phase), and `ended` saying it stopped at the limit. An item the
// deadline leaves no time for is not started, and gets a result saying so; a worker that exits without a result gets
// one saying it crashed. Every item of a batch leaves a result file.
//   ended: { outcome: finished | timeout | crashed, cause: null | "timeout" | "unknown", phase, seconds, limit_seconds, detail? }
//   phase: where the item was: not-started, clone, install, readings, cross, done.
export const PHASES = ["not-started", "clone", "install", "readings", "cross", "done"];
const partialPath = (runDir, id) => path.join(runDir, ".partial", `${checkedId(id)}.json`);
// The worker's progress: the result so far, after each phase (the runner reads it when it stops the item).
export function writePartial(runDir, id, phase, result) {
  const file = partialPath(runDir, id), tmp = `${file}.tmp`;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(tmp, JSON.stringify({ phase, result }));
  renameSync(tmp, file);
}
const readPartial = (runDir, id) => { try { return JSON.parse(readFileSync(partialPath(runDir, id), "utf8")); } catch { return null; } };

// The install stage a stopped item's install record names: the phase it was in (not-started, clone, or install when the
// runner cannot see which step of the install it was on).
const STAGE_OF = { "not-started": "not-started", clone: "clone" };
export function stoppedResult(item, partial, ended, runner) {
  const base = { id: item.id, repo: item.repo, sha: item.sha, checked_out: null, linter: item.linter, rule: item.rule, ...(partial?.result ?? {}), runner };
  const install = base.install ?? { outcome: "not-installed", path: null, version: null, versions: {}, plugins: {}, adjustments: [],
    attempts: [{ path: "as-designed", outcome: "not-installed", failure: { stage: STAGE_OF[ended.phase] ?? "install", cause: ended.cause, detail: ended.detail } }] };
  return { ...base, install, ended, seconds: ended.seconds };
}

// Run argv as its own process group; at `ms` kill the whole group. Also kills what the group left behind after a normal
// exit (a daemon an item's code started must not outlive its item). -> { code, signal, timedOut, stderr }
export function spawnWithLimit(argv, ms) {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: ["ignore", "inherit", "pipe"] });
    let stderr = "", timedOut = false;
    child.stderr.on("data", (d) => { process.stderr.write(d); stderr = (stderr + d).slice(-4000); });
    const killGroup = () => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* the group is gone */ } };
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, ms);
    child.on("error", (e) => { clearTimeout(timer); resolve({ code: null, signal: null, timedOut, stderr: String(e) }); });
    child.on("exit", (code, signal) => { clearTimeout(timer); killGroup(); child.stderr.destroy(); resolve({ code, signal, timedOut, stderr }); });
  });
}

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const tail = (t) => String(t ?? "").trim().split("\n").slice(-6).join("\n").slice(0, 600);

// items: inputs.json; indices: this batch's; argv(item, limitSeconds, runner, index): the worker's command; deadlineAt: epoch
// ms by which the batch must be done; validate(result) throws on a result not to be written as is.
// -> { results: [{ id, file, sha256, ended }], mismatched: [result files changed after the runner recorded them] }
export async function runBatch({ items, indices, runDir, runner, argv, itemSeconds, deadlineAt, validate = () => {}, minSeconds = 30, log = console.log }) {
  mkdirSync(runDir, { recursive: true });
  const results = [];
  const write = (item, partial, ended) => {
    const withPartial = stoppedResult(item, partial, ended, runner);
    let r = withPartial;
    try { validate(r); } catch { r = stoppedResult(item, { result: { ...partial?.result, install: undefined } }, ended, runner); validate(r); }
    return writeResult(runDir, item.id, r);
  };
  for (const index of indices) {
    const item = items[index];
    if (isDone(runDir, item.id)) { log(`skip ${item.id} (done in this run)`); }
    else {
      const left = Math.floor((deadlineAt - Date.now()) / 1000);
      const limit = Math.min(itemSeconds, left);
      if (left < minSeconds) {
        write(item, null, { outcome: "timeout", cause: "timeout", phase: "not-started", seconds: 0, limit_seconds: Math.max(0, left),
          detail: `not started: ${Math.max(0, left)} s were left before the run step's deadline, under the ${minSeconds} s an item is given at least` });
      } else {
        const t0 = Date.now();
        const r = await spawnWithLimit(argv(item, limit, runner, index), limit * 1000);
        const seconds = (Date.now() - t0) / 1000;
        const partial = readPartial(runDir, item.id);
        const phase = partial?.phase ?? "not-started";
        if (r.timedOut) {
          write(item, partial, { outcome: "timeout", cause: "timeout", phase, seconds, limit_seconds: limit,
            detail: `the runner stopped the item at its limit of ${limit} s, in phase ${phase}` });
        } else if (!isDone(runDir, item.id)) {
          write(item, partial, { outcome: "crashed", cause: "unknown", phase, seconds, limit_seconds: limit,
            detail: `the worker exited ${r.code ?? r.signal} (exit ${r.code ?? "none"}) without a result: ${tail(r.stderr)}` });
        }
      }
    }
    const file = resultPath(runDir, item.id);
    const r = readResult(file);
    results.push({ id: item.id, file: path.basename(file), sha256: sha256(readFileSync(file)), ended: r.ended ?? null });
    log(`${item.id} ${results.at(-1).ended?.outcome ?? "?"} sha256 ${results.at(-1).sha256}`);
  }
  rmSync(path.join(runDir, ".partial"), { recursive: true, force: true });
  for (const f of readdirSync(runDir).filter((f) => f.endsWith(".tmp"))) rmSync(path.join(runDir, f), { force: true });
  // The sha256 each result had when the runner recorded it is in the job's log; a later item of the batch (its code runs
  // as the same user) changing an earlier result is reported here.
  const mismatched = results.filter((x) => { try { return sha256(readFileSync(path.join(runDir, x.file))) !== x.sha256; } catch { return true; } }).map((x) => x.file);
  for (const f of mismatched) log(`CHANGED after it was written: ${f}`);
  return { results, mismatched };
}

// The commit job's check of one run's folder before anything is committed: every file is a result of an item of
// inputs.json (<id>.json.gz), and every result names this run and the repository and commit inputs.json gives for its
// item. -> { errors: ["<file>: why"], missing: [ids with no result] }
export function closeRun(items, runDir, key) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const files = existsSync(runDir) ? readdirSync(runDir).sort() : [];
  const errors = files.flatMap((f) => {
    const id = f.endsWith(".json.gz") ? f.slice(0, -".json.gz".length) : null;
    if (id === null || !byId.has(id)) return [`${f}: not a result of an item of inputs.json`];
    let r;
    try { r = readResult(path.join(runDir, f)); } catch (e) { return [`${f}: unreadable (${e.message})`]; }
    const it = byId.get(id);
    return [
      ...(r.runner?.run === key ? [] : [`${f}: run ${JSON.stringify(r.runner?.run)}, not ${key}`]),
      ...(r.id === id ? [] : [`${f}: id ${JSON.stringify(r.id)}`]),
      ...(r.repo === it.repo ? [] : [`${f}: repo ${JSON.stringify(r.repo)}, inputs.json names ${it.repo}`]),
      ...(r.sha === it.sha && (r.checked_out == null || r.checked_out === it.sha) ? [] : [`${f}: sha ${JSON.stringify(r.checked_out ?? r.sha)}, inputs.json names ${it.sha}`]),
    ];
  });
  return { errors, missing: items.map((it) => it.id).filter((id) => !files.includes(`${id}.json.gz`)) };
}

//   node run-batch.mjs --close <inputs.json> <run folder> <run key>   exit 1 when the folder holds anything else
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname && process.argv[2] === "--close") {
  const [, , , inputs, runDir, key] = process.argv;
  const { errors, missing } = closeRun(JSON.parse(readFileSync(inputs, "utf8")), runDir, key);
  for (const e of errors) console.log(`refused ${e}`);
  console.log(`run ${key}: ${missing.length} item(s) without a result${missing.length ? `: ${missing.join(", ")}` : ""}`);
  process.exit(errors.length ? 1 : 0);
}
