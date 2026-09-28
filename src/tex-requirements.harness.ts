/**
 * `tex-requirements.ts` — the TeX packages the venue profiles declare, parsed at the boundary.
 *
 * Tables, in order:
 *   1. the SHIPPED data: every profile passes the schema, and the facts that have already cost a
 *      paper (the acmart fonts, binhex, fancyhdr) are declared;
 *   2. the schema REJECTS what it must — each bad profile names the offending path;
 *   3. what a paper gets: its venue plus the base set, or the base set with the reason said.
 */
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createChecker } from "../lib/check.ts";

const R = await import("./tex-requirements.ts");
const { parseTemplate } = await import("./adapters/latex/index.ts");
const VENUES = (await import("./package-dirs.ts")).presetsDir();

const check = createChecker();
const throws = (fn: () => unknown): string => {
  try {
    fn();
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const read = (f: string) =>
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

// The class each profile's template names, as the parser reads it — never a line of text.
const presetOf = (v: string) =>
  R.parsePreset(
    readFileSync(join(VENUES, `${v}.jsonc`), "utf8"),
    `${v}.jsonc`,
    VENUES,
  );
const templateOf = (v: string): string | undefined =>
  parseTemplate(presetOf(v).template ?? "")?.cls;
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
  ] satisfies [string, string][])
    check(
      `🔴 ${v}: declares ${pkg}, proved by ${file}`,
      tex.packages[pkg]?.includes(file),
    );
}
// Venues on ONE template must not drift apart: a second list is how the old installer's three
// dictionaries diverged. Since the ACM venues extend the `acm-sigconf` family, only the family
// declares the template's packages, so this holds by construction; the check stays for any two
// standalone presets that name the same template.
const byTemplate = new Map<unknown, string[]>();
for (const v of venues.filter((x) => presetOf(x).extends === null)) {
  const t = templateOf(v);
  byTemplate.set(t, [...(byTemplate.get(t) ?? []), v]);
}
for (const [t, vs] of byTemplate)
  check(
    `venues on template ${String(t)} declare the SAME packages (${vs.join(", ")})`,
    new Set(vs.map((v) => JSON.stringify(read(`${v}.jsonc`)))).size === 1,
  );

// A venues directory whose schema file is JSON but not a schema: refused where it is read, with
// the file's name — not deep inside Ajv as "schema should be object or boolean".
{
  const odd = realpathSync(
    mkdtempSync(join(tmpdir(), "paperlint-texreq-schema-")),
  );
  writeFileSync(join(odd, R.SCHEMA_FILE), "3\n");
  check(
    "a schema file that is not a JSON object is refused, naming the file",
    new RegExp(
      `${R.SCHEMA_FILE.replace(/\./g, "\\.")}: not a JSON Schema object`,
    ).test(throws(() => R.parsePreset("{}", "odd.jsonc", odd))),
    throws(() => R.parsePreset("{}", "odd.jsonc", odd)),
  );
}

// ── 2. the schema rejects ───────────────────────────────────────────────────────────────
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-texreq-h-")));
copyFileSync(join(VENUES, R.SCHEMA_FILE), join(tmp, R.SCHEMA_FILE));
const bad = (text: string) =>
  throws(() => R.parseProfile(text, "bad.jsonc", tmp));
const BAD: [string, string, string][] = [
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
    "no venue preset → the base set, and the source says so",
    r.source.includes("no venue preset in paperlint.json") &&
      "hyperref" in r.tex.packages &&
      !("acmart" in r.tex.packages),
    r.source,
  );
}
// Which preset a paper resolves to — a typo, the base file, a missing one — is src/presets.ts's
// question now, tested in src/presets.test.ts; this function only adds a resolved preset's packages.
{
  // `acm` is non-empty: the check above it throws otherwise.
  const [label = ""] = acm;
  const r = R.requirementsFor({ label, tex: read(`${label}.jsonc`) }, VENUES);
  check(
    "a resolved preset → its packages ON TOP OF the base set, and the source names its label",
    r.source === `venue ${label}` &&
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
    "declaredUnion: base + every venue — what `paperlint toolchain` installs",
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

// ── 5. the parser's tolerances: an optional block left out, and Ajv's optional fields ───
{
  const bare = R.parsePreset(
    '{ "extends": "paperlint:aisec" }',
    "bare.jsonc",
    VENUES,
  );
  check(
    "a preset that only extends another: no tex block, `rules` an empty object",
    JSON.stringify([bare.extends, bare.tex, bare.rules]) ===
      '["paperlint:aisec",null,{}]',
    bare,
  );
  // Guards: `packages` is read without a fallback because the schema refuses a tex block
  // without it — this is the refusal the type relies on.
  check(
    "a tex block without `packages` is refused by the schema, before anything reads it",
    /tex\.jsonc: \.tex should have required property 'packages'/.test(
      throws(() => R.parsePreset('{ "tex": {} }', "tex.jsonc", VENUES)),
    ),
    throws(() => R.parsePreset('{ "tex": {} }', "tex.jsonc", VENUES)),
  );
  check(
    "violations: Ajv's null `errors` is no violation; a message Ajv left out is an empty one",
    R.violations("f.jsonc", { errors: null }).length === 0 &&
      R.violations("f.jsonc", {
        errors: [
          {
            keyword: "required",
            dataPath: "",
            schemaPath: "#/required",
            params: {},
          },
        ],
      })[0] === "f.jsonc: (top level) ",
  );
}

console.log(`tex-requirements: ${String(check.count)} checks passed`);
