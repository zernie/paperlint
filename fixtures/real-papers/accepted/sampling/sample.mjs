#!/usr/bin/env node
// JavaScript, not TypeScript: evidence — the collector of the 2026-11-20 batch, kept as it ran
// except for the paths (--root, --base, --paperlint) and two fallbacks that hid a failed git call;
// formatted by Prettier; its tested TypeScript rewrite is a later change.
// sample.mjs — repeatable sampler of accepted, peer-reviewed arXiv papers for paperlint fixtures.
//
//   node fixtures/real-papers/accepted/sampling/sample.mjs --root DIR [queries.json] [--only ml,nlp]
//        [--budget-seconds 540] [--deadline ISO] [--base REF] [--paperlint DIR] [--rejudge]
//
// Reads a query list (queries.json: quotas per field, one slot per venue edition with its exact
// arXiv API search strings), and for every slot WALKS THE SEARCH RESULTS IN ORDER, applying the
// selection rules to each candidate; the first passing ones are kept. Nothing is picked by hand.
//
//   rule 1  comment/journal-ref states acceptance (wording regexes below); not a workshop/poster/
//           extended version/submitted/under review
//   rule 2  OAI-PMH <license> is exactly CC BY 4.0, CC BY-SA 4.0 or CC0
//   rule 3  first \documentclass (and for ML/NLP/AI the style package) is the venue's template
//   rule 4  text sources (tex/bib/bbl/cls/sty/bst/cfg/def) total at most 300000 bytes
//   rule 5  sources from https://arxiv.org/src/<versioned id>, 3 s between ANY two arXiv requests
//
// Every candidate that reaches a rule gets one line in probe-log.jsonl:
//   {id, field, series, year, rank, query, outcome: kept|rejected, reason, ...}
// `rank` is the candidate's 1-based position in the slot's concatenated search results, so a
// reviewer can check that the kept papers are the first passing ones.
//
// Outputs under --root (required: a work directory outside the repository): probe-log.jsonl,
// manifest-new.json, staging-notes.json, papers/<id>/..., slot-summary.json, STATUS.md, raw/ (search
// pages, downloaded sources, scratch). The queries default to queries.json beside this file.
// Papers already in the repository's corpora are skipped: the ids of fixtures/venue-manifest.json and
// fixtures/arxiv-manifest.json at git ref --base (default origin/main) of the checkout --paperlint
// (default: the repository this file is in). To rerun the 2026-11-20 batch, pass the commit it was
// collected against (fixtures/real-papers/accepted/README.md names it); for a new batch, origin/main.
// It is resumable: a rerun skips candidates already logged (except "download failed"), and keeps
// what is kept. Downloaded sources are untrusted: each is extracted into its own new directory and
// only read as text; nothing from it is ever executed or compiled.

import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const queriesPath =
  args.find(
    (a) =>
      !a.startsWith("--") &&
      args[args.indexOf(a) - 1]?.startsWith("--") !== true,
  ) ?? join(HERE, "queries.json");
if (!args.includes("--root")) {
  console.error(
    "--root DIR is required: a work directory for the run's outputs",
  );
  process.exit(2);
}
const ROOT = resolve(flag("--root"));
const ONLY = flag("--only", null)?.split(",") ?? null;
const BUDGET = Number(flag("--budget-seconds", "540")) * 1000;
const T0 = Date.now();
const UA = "paperlint-fixtures/1.0 (+https://github.com/zernie/paperlint)";
const PAPERLINT = flag("--paperlint", resolve(HERE, "../../../.."));
const BASE = flag("--base", "origin/main");
const MAX_BYTES = 300000;
const TEXT_EXT = new Set([
  "tex",
  "bib",
  "bbl",
  "cls",
  "sty",
  "bst",
  "cfg",
  "def",
]);
const LICENSES = {
  "http://creativecommons.org/licenses/by/4.0/": {
    name: "CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
  },
  "http://creativecommons.org/licenses/by-sa/4.0/": {
    name: "CC BY-SA 4.0",
    url: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  "http://creativecommons.org/publicdomain/zero/1.0/": {
    name: "CC0 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
};

const cfg = JSON.parse(readFileSync(queriesPath, "utf8"));
const LOG = join(ROOT, "probe-log.jsonl");
const MANIFEST = join(ROOT, "manifest-new.json");
const NOTES = join(ROOT, "staging-notes.json");
const SUMMARY = join(ROOT, "slot-summary.json");
for (const d of ["papers", "raw/search", "raw/src", "raw/scratch"])
  mkdirSync(join(ROOT, d), { recursive: true });

const readJson = (p, d) =>
  existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d;
const manifest = readJson(MANIFEST, []);
const notes = readJson(NOTES, {});
const summary = readJson(SUMMARY, {});
const logLines = existsSync(LOG)
  ? readFileSync(LOG, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  : [];
const baseId = (id) => id.replace(/v\d+$/, "");

// ids already in the repo's corpora (read-only git access)
// No fallback: a wrong --base or --paperlint must stop the run, not silently skip nothing.
const gitShow = (p) =>
  execFileSync("git", ["-C", PAPERLINT, "show", `${BASE}:${p}`], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
const existing = new Set(
  ["fixtures/venue-manifest.json", "fixtures/arxiv-manifest.json"].flatMap(
    (p) => JSON.parse(gitShow(p)).map((e) => baseId(e.arxiv_id)),
  ),
);
const shipped = new Set(
  execFileSync(
    "git",
    ["-C", PAPERLINT, "ls-tree", "--name-only", BASE, "presets/"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((l) => l.endsWith(".jsonc"))
    .map((l) => l.replace(/^presets\//, "").replace(/\.jsonc$/, "")),
);

// ---------- arXiv access: 3 s between any two requests ----------
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function arxiv(url, binary = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = last + 3100 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA },
        redirect: "follow",
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(10000);
        continue;
      }
      if (!res.ok) return { ok: false, status: res.status };
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        ok: true,
        status: res.status,
        buf,
        text: binary ? null : buf.toString("utf8"),
      };
    } catch (e) {
      await sleep(5000);
      if (attempt === 2) return { ok: false, status: String(e.message) };
    }
  }
  return { ok: false, status: "retries exhausted" };
}

// ---------- search results ----------
const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
const tag = (x, t) => {
  const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));
  return m ? decode(m[1]).replace(/\s+/g, " ").trim() : "";
};
function parseFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: tag(e, "id").replace(/^.*\/abs\//, ""),
    updated: tag(e, "updated").slice(0, 10),
    title: tag(e, "title"),
    comment: tag(e, "arxiv:comment"),
    journal_ref: tag(e, "arxiv:journal_ref"),
    category:
      (e.match(/<arxiv:primary_category[^>]*term="([^"]+)"/) ?? [])[1] ?? "",
    authors: [...e.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) =>
      decode(m[1]).trim(),
    ),
  }));
}
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const slotKey = (s) => `${s.field}/${slug(s.series)}-${s.year}`;
async function* candidates(slot) {
  let rank = 0;
  const seen = new Set();
  for (const q of slot.queries) {
    for (let page = 0; page < (cfg.maxPages ?? 4); page++) {
      const cache = join(
        ROOT,
        "raw/search",
        `${slug(slotKey(slot))}-${slug(q)}-${page}.xml`,
      );
      let xml;
      if (existsSync(cache)) xml = readFileSync(cache, "utf8");
      else {
        const u = new URL("https://export.arxiv.org/api/query");
        u.searchParams.set("search_query", q);
        u.searchParams.set("sortBy", "submittedDate");
        u.searchParams.set("sortOrder", "descending");
        u.searchParams.set("start", String(page * slot.max_results));
        u.searchParams.set("max_results", String(slot.max_results));
        const r = await arxiv(u.toString());
        if (!r.ok) {
          summary[slotKey(slot)] = {
            ...(summary[slotKey(slot)] ?? {}),
            searchError: `${q} page ${page}: ${r.status}`,
          };
          break;
        }
        xml = r.text;
        writeFileSync(cache, xml);
      }
      const entries = parseFeed(xml);
      for (const e of entries) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        rank += 1;
        yield { ...e, rank, query: q };
      }
      if (entries.length < slot.max_results) break;
    }
  }
}

// ---------- Semantic Scholar venue listing (source "semantic-scholar") ----------
// The listing is the proceedings: acceptance evidence without comment wording. Candidates are the
// entries with an ArXiv id, ordered by arXiv id ascending (deterministic), metadata from arXiv.
async function s2fetch(url) {
  for (let a = 0; a < 8; a++) {
    const wait = last + 3100 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      if (res.status === 429 || res.status >= 500) {
        await sleep(20000);
        continue;
      }
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, json: await res.json() };
    } catch {
      await sleep(5000);
    }
  }
  return { ok: false, status: "retries exhausted" };
}
async function s2List(slot) {
  const cache = join(ROOT, "raw/search", `s2-${slug(slotKey(slot))}.json`);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"));
  const base = `https://api.semanticscholar.org/graph/v1/paper/search/bulk?query=*&venue=${encodeURIComponent(slot.s2Venue)}&year=${slot.year}&fields=title,externalIds,venue,year,publicationDate`;
  const all = [];
  let token = null;
  let total = 0;
  for (let page = 0; page < 20; page++) {
    const r = await s2fetch(
      base + (token ? `&token=${encodeURIComponent(token)}` : ""),
    );
    if (!r.ok) {
      summary[slotKey(slot)] = {
        ...(summary[slotKey(slot)] ?? {}),
        searchError: `s2 ${r.status}`,
      };
      return null;
    }
    total = r.json.total ?? total;
    all.push(...(r.json.data ?? []));
    token = r.json.token;
    if (!token) break;
  }
  const withArxiv = [
    ...new Map(
      all
        .filter((p) => p.externalIds?.ArXiv)
        .map((p) => [p.externalIds.ArXiv, p]),
    ).values(),
  ].sort((a, b) => (a.externalIds.ArXiv < b.externalIds.ArXiv ? -1 : 1));
  const out = {
    url: base,
    total,
    withArxiv: withArxiv.length,
    list: withArxiv.map((p) => ({
      id: p.externalIds.ArXiv,
      venue: p.venue,
      publicationDate: p.publicationDate,
      title: p.title,
    })),
  };
  writeFileSync(cache, JSON.stringify(out));
  return out;
}
async function* s2Candidates(slot) {
  const L = await s2List(slot);
  if (!L) return;
  summary[slotKey(slot)] = {
    ...(summary[slotKey(slot)] ?? {}),
    s2Total: L.total,
    s2WithArxiv: L.withArxiv,
    s2Query: L.url,
  };
  for (let i = 0; i < L.list.length; i += 50) {
    const chunk = L.list.slice(i, i + 50);
    const cache = join(
      ROOT,
      "raw/search",
      `s2meta-${slug(slotKey(slot))}-${i}.xml`,
    );
    let xml;
    if (existsSync(cache)) xml = readFileSync(cache, "utf8");
    else {
      const u = new URL("https://export.arxiv.org/api/query");
      u.searchParams.set("id_list", chunk.map((p) => p.id).join(","));
      u.searchParams.set("max_results", "50");
      const r = await arxiv(u.toString());
      if (!r.ok) continue;
      xml = r.text;
      writeFileSync(cache, xml);
    }
    const byId = new Map(parseFeed(xml).map((e) => [baseId(e.id), e]));
    for (const [j, p] of chunk.entries()) {
      const e = byId.get(p.id);
      yield {
        ...(e ?? {
          id: p.id,
          updated: "",
          title: p.title,
          comment: "",
          journal_ref: "",
          category: "",
          authors: [],
        }),
        missing: !e,
        rank: i + j + 1,
        query: L.url,
        s2: { venue: p.venue, publicationDate: p.publicationDate },
      };
    }
  }
}

// ---------- rule 1: acceptance wording ----------
const POSITIVE =
  /accepted|to appear|will appear|appears? in|published (in|at)|camera[- ]?ready|to be presented|will be presented|spotlight|\boral\b|proceedings of/i;
const NEGATIVE =
  /submitted|under review|to be accepted|extended version|full version|long version|journal version|technical report|supplementary version|pending|extended abstract|late[- ]breaking|doctoral|student research|demo(nstration)? (track|paper)|tutorial|companion|workshop|\bSRW\b|demonstrations?|\bdemo\b|\bposter/i;
function judgeComment(c, slot) {
  const text = `${c.comment} | ${c.journal_ref}`;
  const yy = String(slot.year).slice(2);
  const near = new RegExp(
    `(?:${slot.venue})[^0-9]{0,14}(?:20)?${yy}(?![0-9])`,
    "i",
  );
  if (!near.test(text))
    return {
      ok: false,
      reason: `comment does not state ${slot.series} ${slot.year}`,
    };
  const negs = [...text.matchAll(new RegExp(NEGATIVE.source, "gi"))].map(
    (m) => m[0],
  );
  const atVenue = text.match(new RegExp(`@\\s*(?:${slot.venue})`, "i"));
  const wsName = text.match(
    new RegExp(
      `[:\u2013-]\\s*[^.]{5,}\\bat\\s+(?:${slot.venue})|proceedings of (?:the )?(?![^.]*(?:conference|symposium|meeting|annual))[^.]{8,}\\bat\\s*(?:${slot.venue})`,
      "i",
    ),
  );
  if (wsName)
    return {
      ok: false,
      reason: `not accepted wording: reads as a workshop title ("${wsName[0].slice(0, 60)}")`,
    };
  const blocking = negs.filter(
    (n) => !(/^poster/i.test(n) && slot.allowPoster),
  );
  if (blocking.length > 0 || atVenue)
    return {
      ok: false,
      reason: `not accepted wording: comment says "${blocking[0] ?? atVenue[0]}"`,
    };
  if (!POSITIVE.test(text))
    return {
      ok: false,
      reason: "not accepted wording: no acceptance statement",
    };
  const track =
    /findings/i.test(text) &&
    ["ACL", "EMNLP", "NAACL", "EACL"].includes(slot.series)
      ? "Findings"
      : null;
  return { ok: true, track };
}

// ---------- rule 3: class and style ----------
const stripComments = (t) => t.replace(/(^|[^\\])%.*$/gm, "$1");
function preambleOf(main) {
  const t = stripComments(main);
  const dc = t.match(/\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/);
  const pkgs = [
    ...t.matchAll(
      /\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g,
    ),
  ].flatMap((m) =>
    m[2].split(",").map((n) => ({ name: n.trim(), opts: m[1] ?? "" })),
  );
  return {
    cls: dc
      ? dc[2]
          .trim()
          .replace(/^.*\//, "")
          .replace(/\.cls$/, "")
      : null,
    clsOpts: dc?.[1] ?? "",
    pkgs,
  };
}
const pkgSpec = (cls, re, rejectOpts) => (p) => {
  if (!cls.includes(p.cls))
    return { ok: false, reason: `class ${p.cls}, not ${cls.join("/")}` };
  const hit = p.pkgs.find((x) => re.test(x.name));
  if (!hit)
    return {
      ok: false,
      reason: `class ${p.cls} without the venue style package (${re})`,
    };
  if (rejectOpts?.test(hit.opts))
    return {
      ok: false,
      reason: `style ${hit.name} in review/submission mode [${hit.opts}]`,
    };
  return { ok: true, style: hit.name, styleOpts: hit.opts };
};
const clsSpec = (names, rejectOpts) => (p) => {
  if (!names.includes(p.cls))
    return { ok: false, reason: `class ${p.cls}, not ${names.join("/")}` };
  if (rejectOpts?.test(p.clsOpts))
    return {
      ok: false,
      reason: `class ${p.cls} in review mode [${p.clsOpts}]`,
    };
  return { ok: true };
};
const either =
  (...fs) =>
  (p) => {
    const rs = fs.map((f) => f(p));
    return rs.find((r) => r.ok) ?? rs[0];
  };
const CLASS_SPECS = {
  neurips: pkgSpec(["article"], /^(neurips|nips)_20\d\d$/),
  icml: pkgSpec(["article"], /^icml20\d\d$/),
  iclr: pkgSpec(["article"], /^iclr20\d\d_conference$/),
  acl: pkgSpec(
    ["article"],
    /^(acl|acl_natbib|emnlp(_?20\d\d)?|naacl(_?20\d\d)?|eacl(_?20\d\d)?|acl20\d\d)$/,
    /\breview\b/,
  ),
  aaai: pkgSpec(["article"], /^aaai\d{2,4}$/, /submission/),
  ijcai: pkgSpec(["article"], /^ijcai\d\d$/, /review|submission/),
  usenix: either(pkgSpec(["article"], /^usenix/), clsSpec(["usenix"])),
  ieee: clsSpec(["IEEEtran"]),
  ndss: clsSpec(["IEEEtran"]),
  icra: clsSpec(["IEEEtran", "ieeeconf"]),
  acm: clsSpec(["acmart"], /\breview\b/),
  acm_or_ieee: either(clsSpec(["acmart"], /\breview\b/), clsSpec(["IEEEtran"])),
  vldb: either(
    pkgSpec(["article", "acmart"], /^vldb/),
    clsSpec(["acmart"], /\breview\b/),
  ),
  cvpr: pkgSpec(["article"], /^(cvpr|iccv|eccv)(_?20\d\d)?$/, /review/),
};

function presetFor(slot, p, style) {
  const alias = { "acm-ccs": "ccs", "ieee-s-p": "sp" };
  const editionPreset = `${alias[slug(slot.series)] ?? slug(slot.series)}-${slot.year}`;
  if (shipped.has(editionPreset))
    return {
      preset: `paperlint:${editionPreset}`,
      why: `the shipped edition preset ${editionPreset}`,
    };
  if (/^(neurips|nips)_/.test(style ?? ""))
    return {
      preset: "paperlint:neurips-style",
      why: "the NeurIPS style family as no preset ships for this edition",
    };
  if (/^icml/.test(style ?? ""))
    return {
      preset: "paperlint:icml-style",
      why: "the ICML style family as no preset ships for this edition",
    };
  if (/^(acl|emnlp|naacl|eacl)/.test(style ?? ""))
    return {
      preset: "paperlint:acl-latex",
      why: "the ACL style family as no preset ships for this edition",
    };
  if (/^aaai/.test(style ?? ""))
    return {
      preset: "paperlint:aaai-press",
      why: "the AAAI Press style family as no preset ships for this edition",
    };
  if (p.cls === "acmart") {
    const o = p.clsOpts;
    if (/acmsmall/.test(o))
      return {
        preset: "paperlint:acm-acmsmall",
        why: "the acmart acmsmall family as no preset ships for this edition",
      };
    if (/sigconf/.test(o))
      return {
        preset: "paperlint:acm-sigconf",
        why: "the acmart sigconf family as no preset ships for this edition",
      };
    return {
      preset: null,
      why: `no preset: the class is acmart with format [${o}], which is neither the sigconf nor the acmsmall family, and no preset ships for this edition`,
    };
  }
  if (p.cls === "IEEEtran" && /conference/.test(p.clsOpts))
    return {
      preset: "paperlint:ieee-conference",
      why: "the IEEE conference family as no preset ships for this edition",
    };
  return {
    preset: null,
    why: "no preset ships for this edition and no template family matches the class: no `extends`, as arxiv-papers does for such papers, but with the accepted cycle",
  };
}

// ---------- source handling ----------
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) return [];
    return st.isDirectory() ? walk(p) : st.isFile() ? [p] : [];
  });
const ext = (f) => (f.includes(".") ? f.split(".").pop().toLowerCase() : "");
const sha = (b) => createHash("sha256").update(b).digest("hex");

function extract(id, bytes) {
  const scratch = join(ROOT, "raw/scratch", id);
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b)
    return { error: "no source: not gzip (PDF-only submission)" };
  const raw = gunzipSync(bytes);
  if (raw.length > 262 && raw.toString("latin1", 257, 262) === "ustar") {
    const f = join(ROOT, "raw/src", `${id}.tar.gz`);
    writeFileSync(f, bytes);
    execFileSync("tar", [
      "-xzf",
      f,
      "-C",
      scratch,
      "--no-same-owner",
      "--no-same-permissions",
    ]);
  } else writeFileSync(join(scratch, "main.tex"), raw);
  return { scratch };
}

function stage(c, slot, judge, lic, bytes) {
  const ex = extract(c.id, bytes);
  if (ex.error) return { ok: false, reason: ex.error };
  const files = walk(ex.scratch);
  const rel = (f) => relative(ex.scratch, f);
  const texFiles = files.filter((f) => ext(f) === "tex");
  const mains = texFiles.filter((f) => {
    const t = stripComments(readFileSync(f, "latin1"));
    return /\\documentclass/.test(t) && /\\begin\{document\}/.test(t);
  });
  if (mains.length === 0) return { ok: false, reason: "no main .tex found" };
  const readme = files.find((f) => /00README/i.test(f));
  const named = readme
    ? (readFileSync(readme, "latin1").match(/(\S+\.tex)\s+toplevelfile/i) ??
        [])[1]
    : null;
  const pick =
    mains.find((f) => named && rel(f).endsWith(named)) ??
    mains.find((f) => /(^|\/)(main|paper|ms)\.tex$/.test(rel(f))) ??
    mains.sort((a, b) => lstatSync(b).size - lstatSync(a).size)[0];
  const mainText = readFileSync(pick, "latin1");
  const p = preambleOf(mainText);
  const spec = CLASS_SPECS[slot.classSpec](p);
  if (!spec.ok)
    return {
      ok: false,
      reason: `template: ${spec.reason}`,
      detail: { cls: p.cls, clsOpts: p.clsOpts },
    };
  const dir = dirname(pick);
  const kept = walk(dir).filter((f) => TEXT_EXT.has(ext(f)));
  const total = kept.reduce((n, f) => n + lstatSync(f).size, 0);
  if (total > MAX_BYTES)
    return { ok: false, reason: `>300KB of text sources (${total} bytes)` };

  const mainRel = relative(dir, pick);
  const stem = mainRel.replace(/\.tex$/, "");
  const out = join(ROOT, "papers", c.id);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const edits = [];
  const renames = [];
  for (const f of kept) {
    let r = relative(dir, f);
    let buf = readFileSync(f);
    if (r === mainRel) r = "paper.tex";
    else if (r === `${stem}.bbl`) r = "paper.bbl";
    if (r !== relative(dir, f)) renames.push(`${relative(dir, f)} to ${r}`);
    if (ext(f) === "tex" && stem !== "paper") {
      const s = buf.toString("latin1");
      const re = new RegExp(
        `\\\\(input|include)\\{${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\.tex|\\.bbl)?\\}`,
        "g",
      );
      const t = s.replace(re, (m, cmd, e) => {
        edits.push(`${m} to \\${cmd}{paper${e ?? ""}}`);
        return `\\${cmd}{paper${e ?? ""}}`;
      });
      if (t !== s) buf = Buffer.from(t, "latin1");
    }
    mkdirSync(dirname(join(out, r)), { recursive: true });
    writeFileSync(join(out, r), buf);
  }
  const stagedFiles = walk(out).map((f) => relative(out, f));
  const finalSize = stagedFiles.reduce(
    (n, f) => n + lstatSync(join(out, f)).size,
    0,
  );

  // record-by-hand: paper.tex, class/style files at the root, then \input/\include in source order
  const inputs = [{ path: "paper.tex", role: "body" }];
  for (const f of stagedFiles
    .filter((f) => !f.includes("/") && ["cls", "sty"].includes(ext(f)))
    .sort())
    inputs.push({ path: f, role: "preamble" });
  const seen = new Set(["paper.tex"]);
  const follow = (file) => {
    const t = stripComments(readFileSync(join(out, file), "latin1"));
    for (const m of t.matchAll(/\\(?:input|include)\s*\{([^}]+)\}/g)) {
      const n = m[1].trim();
      const cand = [n, `${n}.tex`]
        .map((x) => x.replace(/^\.\//, ""))
        .find((x) => stagedFiles.includes(x) && ext(x) === "tex");
      if (cand && !seen.has(cand)) {
        seen.add(cand);
        inputs.push({ path: cand, role: "body" });
        follow(cand);
      }
    }
  };
  follow("paper.tex");
  const hashes = Object.fromEntries(
    inputs.map((i) => [i.path, sha(readFileSync(join(out, i.path)))]),
  );
  writeFileSync(
    join(out, "record-by-hand.json"),
    JSON.stringify(
      {
        schema: 1,
        inputs,
        written: [],
        bibdata: [],
        bibtex: { ran: false },
        sha256: hashes,
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(out, "PIPELINE-STATUS.md"),
    "---\nstages: []\n---\n# PIPELINE-STATUS\n",
  );

  const { preset, why } = presetFor(slot, p, spec.style);
  const cycleId = `${slug(slot.series)}-${slot.year}${judge.track ? "-findings" : ""}`;
  const absUrl = `https://arxiv.org/abs/${c.id}`;
  const venueLabel = `${slot.series} ${slot.year}${judge.track ? ` (${judge.track})` : ""}`;
  const cycle = {
    id: cycleId,
    venue: preset
      ? { kind: "preset", extends: preset }
      : { kind: "named", name: venueLabel, url: absUrl },
    opened: c.updated,
    outcome: { kind: "accepted", date: c.updated, evidence: "README.md" },
  };
  writeFileSync(
    join(out, "paperlint.json"),
    JSON.stringify({ cycles: [cycle] }, null, 2) + "\n",
  );

  const clsStr = `[${p.clsOpts}]{${p.cls}}`;
  const quote = c.s2
    ? `Semantic Scholar venue listing: venue "${c.s2.venue}", year ${slot.year}, publication date ${c.s2.publicationDate ?? "not given"}${c.comment ? `; arXiv comment: ${c.comment}` : ""}`
    : [c.comment, c.journal_ref && `journal-ref: ${c.journal_ref}`]
        .filter(Boolean)
        .join(" | ");
  const readmeTxt = `# ${c.title}

- **Authors:** ${c.authors.join(", ")}
- **Source:** arXiv [${c.id}](${absUrl}), e-print \`https://arxiv.org/src/${c.id}\` (sha256 \`${sha(bytes)}\`)
- **Category:** ${c.category}; **document class:** \`${clsStr}\`${spec.style ? `, **style package:** \`${spec.style}${spec.styleOpts ? `[${spec.styleOpts}]` : ""}\`` : ""}
- **Licence:** [${lic.name}](${lic.url}), as the arXiv abstract page states. The files are redistributed under it.
- **Accepted at:** ${venueLabel}. ${c.s2 ? `Semantic Scholar's venue listing (the proceedings) holds [${c.id}](${absUrl}) — acceptance evidence without comment wording — query \`${c.query}\`: «${quote}»` : `The arXiv comment of [${c.id}](${absUrl}) says: «${quote}»`}
- **Linted as:** ${preset ? `\`${preset}\`` : "no preset (`extends` left out)"}, the camera-ready of an accepted attempt (${why})
- **Text sources only, figures omitted.** Kept: \`.tex\`, \`.bib\`, \`.bbl\`, \`.cls\`, \`.sty\`, \`.bst\`, \`.cfg\`, \`.def\` of the main file's directory. Dropped: images, PDFs, data.
- **${renames.length ? "Renamed" : "Nothing renamed"}${edits.length ? ", one thing changed inside" : ", nothing inside changed"}:** ${renames.length ? renames.map((r) => `\`${r.split(" to ")[0]}\` to \`${r.split(" to ")[1]}\``).join(", ") : "the main file was already paper.tex"}${edits.length ? `; ${edits.map((e) => `\`${e.split(" to ")[0]}\` to \`${e.split(" to ")[1]}\``).join(", ")}` : ""}.
- **Ours:** \`paperlint.json\`, \`PIPELINE-STATUS.md\`, \`record-by-hand.json\`, \`baseline.json\`, \`README.md\`.

\`paperlint.json\` records one attempt, accepted, whose evidence is this file. Its dates are those of the arXiv version that states the acceptance: the real decision day is earlier and not known here. \`record-by-hand.json\` is NOT TeX's answer: it lists \`paper.tex\`, the class and style files at the root, then the \`\\input\`/\`\\include\` files in the order the source names them, hashed over the bytes here. See [\`../README.md\`](../README.md).
`;
  writeFileSync(join(out, "README.md"), readmeTxt);

  const entry = {
    arxiv_id: c.id,
    license: lic.key,
    source_sha256: sha(bytes),
    main_tex: `./${mainRel}`,
    class: p.cls,
    category: c.category,
    size_bytes: finalSize,
    dir: c.id,
    accepted: { quote, url: absUrl, venue: venueLabel },
    preset,
    kind: null,
    field: slot.field,
    series: slot.series,
    year: slot.year,
    ...(judge.track ? { track: judge.track } : {}),
  };
  notes[c.id] = {
    clsOpts: p.clsOpts,
    style: spec.style ?? null,
    styleOpts: spec.styleOpts ?? null,
    mainCandidates: mains.length,
    presetWhy: why,
    edits,
    renames,
    title: c.title,
  };
  rmSync(ex.scratch, { recursive: true, force: true });
  return { ok: true, entry };
}

// ---------- the walk ----------
const log = (rec) => {
  appendFileSync(LOG, JSON.stringify(rec) + "\n");
  logLines.push(rec);
};
const done = (id, slot) =>
  logLines.some(
    (l) =>
      l.id === id &&
      l.series === slot.series &&
      l.year === slot.year &&
      (l.outcome === "kept" || !/^download failed/.test(l.reason ?? "")),
  );
const keptIn = (slot) =>
  manifest.filter((m) => m.series === slot.series && m.year === slot.year)
    .length;
const keptField = (f) => manifest.filter((m) => m.field === f).length;
const save = () => {
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");
  writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + "\n");
  writeStatus();
};
const DEADLINE = flag("--deadline", null)
  ? Date.parse(flag("--deadline"))
  : Infinity;
const outOfTime = () => Date.now() - T0 > BUDGET || Date.now() > DEADLINE;

function writeStatus() {
  const fields = Object.keys(cfg.quotas);
  const reasonKey = (r) =>
    r
      .replace(/[0-9]+ bytes|\(.*?\)|\[.*?\]/g, "")
      .replace(/\d{4}/g, "")
      .trim()
      .slice(0, 70);
  const rows = fields.map((f) => {
    const probed = new Set(
      logLines.filter((l) => l.field === f).map((l) => l.id),
    ).size;
    const venues = [
      ...new Set(
        manifest
          .filter((m) => m.field === f)
          .map((m) => `${m.series} ${m.year}`),
      ),
    ];
    const t = {};
    for (const l of logLines.filter(
      (l) => l.field === f && l.outcome === "rejected",
    ))
      t[reasonKey(l.reason)] = (t[reasonKey(l.reason)] ?? 0) + 1;
    const top = Object.entries(t)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} (${v})`)
      .join("; ");
    const y = probed ? ((100 * keptField(f)) / probed).toFixed(1) : "0";
    return `| ${f} | ${keptField(f)} / ${cfg.quotas[f]} | ${probed} | ${y}% | ${top} | ${venues.join(", ")} |`;
  });
  const tally = {};
  for (const l of logLines)
    if (l.outcome === "rejected") {
      const k = l.reason
        .replace(/[0-9]+ bytes|\(.*?\)|\[.*?\]/g, "")
        .replace(/\d{4}/g, "")
        .trim()
        .slice(0, 60);
      tally[k] = (tally[k] ?? 0) + 1;
    }
  const series = new Set(manifest.map((m) => m.series));
  const body = `# STATUS (updated ${new Date().toISOString()})

kept ${manifest.length} / ${Object.values(cfg.quotas).reduce((a, b) => a + b, 0)}; probed ${new Set(logLines.map((l) => l.id)).size} candidates; ${series.size} venue series; ${new Set(manifest.map((m) => m.class + (notes[m.arxiv_id]?.style ?? ""))).size} class/style combinations

| field | kept / quota | probed | yield | top 3 rejection reasons | venue editions so far |
| --- | --- | ---: | ---: | --- | --- |
${rows.join("\n")}

## Rejection reasons so far

${Object.entries(tally)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- ${v} × ${k}`)
  .join("\n")}
`;
  writeFileSync(join(ROOT, "STATUS.md"), body);
}

async function walkSlot(slot, target) {
  const k = slotKey(slot);
  if (keptIn(slot) >= target || keptField(slot.field) >= cfg.quotas[slot.field])
    return;
  let n = 0;
  const S2 = slot.source === "semantic-scholar";
  for await (const c of S2 ? s2Candidates(slot) : candidates(slot)) {
    n = c.rank;
    if (outOfTime()) return "time";
    if (
      keptIn(slot) >= target ||
      keptField(slot.field) >= cfg.quotas[slot.field]
    ) {
      summary[k] = { ...(summary[k] ?? {}), walkedTo: c.rank - 1 };
      return;
    }
    if (done(c.id, slot)) continue;
    const base = {
      id: c.id,
      field: slot.field,
      series: slot.series,
      year: slot.year,
      rank: c.rank,
      query: c.query,
      source: S2 ? "semantic-scholar" : "arxiv-comment",
      acceptance: S2 ? "s2-venue-listing" : "arxiv-comment",
    };
    const rej = (reason, extra = {}) =>
      log({ ...base, outcome: "rejected", reason, ...extra });
    if (manifest.some((m) => baseId(m.arxiv_id) === baseId(c.id))) {
      rej("already kept in another slot");
      continue;
    }
    if (existing.has(baseId(c.id))) {
      rej("already in the repo corpora");
      continue;
    }
    if (c.missing) {
      rej("arXiv metadata missing for the listed id");
      continue;
    }
    if (
      S2 &&
      /workshop|companion|poster|demo|tutorial|doctoral/i.test(c.s2.venue ?? "")
    ) {
      rej(`S2 venue string is not the main proceedings: "${c.s2.venue}"`);
      continue;
    }
    const j = S2 ? { ok: true, track: null } : judgeComment(c, slot);
    if (!j.ok) {
      rej(j.reason, { comment: c.comment.slice(0, 160) });
      continue;
    }
    const oai = await arxiv(
      `https://export.arxiv.org/oai2?verb=GetRecord&identifier=oai:arXiv.org:${baseId(c.id)}&metadataPrefix=arXiv`,
    );
    if (!oai.ok) {
      rej(`download failed: OAI ${oai.status}`);
      continue;
    }
    const licUrl = (oai.text.match(/<license>([^<]*)<\/license>/) ?? [])[1];
    const lic = LICENSES[licUrl];
    if (!lic) {
      rej(
        `licence ${licUrl ? licUrl.replace(/^https?:\/\/(creativecommons|arxiv)\.org\//, "") : "arXiv default (none)"}`,
      );
      continue;
    }
    const src = await arxiv(`https://arxiv.org/src/${c.id}`, true);
    if (!src.ok) {
      rej(`download failed: src ${src.status}`);
      continue;
    }
    let res;
    try {
      res = stage(c, slot, j, { ...lic, key: licUrl }, src.buf);
    } catch (e) {
      res = {
        ok: false,
        reason: `unreadable source: ${String(e.message).slice(0, 80)}`,
      };
    }
    if (!res.ok) {
      rej(res.reason, res.detail ?? {});
      continue;
    }
    res.entry.source = base.source;
    res.entry.acceptance = base.acceptance;
    if (S2)
      notes[c.id].versionNote =
        c.s2.publicationDate && c.updated && c.updated < c.s2.publicationDate
          ? `latest arXiv version (${c.updated}) predates the venue date (${c.s2.publicationDate}); kept the latest version`
          : `latest arXiv version ${c.updated}; venue date ${c.s2.publicationDate ?? "not given"}`;
    manifest.push(res.entry);
    log({
      ...base,
      outcome: "kept",
      reason: "passes rules 1-4",
      licence: lic.name,
      comment: c.comment.slice(0, 200),
    });
    save();
  }
  summary[k] = { ...(summary[k] ?? {}), exhaustedAt: n, kept: keptIn(slot) };
}

if (args.includes("--rejudge")) {
  const idx = new Map();
  for (const f of readdirSync(join(ROOT, "raw/search")).filter(
    (f) => f.endsWith(".xml") && !f.startsWith("s2meta"),
  ))
    for (const e of parseFeed(
      readFileSync(join(ROOT, "raw/search", f), "utf8"),
    ))
      idx.set(baseId(e.id), e);
  const dump = join(ROOT, "raw/discarded-rejudge");
  mkdirSync(dump, { recursive: true });
  for (const m of [...manifest].filter(
    (m) => (m.acceptance ?? "arxiv-comment") === "arxiv-comment",
  )) {
    const slot = cfg.slots.find(
      (s) => s.series === m.series && s.year === m.year && s.field === m.field,
    );
    const e = idx.get(baseId(m.arxiv_id));
    if (!slot || !e) continue;
    const j = judgeComment(e, slot);
    const line = logLines.find(
      (l) => l.id === m.arxiv_id && l.outcome === "kept",
    );
    if (!j.ok) {
      renameSync(join(ROOT, "papers", m.dir), join(dump, m.dir));
      manifest.splice(manifest.indexOf(m), 1);
      delete notes[m.arxiv_id];
      if (line) {
        line.outcome = "rejected";
        line.reason = `${j.reason} (re-judged under the refined rule 1; was kept)`;
      }
      console.log("re-judged out:", m.arxiv_id, j.reason);
    } else {
      const q = [e.comment, e.journal_ref && `journal-ref: ${e.journal_ref}`]
        .filter(Boolean)
        .join(" | ");
      if (q !== m.accepted.quote) {
        const rp = join(ROOT, "papers", m.dir, "README.md");
        writeFileSync(
          rp,
          readFileSync(rp, "utf8").replace(`«${m.accepted.quote}»`, `«${q}»`),
        );
        m.accepted.quote = q;
      }
    }
  }
  writeFileSync(LOG, logLines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  save();
  process.exit(0);
}

const slots = cfg.slots.filter((s) => !ONLY || ONLY.includes(s.field));
const fields = [...new Set(slots.map((s) => s.field))];
for (const f of fields) {
  for (let round = 0; round <= cfg.hardCap; round++) {
    for (const slot of slots.filter((s) => s.field === f)) {
      const target = Math.min(cfg.hardCap, slot.cap + round);
      if (round > 0 && target === Math.min(cfg.hardCap, slot.cap + round - 1))
        continue;
      const r = await walkSlot(slot, target);
      save();
      if (r === "time") {
        console.log("budget reached; rerun to continue");
        process.exit(0);
      }
    }
    if (keptField(f) >= cfg.quotas[f]) break;
  }
}
save();
console.log(`done: kept ${manifest.length}`);
