// The run around run.mjs's per-item work: which items each matrix job runs. Node's own modules only, so a job that
// installs nothing (the commit job, which holds the write token) can use it too.
//
// GitHub runs at most 256 matrix jobs in one workflow run, and bills every job rounded up to the minute. One job per
// item failed at 257 items and paid a minute (plus about 20 s of setup) for an item that took 2 s. So the items are
// split into batches, one matrix job each: items of one Node version per batch, at most BATCH_ITEMS items in a batch
// while that keeps the run within MAX_JOBS jobs, and larger batches beyond that, so a run of any size plans.

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
