/**
 * `tex-requirements.ts` — the TeX packages the venue profiles declare, parsed at the boundary.
 *
 * Tables, in order:
 *   1. the SHIPPED data: every profile passes the schema, and the facts that have already cost a
 *      paper (the acmart fonts, binhex, fancyhdr) are declared;
 *   2. the schema REJECTS what it must — each bad profile names the offending path;
 *   3. what a paper gets: its venue plus the base set, or the base set with the reason said.
 */
import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const VENUES = join(
  HERE,
  "..",
  "skills",
  "submit-paper",
  "references",
  "venues",
);
const R = await import(join(HERE, "tex-requirements.ts"));

let n = 0;
const check = (label, cond, detail = "") => {
  assert.ok(cond, `${label}${detail ? ` — ${detail}` : ""}`);
  n++;
};
const throws = (fn) => {
  try {
    fn();
    return "";
  } catch (e) {
    return e.message;
  }
};
const read = (f) =>
  R.parseProfile(readFileSync(join(VENUES, f), "utf8"), f, VENUES);

// ── 1. the shipped data ─────────────────────────────────────────────────────────────────
const venues = R.venueNames(VENUES);
// Guards: keeping tex-base out of the venue list — it would be offered as a venue named tex-base.
check(
  "venueNames: the .jsonc profiles, without the base set",
  venues.length >= 3 && !venues.includes("tex-base"),
  venues.join(","),
);
for (const v of venues)
  check(
    `${v}.jsonc passes the schema`,
    throws(() => read(`${v}.jsonc`)) === "",
    throws(() => read(`${v}.jsonc`)),
  );
const base = read("tex-base.jsonc");
check(
  "tex-base: the programs the skills run (texcount, checkcites) are declared as TOOLS",
  base.tools.texcount?.[0] === "texcount" &&
    base.tools.checkcites?.[0] === "checkcites",
);
check(
  "tex-base: cm-super — without it pdflatex silently rasterizes to Type 3",
  "cm-super" in base.packages,
);

// The whole profile, parsed the way the other harnesses read these files — never a line of text.
const templateOf = (v) =>
  ts.parseConfigFileTextToJson(
    v,
    readFileSync(join(VENUES, `${v}.jsonc`), "utf8"),
  ).config.template;
const acm = venues.filter((v) => templateOf(v) === "acmart");
check(
  "at least one acmart venue is shipped (else the next checks see nothing)",
  acm.length > 0,
);
for (const v of acm) {
  const tex = read(`${v}.jsonc`);
  // acmart.cls checks ALL THREE font packages and falls back to Computer Modern SILENTLY when any
  // is missing; newtx needs binhex.tex (kastrup) or the build stops hard; fancyhdr (#37).
  for (const [pkg, file] of [
    ["libertine", "libertine.sty"],
    ["inconsolata", "zi4.sty"],
    ["newtx", "newtxmath.sty"],
    ["kastrup", "binhex.tex"],
    // Guards: #37 — fancyhdr was held up by an accident of the base image and is absent on a
    // minimal one.
    ["fancyhdr", "fancyhdr.sty"],
    ["acmart", "acmart.cls"],
  ])
    check(
      `🔴 ${v}: declares ${pkg}, proved by ${file}`,
      tex.packages[pkg]?.includes(file),
    );
}
// Venues on ONE template must not drift apart: a second list is how the old installer's three
// dictionaries diverged.
const byTemplate = new Map();
for (const v of venues) {
  const t = templateOf(v);
  byTemplate.set(t, [...(byTemplate.get(t) ?? []), v]);
}
for (const [t, vs] of byTemplate)
  check(
    `venues on template ${t} declare the SAME packages (${vs.join(", ")})`,
    new Set(vs.map((v) => JSON.stringify(read(`${v}.jsonc`)))).size === 1,
  );

// ── 2. the schema rejects ───────────────────────────────────────────────────────────────
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "rpp-texreq-h-")));
copyFileSync(join(VENUES, R.SCHEMA_FILE), join(tmp, R.SCHEMA_FILE));
const bad = (text) => throws(() => R.parseProfile(text, "bad.jsonc", tmp));
const BAD = [
  ["no `tex` block at all", `{ "template": "acmart" }`, "tex"],
  // Guards: typo detection — `templat` would be accepted and the field silently unread.
  [
    "an unknown top-level key (a typo)",
    `{ "tex": { "packages": { "a": ["a.sty"] } }, "templat": "x" }`,
    "additional properties",
  ],
  [
    "a package with NO proof file",
    `{ "tex": { "packages": { "acmart": [] } } }`,
    ".tex.packages['acmart']",
  ],
  [
    "a package name tlmgr would not know (upper case)",
    `{ "tex": { "packages": { "Acmart": ["acmart.cls"] } } }`,
    "property name",
  ],
  [
    "a proof that is a path, not a file name",
    `{ "tex": { "packages": { "a": ["tex/a.sty"] } } }`,
    "pattern",
  ],
  ["an empty packages map", `{ "tex": { "packages": {} } }`, "fewer than 1"],
  [
    "an unknown key inside tex",
    `{ "tex": { "packages": { "a": ["a.sty"] }, "pkgs": {} } }`,
    "additional properties",
  ],
];
for (const [label, text, says] of BAD) {
  const msg = bad(text);
  check(
    `schema rejects ${label}, and says where`,
    msg.includes("does not match") && msg.includes(says),
    msg,
  );
}
check(
  "not JSONC at all: named as such, not as a schema failure",
  bad(`{ "tex": `).includes("not valid JSONC"),
  bad(`{ "tex": `),
);
check(
  "comments and trailing commas ARE JSONC",
  bad(`// quote\n{ "tex": { "packages": { "a": ["a.sty"], }, }, }`) === "",
);
rmSync(tmp, { recursive: true, force: true });

// ── 3. what a paper gets ────────────────────────────────────────────────────────────────
{
  const r = R.requirementsFor(null, VENUES);
  // Guards: saying WHY a paper runs on the base set.
  check(
    "no venue.json → the base set, and the source says so",
    r.source.includes("no venue.json") &&
      "hyperref" in r.tex.packages &&
      !("acmart" in r.tex.packages),
    r.source,
  );
}
{
  const r = R.requirementsFor("nowhere", VENUES);
  check(
    "a venue with no profile → the base set, and the source names the venue",
    r.source.includes("venue nowhere has no profile") &&
      !("acmart" in r.tex.packages),
    r.source,
  );
}
check(
  "the base file is not a venue: `tex-base` gets the base set with the reason",
  R.requirementsFor("tex-base", VENUES).source.includes("has no profile"),
);
{
  const r = R.requirementsFor(acm[0], VENUES);
  check(
    "a known venue → its packages ON TOP OF the base set",
    r.source === `venue ${acm[0]}` &&
      "acmart" in r.tex.packages &&
      "hyperref" in r.tex.packages &&
      "texcount" in r.tex.tools,
    r.source,
  );
}
{
  const m = R.mergeRequirements(
    { packages: { a: ["a.sty"] }, tools: {} },
    { packages: { a: ["a2.sty"], b: ["b.sty"] }, tools: { t: ["t"] } },
  );
  // Guards: the union — two venues proving one package by different files would lose one proof.
  check(
    "mergeRequirements: a package declared twice keeps every proof of both",
    JSON.stringify(m) ===
      '{"packages":{"a":["a.sty","a2.sty"],"b":["b.sty"]},"tools":{"t":["t"]}}',
    JSON.stringify(m),
  );
}
{
  const u = R.declaredUnion(VENUES);
  const names = R.packageNames(u.tex);
  check(
    "declaredUnion: base + every venue — what `rpp toolchain` installs",
    u.profiles === venues.length + 1 &&
      names.includes("acmart") &&
      names.includes("lineno") &&
      names.includes("texcount") &&
      names.includes("hyperref"),
    names.join(","),
  );
  check(
    "packageNames: sorted, unique",
    names.join() === [...new Set(names)].sort().join(),
  );
}

console.log(`tex-requirements: ${n} checks passed`);
