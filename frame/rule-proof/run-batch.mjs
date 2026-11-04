// The run around run.mjs's per-item work: which items each matrix job runs, and the run's own folder of results. Node's
// own modules only, so a job that installs nothing (the commit job, which holds the write token) can use it too.
//
// GitHub runs at most 256 matrix jobs in one workflow run, and bills every job rounded up to the minute. One job per
// item cannot run past 256 items, and paid a minute (plus about 20 s of setup) for an item that took 2 s. So the items are
// split into batches, one matrix job each: items of one Node version per batch, at most BATCH_ITEMS items in a batch
// while that keeps the run within MAX_JOBS jobs, and larger batches beyond that, so a run of any size plans.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

// The format of a result file (install-schema.mjs resultSchema). 4: the first with a top-level `format`, and with `runner`,
// `ended` and `kept`; results without one are formats 1 to 3 (resultFormatOf).
export const RESULT_FORMAT = 4;
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

// ---- What the work dir held, kept next to the result -------------------------------------------------------------------
// The work dir is deleted after each item. What the item's own commit cannot give back is kept in <id>.kept.json.gz:
// the manifest and the lockfile npm resolved on our own install paths, .npmrc, uv's resolution for a date-matched Ruff,
// and the config each reading wrote. A file the repository holds unchanged at its commit (its own lockfile, as
// designed) is recorded by size and sha256 only: git holds it.
// entries: [{ kind: lockfile | manifest | config, path, key?, in_repo, store, buf }] -> the result's `kept`:
//   { file: "<id>.kept.json.gz" | null, entries: [{ kind, path, key?, in_repo, stored, bytes, sha256 }] }
export const keptPath = (dir, id) => path.join(dir, `${checkedId(id)}.kept.json.gz`);
export function writeKept(dir, id, entries) {
  const stored = entries.filter((e) => e.store);
  const record = entries.map(({ kind, path: p, key, in_repo, store, buf }) => ({ kind, path: p, ...(key === undefined ? {} : { key }), in_repo, stored: store, bytes: buf.length, sha256: sha256(buf) }));
  if (!stored.length) { rmSync(keptPath(dir, id), { force: true }); return { file: null, entries: record }; }
  const file = keptPath(dir, id), tmp = `${file}.tmp`;
  writeFileSync(tmp, gzipSync(JSON.stringify({ id, files: stored.map(({ kind, path: p, key, buf }) => ({ kind, path: p, ...(key === undefined ? {} : { key }), text: buf.toString("utf8") })) }) + "\n"));
  renameSync(tmp, file);
  return { file: path.basename(file), entries: record };
}
export const readKept = (file) => JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));

// The runner itself: the commit of the code that ran (git, where this module is; `dirty` when tracked files there
// differ from it), the Actions run id and attempt (null outside Actions, never invented), and the batch.
const HERE = path.dirname(fileURLToPath(import.meta.url));
export function runnerRecord(env, key, batch) {
  const gitHere = (...args) => { try { return execFileSync("git", ["-C", HERE, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
  const runId = env.GITHUB_RUN_ID ?? null, attempt = env.GITHUB_RUN_ATTEMPT ?? null;
  if (runId !== null && key !== `${runId}-${attempt}`) throw new Error(`run key ${key} is not this Actions run's ${runId}-${attempt}`);
  const status = gitHere("status", "--porcelain", "--untracked-files=no", "--", ".");
  return { run: key, repo: env.GITHUB_REPOSITORY ?? null, sha: gitHere("rev-parse", "HEAD"), dirty: status === null ? null : status !== "", run_id: runId, run_attempt: attempt, batch };
}

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
  const base = { format: RESULT_FORMAT, id: item.id, repo: item.repo, sha: item.sha, checked_out: null, linter: item.linter, rule: item.rule,
    kept: { file: null, entries: [] }, ...(partial?.result ?? {}), runner };
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
// -> { results: [{ id, file, sha256, ended }], mismatched: [files changed after the runner recorded them, put back] }
export async function runBatch({ items, indices, runDir, runner, argv, itemSeconds, deadlineAt, validate = () => {}, minSeconds = 30, log = console.log }) {
  mkdirSync(runDir, { recursive: true });
  const results = [];
  // A later item's code runs as the same user and could change an earlier item's files. After each item and at the end,
  // every file the runner recorded (its sha256 is in the job's log) is compared with the runner's own copy, and a changed
  // one is put back from that copy and reported, so a changed file never reaches the commit.
  const mismatched = new Set();
  const checkOwn = (when) => {
    for (const { own } of results) {
      for (const { file, buf } of own) {
        let now = null;
        try { now = readFileSync(path.join(runDir, file)); } catch { now = null; }
        if (now !== null && sha256(now) === sha256(buf)) continue;
        mismatched.add(file);
        writeFileSync(path.join(runDir, file), buf);
        log(`CHANGED after it was written, ${when}: ${file}; put back as written (sha256 ${sha256(buf)})`);
      }
    }
  };
  // The stopped item's result: from its progress, else from its progress without the install record, else from inputs.json
  // alone; the first that validates. If none does (a defect of the runner), the last is written anyway and says so: an
  // item never goes without a result.
  const write = (item, partial, ended) => {
    const tries = [partial, partial && { ...partial, result: { ...partial.result, install: undefined } }, null].filter((p, i) => i === 2 || p)
      .map((p) => stoppedResult(item, p, ended, runner));
    const good = tries.find((r) => { try { validate(r); return true; } catch { return false; } });
    if (!good) log(`${item.id}: the runner's own result does not validate; written as it is`);
    return writeResult(runDir, item.id, good ?? tries.at(-1));
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
        // a result the worker wrote (renamed into place whole) stands, even when the worker then ran past its limit
        if (isDone(runDir, item.id)) { /* the worker's own result */ }
        else if (r.timedOut) {
          write(item, partial, { outcome: "timeout", cause: "timeout", phase, seconds, limit_seconds: limit,
            detail: `the runner stopped the item at its limit of ${limit} s, in phase ${phase}` });
        } else {
          write(item, partial, { outcome: "crashed", cause: "unknown", phase, seconds, limit_seconds: limit,
            detail: `the worker exited ${r.code ?? r.signal} (exit ${r.code ?? "none"}) without a result: ${tail(r.stderr)}` });
        }
      }
    }
    const file = resultPath(runDir, item.id);
    const r = readResult(file);
    // the runner's own copy of the item's files as they stand now (the worker's process group is gone)
    const own = [file, ...(r.kept?.file ? [path.join(runDir, r.kept.file)] : [])].map((f) => ({ file: path.basename(f), buf: readFileSync(f) }));
    results.push({ id: item.id, file: path.basename(file), sha256: sha256(own[0].buf), ended: r.ended ?? null, own });
    log(`${item.id} ${results.at(-1).ended?.outcome ?? "?"} sha256 ${results.at(-1).sha256}`);
    checkOwn(`after ${item.id}`);
  }
  rmSync(path.join(runDir, ".partial"), { recursive: true, force: true });
  for (const f of readdirSync(runDir).filter((f) => f.endsWith(".tmp"))) rmSync(path.join(runDir, f), { force: true });
  checkOwn("at the end of the batch");
  return { results: results.map(({ own: _o, ...x }) => x), mismatched: [...mismatched] };
}

// The commit job's check of one run's folder before anything is committed: every file is a result of an item of
// inputs.json (<id>.json.gz), and every result names this run and the repository and commit inputs.json gives for its
// item, and every sidecar (<id>.kept.json.gz) holds what its result records. -> { errors: ["<file>: why"], missing: [ids] }
export function closeRun(items, runDir, key) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const files = existsSync(runDir) ? readdirSync(runDir).sort() : [];
  const results = new Map();
  const errors = files.filter((f) => !f.endsWith(".kept.json.gz")).flatMap((f) => {
    const id = f.endsWith(".json.gz") ? f.slice(0, -".json.gz".length) : null;
    if (id === null || !byId.has(id)) return [`${f}: not a result of an item of inputs.json`];
    let r;
    try { r = readResult(path.join(runDir, f)); } catch (e) { return [`${f}: unreadable (${e.message})`]; }
    results.set(id, r);
    const it = byId.get(id);
    return [
      ...keptErrors(f, r, runDir),
      ...(r.runner?.run === key ? [] : [`${f}: run ${JSON.stringify(r.runner?.run)}, not ${key}`]),
      ...(r.id === id ? [] : [`${f}: id ${JSON.stringify(r.id)}`]),
      ...(r.repo === it.repo ? [] : [`${f}: repo ${JSON.stringify(r.repo)}, inputs.json names ${it.repo}`]),
      ...(r.sha === it.sha && (r.checked_out == null || r.checked_out === it.sha) ? [] : [`${f}: sha ${JSON.stringify(r.checked_out ?? r.sha)}, inputs.json names ${it.sha}`]),
    ];
  });
  // a sidecar is kept only beside the result that names it
  const orphans = files.filter((f) => f.endsWith(".kept.json.gz") && results.get(f.slice(0, -".kept.json.gz".length))?.kept?.file !== f)
    .map((f) => `${f}: no result of this run names it`);
  return { errors: [...errors, ...orphans], missing: items.map((it) => it.id).filter((id) => !files.includes(`${id}.json.gz`)) };
}
// A result's sidecar: there when the result names it, and every stored text with the sha256 the result records.
function keptErrors(f, r, runDir) {
  if (!r.kept?.file) return [];
  let side;
  try { side = readKept(path.join(runDir, r.kept.file)); } catch (e) { return [`${f}: kept ${r.kept.file} unreadable (${e.message})`]; }
  const want = r.kept.entries.filter((e) => e.stored);
  const ok = side.files.length === want.length && want.every((e, i) => side.files[i].path === e.path && sha256(Buffer.from(side.files[i].text, "utf8")) === e.sha256);
  return ok ? [] : [`${f}: kept ${r.kept.file} does not hold the files the result records`];
}

//   node run-batch.mjs --close <inputs.json> <run folder> <run key>   exit 1 when the folder holds anything else
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === "--close") {
  const [, , , inputs, runDir, key] = process.argv;
  const { errors, missing } = closeRun(JSON.parse(readFileSync(inputs, "utf8")), runDir, key);
  for (const e of errors) console.log(`refused ${e}`);
  console.log(`run ${key}: ${missing.length} item(s) without a result${missing.length ? `: ${missing.join(", ")}` : ""}`);
  process.exit(errors.length ? 1 : 0);
}
