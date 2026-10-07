/**
 * The references a build checked, end to end without a network: the `references` build step checks
 * the databases the build's bibtex opened (`_build/sources.json`, docs/design/paper-sources.md §1),
 * records what a (fake) checker answers, and the offline rules judge that record.
 *
 *   a pass is recorded, with the hash of the databases checked
 *   one mismatched entry → paper/author-list on THAT entry, at the file, line and column it is in
 *   a database edited after the verdicts → paper/refs-fresh, and the per-entry rules go quiet
 *   offline → the step still succeeds (the build is not failed) and paper/refs-checked warns
 *   no record of the build, or a stale one → the step checks nothing and the rules are silent
 *
 * The planted papers of `fixtures/paper-sources/` supply the record: each one's `tex-truth.json` is
 * what the build wrote for it, taken from TeX's own files.
 */
import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { eslintConfig } from "./cli.ts";
import { join } from "node:path";
import { memoryFiles } from "./adapters/memory/index.ts";
import { ok } from "./domain/result.ts";
import { absolutePath } from "./domain/paths.ts";
import { sha256Hex } from "./domain/sha256.ts";
import {
  serializeSourcesRecord,
  type SourcesRecord,
} from "./domain/sources-record.ts";
import type {
  CheckReferences,
  EntryVerdict,
} from "./ports/check-references.ts";
import { referencesStep } from "./build.ts";
import {
  bibHash,
  bibliographyReader,
  lookupCachePath,
  notWiredBibliography,
  recordReferences,
  readReferences,
  referencesPath,
  unseenKeys,
} from "./references.ts";
import { bibReader } from "./adapters/bibtex/index.ts";
import { latexReader } from "./adapters/latex/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseLookupCache,
  serializeLookupCache,
  type CachedResponse,
  type LookupCache,
} from "./domain/lookup-cache.ts";
import { bibtexRead } from "./latex-log.ts";
import { referenceRules, REFERENCE_RULE_LEVELS } from "./reference-rules.ts";
import { texLanguage } from "../eslint-rules/latex-language.ts";
import { present } from "../test/support.ts";

const PAPER = "/work/papers/p";
const ENTRIES =
  "@inproceedings{schick2023,\n  title = {Toolformer},\n  author = {Schick, Timo},\n  booktitle = {NeurIPS}\n}\n@misc{other,\n  title = {Other},\n  url = {https://x.org}\n}\n";
const TEX = "\\documentclass{article}\n\\begin{document}x\\end{document}\n";

type Files = ReturnType<typeof memoryFiles>;
const bytes = (s: string) => new TextEncoder().encode(s);

const verdict = (
  key: string,
  authors: EntryVerdict["authors"] = "match",
  exists: EntryVerdict["exists"] = "true",
): EntryVerdict => ({
  key,
  exists,
  authors,
  ...(authors === "mismatch" ? { why: "missing hambro" } : {}),
});

const checker =
  (entries: readonly EntryVerdict[]): CheckReferences =>
  (_bib, cache) =>
    Promise.resolve({ check: { kind: "checked", entries }, cache });
const offline: CheckReferences = (_bib, cache) =>
  Promise.resolve({
    check: {
      kind: "not-checked",
      why: "the citation services cannot be reached (fetch failed)",
    },
    cache,
  });
/** A checker that hands back a passing verdict for each entry it is given, and records the keys. */
function passing() {
  const handed: string[] = [];
  const check: CheckReferences = (bib, cache) => {
    handed.push(...bib.map((e) => e.key));
    return Promise.resolve({
      check: { kind: "checked", entries: bib.map((e) => verdict(e.key)) },
      cache,
    });
  };
  return { check, handed };
}
const never: CheckReferences = () => Promise.reject(new Error("never asked"));

/** What reads a paper's record and the databases it names: the disk, the schema, the bibtex reader. */
const depsOf = (files: Files) => ({
  files,
  codec: sourcesCodec,
  latex: latexReader,
  bib: bibReader,
});

/** The step's context over `files`, with every port it does not use stubbed. */
const ctx = (files: Files) => ({
  readBibliography: bibliographyReader(depsOf(files)),
  paperDir: PAPER,
  env: {},
  run: () => ({ status: 0 }),
  readPdf: () => Promise.reject(new Error("the references step reads no PDF")),
  measure: {
    measure: () => {
      throw new Error("the references step measures nothing");
    },
  },
  files,
});

/** The bibliography the record in `files` names, read as the step reads it. */
const readIn = (files: Files) => {
  const r = bibliographyReader(depsOf(files))(PAPER);
  if (r.kind !== "read") throw new Error(`not read: ${r.kind}`);
  return r.bibliography;
};

/** Run the build step on a paper held in memory; returns the files and the step's outcome. */
async function build(files: Files, check: CheckReferences) {
  const out = await referencesStep.run({
    ...ctx(files),
    checkReferences: check,
  });
  return { files, out };
}

/** Lint `paper.tex` of the paper in `files`. */
async function lint(files: Files) {
  const tex = new TextDecoder().decode(
    present(files.readBytes(absolutePath(`${PAPER}/paper.tex`)), "a paper.tex"),
  );
  const eslint = new ESLint({
    cwd: "/work",
    overrideConfigFile: true,
    overrideConfig: eslintConfig([
      {
        files: ["**/paper.tex"],
        plugins: {
          tex: { languages: { latex: texLanguage } },
          paper: { rules: referenceRules(depsOf(files)) },
        },
        language: "tex/latex",
        rules: REFERENCE_RULE_LEVELS,
      },
    ]),
  });
  const [res] = await eslint.lintText(tex, {
    filePath: join(PAPER, "paper.tex"),
  });
  return present(res, "one lint result").messages;
}

// ── a paper in memory, with the record its build would have written ────────────────────────

/**
 * A paper whose build opened `databases` (name → text), typeset `keys`, and wrote `written` itself. The
 * record is what `paperlint build` writes for it: the bytes of paper.tex and of every database TeX did
 * not write, hashed.
 */
function built(o: {
  readonly databases: Readonly<Record<string, string>>;
  readonly keys: readonly string[];
  readonly written?: readonly string[];
}): Files {
  const written = o.written ?? [];
  const record: SourcesRecord = {
    schema: 1,
    inputs: [{ path: "paper.tex", role: "body" }],
    written,
    bibdata: Object.keys(o.databases).map((d) => d.replace(/\.bib$/, "")),
    bibtex: {
      ran: true,
      databases: Object.keys(o.databases),
      keys: o.keys,
      exit: 0,
      errors: [],
    },
    sha256: Object.fromEntries([
      ["paper.tex", sha256Hex(bytes(TEX))] as const,
      ...Object.entries(o.databases)
        .filter(([name]) => !written.includes(name))
        .map(([name, text]) => [name, sha256Hex(bytes(text))] as const),
    ]),
  };
  return memoryFiles({
    [`${PAPER}/paper.tex`]: TEX,
    [`${PAPER}/_build/sources.json`]: serializeSourcesRecord(record),
    ...Object.fromEntries(
      Object.entries(o.databases).map(([name, text]) => [
        `${PAPER}/${name}`,
        text,
      ]),
    ),
  });
}

/** The ordinary paper: refs.bib with two entries, both typeset. */
const ordinary = () =>
  built({
    databases: { "refs.bib": ENTRIES },
    keys: ["schick2023", "other"],
  });

/** Rewrite the paper's record with `patch` laid over it. */
function patchRecord(files: Files, patch: (r: SourcesRecord) => SourcesRecord) {
  const path = `${PAPER}/_build/sources.json`;
  const r = sourcesCodec.parse(
    new TextDecoder().decode(present(files.map.get(path), "a record")),
  );
  if (!r.ok) throw new Error(r.why);
  files.map.set(path, bytes(serializeSourcesRecord(patch(r.record))));
}

// ── the planted papers of fixtures/paper-sources, with the record TeX wrote for each ───────

const PLANTED = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "fixtures",
  "paper-sources",
);

/** Every file of a planted paper under PAPER, and its `tex-truth.json` as the build's record. */
const planted = (paper: string, extra: Readonly<Record<string, string>> = {}) =>
  memoryFiles({
    ...Object.fromEntries(
      readdirSync(join(PLANTED, paper), {
        recursive: true,
        withFileTypes: true,
      })
        .filter((e) => e.isFile())
        .map((e) => {
          const at = join(e.parentPath, e.name);
          return [
            join(PAPER, relative(join(PLANTED, paper), at)),
            readFileSync(at, "utf8"),
          ];
        }),
    ),
    [`${PAPER}/_build/sources.json`]: readFileSync(
      join(PLANTED, paper, "tex-truth.json"),
      "utf8",
    ),
    ...Object.fromEntries(
      Object.entries(extra).map(([name, text]) => [`${PAPER}/${name}`, text]),
    ),
  });

describe("the references build step", () => {
  it("records a pass, with the hash of the databases it checked and no record of what bibtex read", async () => {
    const files = ordinary();
    const { out } = await build(
      files,
      checker([verdict("schick2023"), verdict("other")]),
    );
    expect(out.ok).toBe(true);
    const doc = readReferences(files, PAPER);
    expect(doc?.status).toBe("checked");
    expect(doc?.bib).toEqual({
      sources: ["refs.bib"],
      sha256: bibHash(readIn(files)),
    });
    // What bibtex read lives in sources.json, once.
    expect(doc).not.toHaveProperty("bibtex");
    expect(await lint(files)).toEqual([]);
  });

  it("🔴 offline: the step succeeds — the build is not failed — and lint warns once", async () => {
    const { files, out } = await build(ordinary(), offline);
    expect(out.ok).toBe(true);
    expect(readReferences(files, PAPER)?.status).toBe("not-checked");
    const msgs = await lint(files);
    expect(msgs.map((m) => [m.ruleId, m.severity])).toEqual([
      ["paper/refs-checked", 1],
    ]);
    expect(msgs[0]?.message).toMatch(/cannot be reached/);
  });

  it("a checker that throws is recorded as not checked, not as a failed build", async () => {
    const { files, out } = await build(ordinary(), () =>
      Promise.reject(new Error("DBLP exploded")),
    );
    expect(out.ok).toBe(true);
    expect(readReferences(files, PAPER)?.why).toMatch(/DBLP exploded/);
  });
});

const ANSWER: CachedResponse = {
  fetched: "2026-09-27",
  response: { db: "crossref", transport: "ok", query: "doi" },
};
/** A checker that fetches `key` unless the cache has it, recording the cache it was handed. */
function fetching(key: string) {
  const seen: LookupCache[] = [];
  const check: CheckReferences = (_bib, cache) => {
    seen.push(cache);
    return Promise.resolve({
      check: { kind: "checked", entries: [verdict("schick2023")] },
      cache: cache.citations.has(key)
        ? cache
        : {
            citations: new Map([...cache.citations, [key, ANSWER]]),
            dblp: cache.dblp,
          },
    });
  };
  return { check, seen };
}
const cacheText = (files: Files): string | null => {
  const b = files.readBytes(absolutePath(lookupCachePath(PAPER)));
  return b === null ? null : new TextDecoder().decode(b);
};

describe("the lookup cache — <paper>/repro/references-cache.json", () => {
  it("a build that fetched writes the cache; the next build is handed it and writes nothing", async () => {
    const f = fetching("crossref:doi:10.1/x");
    const { files, out } = await build(ordinary(), f.check);
    expect(out).toEqual({
      ok: true,
      note: "references: 1 checked, 0 failing → _build/references.json; 1 new answer → repro/references-cache.json",
    });
    const written = cacheText(files);
    expect(written).toBe(
      serializeLookupCache({
        citations: new Map([["crossref:doi:10.1/x", ANSWER]]),
        dblp: new Map(),
      }),
    );
    const again = await referencesStep.run({
      ...ctx(files),
      checkReferences: f.check,
    });
    expect(again).toEqual({
      ok: true,
      note: "references: 1 checked, 0 failing → _build/references.json; nothing fetched",
    });
    // The second build was handed exactly what the first one wrote.
    expect(parseLookupCache(present(written, "the written cache"))).toEqual(
      ok(f.seen[1]),
    );
    expect(cacheText(files)).toBe(written);
  });
});

describe("the lookup cache — counting", () => {
  it("two new answers are counted as two", async () => {
    const two: CheckReferences = (_bib, cache) =>
      Promise.resolve({
        check: { kind: "checked", entries: [verdict("schick2023")] },
        cache: {
          citations: new Map([
            ["a", ANSWER],
            ["b", ANSWER],
          ]),
          dblp: cache.dblp,
        },
      });
    const { out } = await build(ordinary(), two);
    expect(out).toEqual({
      ok: true,
      note: "references: 1 checked, 0 failing → _build/references.json; 2 new answers → repro/references-cache.json",
    });
  });

  it("no answer fetched and no cache on disk: no cache file is created", async () => {
    const { files } = await build(ordinary(), checker([verdict("schick2023")]));
    expect(cacheText(files)).toBeNull();
  });

  // Guards: an answer asked again after MAX_AGE_DAYS keeps its key, so the key count does not change.
  // Counted by size, the refreshed answer was not written, and every later build asked it again.
  it("an answer refreshed under the same key is counted and written", async () => {
    const OLD: CachedResponse = { ...ANSWER, fetched: "2026-08-01" };
    const put =
      (answer: CachedResponse): CheckReferences =>
      (_bib, cache) =>
        Promise.resolve({
          check: { kind: "checked", entries: [verdict("schick2023")] },
          cache: {
            citations: new Map([...cache.citations, ["a", answer]]),
            dblp: cache.dblp,
          },
        });
    const { files } = await build(ordinary(), put(OLD));
    const again = await referencesStep.run({
      ...ctx(files),
      checkReferences: put(ANSWER),
    });
    expect({ again, file: cacheText(files) }).toEqual({
      again: {
        ok: true,
        note: "references: 1 checked, 0 failing → _build/references.json; 1 new answer → repro/references-cache.json",
      },
      file: serializeLookupCache({
        citations: new Map([["a", ANSWER]]),
        dblp: new Map(),
      }),
    });
  });
});

describe("the lookup cache — refusing", () => {
  it("🔴 a cache that does not parse is refused BY NAME and left alone — the check is not run over half a cache", async () => {
    const files = ordinary();
    files.map.set(lookupCachePath(PAPER), bytes('{"schema": 7}'));
    const f = fetching("k");
    const out = await referencesStep.run({
      ...ctx(files),
      checkReferences: f.check,
    });
    expect(out).toEqual({
      ok: true,
      note: "references NOT checked — repro/references-cache.json cannot be read (schema 7: this paperlint reads schema 1) — fix it, or delete it to ask every question again; lint will say so",
    });
    expect(f.seen).toEqual([]);
    expect(cacheText(files)).toBe('{"schema": 7}');
    expect(readReferences(files, PAPER)?.status).toBe("not-checked");
  });
});

describe("the reference rules", () => {
  it("one mismatched entry → paper/author-list at that entry, naming its file, line and column", async () => {
    const { files } = await build(
      ordinary(),
      checker([verdict("schick2023", "mismatch"), verdict("other")]),
    );
    const msgs = await lint(files);
    expect(msgs.map((m) => [m.ruleId, m.line, m.column])).toEqual([
      ["paper/author-list", 1, 1],
    ]);
    expect(msgs[0]?.message).toMatch(
      /^refs\.bib:1:1: `schick2023`.*missing hambro/,
    );
  });

  it("an identifier that provably fails → paper/cite-exists on that entry", async () => {
    const { files } = await build(
      ordinary(),
      checker([verdict("schick2023"), verdict("other", "skipped", "false")]),
    );
    const msgs = await lint(files);
    expect(msgs.map((m) => [m.ruleId, m.message.split(": ")[0]])).toEqual([
      ["paper/cite-exists", "refs.bib:6:1"],
    ]);
  });

  it("a database in a subfolder is named as bibtex names it", async () => {
    const files = built({
      databases: { "bibs/x.bib": ENTRIES },
      keys: ["schick2023", "other"],
    });
    await build(
      files,
      checker([verdict("schick2023"), verdict("other", "skipped", "false")]),
    );
    expect((await lint(files)).map((m) => m.message.split(": ")[0])).toEqual([
      "bibs/x.bib:6:1",
    ]);
  });

  it("only paper.tex is judged", () => {
    const rules = referenceRules(depsOf(memoryFiles({})));
    for (const rule of Object.values(rules))
      expect(
        rule.create({
          filename: `${PAPER}/notes.tex`,
          cwd: "/work",
          sourceCode: {
            raw: "",
            getLocFromIndex: () => ({ line: 1, column: 0 }),
          },
          report: () => {
            throw new Error("a file that is not paper.tex is never reported");
          },
        }),
      ).toEqual({});
  });
});

describe("the references step and the rules, when there is no usable record of the build", () => {
  it("🔴 never built: the step checks nothing and records nothing; the rules are silent — paper/sources-fresh speaks", async () => {
    const files = memoryFiles({
      [`${PAPER}/paper.tex`]: TEX,
      [`${PAPER}/refs.bib`]: ENTRIES,
    });
    const { out } = await build(files, never);
    expect(out).toEqual({
      ok: true,
      note: "references NOT checked — the build recorded no sources (_build/sources.json was not written); lint will say so",
    });
    expect(readReferences(files, PAPER)).toBeNull();
    expect(await lint(files)).toEqual([]);
  });

  it("a record this paperlint cannot read is named", async () => {
    const files = ordinary();
    files.map.set(`${PAPER}/_build/sources.json`, bytes('{"schema":2}'));
    const { out } = await build(files, never);
    expect(out).toEqual({
      ok: true,
      note: "references NOT checked — _build/sources.json cannot be used (sources.json is schema 2, this paperlint reads schema 1); lint will say so",
    });
  });

  it("🔴 a record older than the paper: the step checks nothing, and the verdicts already on disk are not judged", async () => {
    const files = ordinary();
    await build(
      files,
      checker([verdict("schick2023", "mismatch"), verdict("other")]),
    );
    files.map.set(
      `${PAPER}/refs.bib`,
      bytes(ENTRIES.replace("Schick, Timo", "Schick, Timo and Hambro, Eric")),
    );
    expect(await lint(files)).toEqual([]);
    const { out } = await build(files, never);
    expect(out).toEqual({
      ok: true,
      note: "references NOT checked — the paper changed since the build recorded it (refs.bib edited); lint will say so",
    });
  });

  it("no reader wired into the build: it says so, and checks nothing", async () => {
    const note = await recordReferences(
      ordinary(),
      PAPER,
      notWiredBibliography(PAPER),
      never,
    );
    expect(note).toBe(
      "references NOT checked — no bibliography reader was wired into this build; lint will say so",
    );
  });
});

describe("the reference rules, when the verdicts are not about the databases the record names", () => {
  it("🔴 a later build recorded the databases, but its references step did not run → refs-fresh, and the stale verdicts are not judged", async () => {
    const files = ordinary();
    await build(
      files,
      checker([verdict("schick2023", "mismatch"), verdict("other")]),
    );
    // The next build edited refs.bib and recorded it (sources.json is rewritten after every compile)
    // and stopped before the references step: references.json is about the earlier refs.bib.
    const edited = ENTRIES.replace("Schick, Timo", "Schick, Timo and Hambro");
    files.map.set(`${PAPER}/refs.bib`, bytes(edited));
    patchRecord(files, (r) => ({
      ...r,
      sha256: { ...r.sha256, "refs.bib": sha256Hex(bytes(edited)) },
    }));
    const msgs = await lint(files);
    expect(msgs.map((m) => [m.ruleId, m.severity])).toEqual([
      ["paper/refs-fresh", 2],
    ]);
  });

  it("the same databases, unchanged → silent", async () => {
    const files = ordinary();
    await build(files, checker([verdict("schick2023"), verdict("other")]));
    expect(await lint(files)).toEqual([]);
  });

  it("a paper whose build ran no bibtex gets nothing", async () => {
    const files = planted("v15-after-end");
    expect(await lint(files)).toEqual([]);
    expect(referencesPath(PAPER)).toBe(`${PAPER}/_build/references.json`);
  });

  it("a references.json of another schema, without entries, or not JSON reads as none", () => {
    for (const body of [
      JSON.stringify({ schema: 999, entries: [] }),
      // Schema 1 named one file in `bib.source`; the next build rewrites it.
      JSON.stringify({ schema: 1, entries: [] }),
      // Schema 2 recorded what bibtex read here; sources.json holds it now.
      JSON.stringify({ schema: 2, entries: [] }),
      JSON.stringify({ schema: 3 }),
      "null",
      "{",
    ]) {
      const files = memoryFiles({ [referencesPath(PAPER)]: body });
      expect(readReferences(files, PAPER)).toBeNull();
    }
  });
});

/** A references.json for the paper's databases as the build would write it, with `body` laid over it. */
const writeVerdicts = (files: Files, body: Record<string, unknown>): void => {
  files.writeAtomic(
    absolutePath(referencesPath(PAPER)),
    bytes(
      JSON.stringify({
        schema: 3,
        bib: { sources: ["refs.bib"], sha256: bibHash(readIn(files)) },
        ...body,
      }),
    ),
  );
};

describe("the reference rules over a references.json written by hand", () => {
  it("not-checked with no reason recorded says so", async () => {
    const files = ordinary();
    writeVerdicts(files, { status: "not-checked", entries: [] });
    const msgs = await lint(files);
    expect(msgs.map((m) => m.ruleId)).toEqual(["paper/refs-checked"]);
    expect(msgs[0]?.message).toMatch(/no reason recorded/);
  });

  it("a record of the build and no verdicts yet: the references have not been checked", async () => {
    const msgs = await lint(ordinary());
    expect(msgs.map((m) => [m.ruleId, m.severity])).toEqual([
      ["paper/refs-checked", 1],
    ]);
    expect(msgs[0]?.message).toMatch(/npx paperlint build/);
  });

  it("a verdict without a reason still reports, on the entry it is about", async () => {
    const files = ordinary();
    writeVerdicts(files, {
      status: "checked",
      entries: [
        { key: "schick2023", exists: "true", authors: "mismatch" },
        { key: "other", exists: "false", authors: "match" },
      ],
    });
    const msgs = await lint(files);
    expect(msgs.map((m) => [m.ruleId, m.message.split(": ")[0]])).toEqual([
      ["paper/author-list", "refs.bib:1:1"],
      ["paper/cite-exists", "refs.bib:6:1"],
    ]);
  });

  it("verdicts that are not one per entry, in order, are not about these databases: refs-fresh", async () => {
    const files = ordinary();
    const judged = async (entries: readonly EntryVerdict[]) => {
      writeVerdicts(files, { status: "checked", entries });
      return (await lint(files)).map((m) => m.ruleId);
    };
    expect([
      await judged([verdict("schick2023", "mismatch")]),
      await judged([verdict("other"), verdict("schick2023", "mismatch")]),
    ]).toEqual([["paper/refs-fresh"], ["paper/refs-fresh"]]);
  });
});

describe("the references step checks the databases bibtex opened (tex-truth.json)", () => {
  it.each([
    ["v1-stale", ["refs.bib"], ["stale2020"]],
    ["v3-declared", ["paper.bib"], ["declared2023"]],
    // Two databases in one `\bibliography`, in the order bibtex opened them.
    ["v26-comment-in-names", ["one.bib", "two.bib"], ["onekey", "twokey"]],
    // Both databases sit in the folder; the switch decided which one TeX read, and bibtex opened one.
    ["v10-ifthenelse", ["anon.bib"], ["anonkey"]],
    // The comment lines are bibtex's entries, not the reader's: the post-build check names them.
    ["v13-percent-text", ["refs.bib"], ["ok1"]],
  ])("%s: checks %j, keys %j", async (paper, sources, keys) => {
    const files = planted(paper);
    const f = passing();
    await build(files, f.check);
    expect({
      sources: readReferences(files, PAPER)?.bib.sources,
      keys: f.handed,
    }).toEqual({ sources, keys });
  });

  it("a database TeX wrote that is on disk (the build's leftover) is checked as bibtex read it", async () => {
    const files = planted("v8-jobname", {
      "paper.bib": "@misc{jkey, title={J}, author={Doe, J}, year={2024}}\n",
    });
    const f = passing();
    await build(files, f.check);
    expect(f.handed).toEqual(["jkey"]);
    expect(readReferences(files, PAPER)?.bib.sources).toEqual(["paper.bib"]);
  });

  it("two entries sharing a key across databases each get a verdict, in order", async () => {
    const copy = (title: string) =>
      `@misc{k,\n  title = {${title}},\n  url = {https://x.org}\n}\n`;
    const files = built({
      databases: { "a.bib": copy("Good"), "b.bib": `\n\n${copy("Fake")}` },
      keys: ["k"],
    });
    await referencesStep.run({
      ...ctx(files),
      checkReferences: (bib, cache) =>
        Promise.resolve({
          check: {
            kind: "checked",
            entries: bib.map((e) => ({
              key: e.key,
              exists: e.fields["title"] === "Fake" ? "false" : "true",
              authors: "match",
            })),
          },
          cache,
        }),
    });
    const msgs = await lint(files);
    expect(msgs.map((m) => [m.ruleId, m.message.split(": ")[0]])).toEqual([
      ["paper/cite-exists", "b.bib:3:1"],
    ]);
  });
});

describe("when there is nothing bibtex opened, the step says why — and records nothing", () => {
  it.each(["v15-after-end", "v22-parked-thebibliography"])(
    "%s: the build ran no bibtex",
    async (paper) => {
      const files = planted(paper);
      const { out } = await build(files, never);
      expect(out).toEqual({
        ok: true,
        note: "no bibliography database — bibtex opened none, nothing to check",
      });
      expect(readReferences(files, PAPER)).toBeNull();
    },
  );

  it("a bibtex that ran and opened no database leaves nothing to check either", async () => {
    const files = ordinary();
    patchRecord(files, (r) => ({
      ...r,
      bibtex: r.bibtex.ran ? { ...r.bibtex, databases: [] } : r.bibtex,
    }));
    const { out } = await build(files, never);
    expect(out).toEqual({
      ok: true,
      note: "no bibliography database — bibtex opened none, nothing to check",
    });
    expect(await lint(files)).toEqual([]);
  });

  it("🔴 a database TeX wrote that is not on disk cannot be read: the step says which, and lint warns", async () => {
    const files = planted("v11-two-blocks");
    const { out } = await build(files, never);
    expect(out).toEqual({
      ok: true,
      note: "references NOT checked — refs.bib, which bibtex opened, is not on disk; lint will say so",
    });
    expect(readReferences(files, PAPER)).toBeNull();
    const msgs = await lint(files);
    expect(msgs.map((m) => [m.ruleId, m.severity])).toEqual([
      ["paper/refs-checked", 1],
    ]);
    expect(msgs[0]?.message).toMatch(/refs\.bib.*not on disk/);
  });
});

describe("what bibtex typeset, against what paperlint read (the post-build check)", () => {
  it("🔴 entries bibtex read that the reader does not see (behind `%`, inside `@comment`) → one refs-checked finding names them", async () => {
    const files = planted("v13-percent-text");
    await build(files, passing().check);
    const msgs = await lint(files);
    expect(msgs.map((m) => [m.ruleId, m.severity])).toEqual([
      ["paper/refs-checked", 1],
    ]);
    expect(msgs[0]?.message).toMatch(/`pt1`, `k2inComment`/);
  });

  it("an entry the reader read and bibtex typeset is not named", async () => {
    const files = planted("v1-stale");
    await build(files, passing().check);
    expect(await lint(files)).toEqual([]);
  });

  it("an entry the reader read and bibtex did not typeset (not cited) is not named", async () => {
    const files = ordinary();
    patchRecord(files, (r) => ({
      ...r,
      bibtex: r.bibtex.ran ? { ...r.bibtex, keys: ["schick2023"] } : r.bibtex,
    }));
    await build(files, passing().check);
    expect(await lint(files)).toEqual([]);
  });

  it("🔴 bibtex's keys are case-insensitive: `\\cite{SMITH}` typesets `\\bibitem{SMITH}` from an entry `smith`", async () => {
    // Measured: pdflatex and bibtex on `\cite{SMITH}` with `@misc{smith,…}` write `\bibitem{SMITH}`.
    const files = built({
      databases: { "refs.bib": "@misc{smith, url = {https://x.org}}\n" },
      keys: ["SMITH"],
    });
    await build(files, passing().check);
    expect(await lint(files)).toEqual([]);
  });

  it("unseenKeys: the typeset keys no entry read has, in the order bibtex typeset them, each once", () => {
    const files = built({
      databases: { "refs.bib": "@misc{a, url = {https://x.org}}\n" },
      keys: ["a", "x", "A", "y", "x"],
    });
    expect(unseenKeys(readIn(files))).toEqual(["x", "y"]);
  });
});

describe("reading what bibtex left", () => {
  it("bibtexRead: the databases the .blg names, the keys the .bbl typesets — natbib's labels too", () => {
    expect(
      bibtexRead(
        "This is BibTeX\nDatabase file #1: refs.bib\nDatabase file #2: /lib/shared.bib\n",
        "\\bibitem{plain}\n\\bibitem[{Smith et~al.(2020)}]{smith}\n\\bibitem[Doe(2019)]{doe}\n",
      ),
    ).toEqual({
      databases: ["refs.bib", "/lib/shared.bib"],
      bibitems: ["plain", "smith", "doe"],
    });
  });
});
