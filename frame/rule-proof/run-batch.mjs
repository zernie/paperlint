// The run around run.mjs's per-item work: which items each matrix job runs, and the run's own folder of results. Node's
// own modules only, so a job that installs nothing (the commit job, which holds the write token) can use it too.
//
// GitHub runs at most 256 matrix jobs in one workflow run, and bills every job rounded up to the minute. One job per
// item cannot run past 256 items, and paid a minute (plus about 20 s of setup) for an item that took 2 s. So the items are
// split into batches, one matrix job each: items of one Node version per batch, at most BATCH_ITEMS items in a batch
// while that keeps the run within MAX_JOBS jobs, and larger batches beyond that, so a run of any size plans.
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
