#!/usr/bin/env node
// JavaScript, not TypeScript: evidence — the check run on the 2026-11-20 batch, kept as it ran
// except for where it reads the batch from (this folder, not the staging tree) and its one-time
// --backfill migration, removed (every entry and log line now carries source and acceptance);
// formatted by Prettier.
// verify.mjs — checks the sampled papers against the selection rules and prints the report tables.
//   node fixtures/real-papers/accepted/sampling/verify.mjs              the committed batches: the entries of
//                                                                      fixtures/venue-manifest.json that carry a
//                                                                      `field`, their directories beside this
//                                                                      folder, probe-log.jsonl and
//                                                                      staging-notes.json here
//   node fixtures/real-papers/accepted/sampling/verify.mjs --root DIR   a fresh sample.mjs run in DIR
//                                                                      (DIR/papers, DIR/manifest-new.json, ...)
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const rootAt = process.argv.indexOf("--root");
const RUN = rootAt >= 0 ? resolve(process.argv[rootAt + 1]) : null;
const PAPERS = RUN ? join(RUN, "papers") : dirname(HERE);
const RECORD = RUN ?? HERE;
const manifest = RUN
  ? JSON.parse(readFileSync(join(RUN, "manifest-new.json"), "utf8"))
  : JSON.parse(
      readFileSync(resolve(HERE, "../../../venue-manifest.json"), "utf8"),
    ).filter((m) => m.field !== undefined);
const logLines = readFileSync(join(RECORD, "probe-log.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const notes = JSON.parse(
  readFileSync(join(RECORD, "staging-notes.json"), "utf8"),
);

const problems = [];
const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return lstatSync(p).isDirectory() ? walk(p) : [p];
  });
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
for (const m of manifest) {
  const dir = join(PAPERS, m.dir);
  for (const f of [
    "paper.tex",
    "paperlint.json",
    "PIPELINE-STATUS.md",
    "record-by-hand.json",
    "README.md",
  ])
    if (!existsSync(join(dir, f))) problems.push(`${m.arxiv_id}: missing ${f}`);
  if (!existsSync(dir)) continue;
  const text = walk(dir).filter((p) =>
    /\.(tex|bib|bbl|cls|sty|bst|cfg|def)$/.test(p),
  );
  const size = text.reduce((n, p) => n + lstatSync(p).size, 0);
  if (size !== m.size_bytes)
    problems.push(`${m.arxiv_id}: size ${size} != manifest ${m.size_bytes}`);
  if (size > 300000) problems.push(`${m.arxiv_id}: over 300000 bytes`);
  const rec = JSON.parse(
    readFileSync(join(dir, "record-by-hand.json"), "utf8"),
  );
  for (const [f, h] of Object.entries(rec.sha256))
    if (!existsSync(join(dir, f)) || sha(join(dir, f)) !== h)
      problems.push(`${m.arxiv_id}: record hash mismatch ${f}`);
  if (
    !/^https?:\/\/creativecommons\.org\/(licenses\/by(-sa)?\/4\.0|publicdomain\/zero\/1\.0)\/$/.test(
      m.license,
    )
  )
    problems.push(`${m.arxiv_id}: licence ${m.license}`);
  for (const k of ["field", "series", "year", "source", "acceptance"])
    if (m[k] === undefined) problems.push(`${m.arxiv_id}: no ${k}`);
}
const edition = (m) => `${m.series} ${m.year}`;
const byEd = {};
for (const m of manifest) byEd[edition(m)] = (byEd[edition(m)] ?? 0) + 1;
for (const [e, n] of Object.entries(byEd))
  if (n > 5) problems.push(`edition ${e} has ${n} > 5`);

console.log("## kept per field / venue edition");
for (const f of [
  "ml",
  "nlp",
  "ai",
  "security",
  "se",
  "hci",
  "systems",
  "other",
]) {
  const ms = manifest.filter((m) => m.field === f);
  const eds = {};
  for (const m of ms)
    eds[edition(m) + (m.track ? ` (${m.track})` : "")] =
      (eds[edition(m) + (m.track ? ` (${m.track})` : "")] ?? 0) + 1;
  console.log(
    `${f}: ${ms.length} — ${Object.entries(eds)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  );
}
console.log(
  `\ntotal ${manifest.length}; distinct series ${new Set(manifest.map((m) => m.series)).size}`,
);
const fam = (m) =>
  `${m.class}${notes[m.arxiv_id]?.style ? "+" + notes[m.arxiv_id].style.replace(/\d{4}.*|_.*/, "") : ""}`;
console.log(`template families: ${[...new Set(manifest.map(fam))].join(", ")}`);
console.log(
  `presets: ${JSON.stringify(Object.fromEntries([...new Set(manifest.map((m) => m.preset))].map((p) => [p, manifest.filter((m) => m.preset === p).length])))}`,
);
const tally = {};
for (const l of logLines.filter((l) => l.outcome === "rejected")) {
  const k = l.reason
    .replace(/[0-9]+ bytes|\(.*?\)|\[.*?\]|\d{4}/g, "")
    .replace(/"[^"]*"/g, "")
    .trim()
    .slice(0, 70);
  tally[k] = (tally[k] ?? 0) + 1;
}
console.log(
  `\nprobed ${new Set(logLines.map((l) => l.id)).size} distinct ids, ${logLines.length} log lines, kept ${logLines.filter((l) => l.outcome === "kept").length}`,
);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
  console.log(`${v}\t${k}`);
console.log(
  problems.length ? `\nPROBLEMS:\n${problems.join("\n")}` : "\nno problems",
);
