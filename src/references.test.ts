/**
 * The references a build checked, end to end without a network: the `references` build step
 * records what a (fake) checker answers, and the offline rules judge that record.
 *
 *   a pass is recorded, with the hash of the bibliography checked
 *   one mismatched entry → paper/author-list on THAT entry's line
 *   the bibliography edited after the build → paper/refs-fresh, and the per-entry rules go quiet
 *   offline → the step still succeeds (the build is not failed) and paper/refs-checked warns
 */
import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { eslintConfig } from "./cli.ts";
import { join } from "node:path";
import { memoryFiles } from "./adapters/memory/index.ts";
import { ok } from "./domain/result.ts";
import { absolutePath } from "./domain/paths.ts";
import type {
  CheckReferences,
  EntryVerdict,
} from "./ports/check-references.ts";
import { referencesStep } from "./build.ts";
import {
  bibHash,
  checkedBibliography,
  lookupCachePath,
  recordReferences,
  readReferences,
  referencesPath,
} from "./references.ts";
import { latexReader } from "./adapters/latex/index.ts";
import {
  notWiredSources,
  paperSources,
  sourcesReader,
} from "./paper-sources.ts";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseLookupCache,
  serializeLookupCache,
  type CachedResponse,
  type LookupCache,
} from "./domain/lookup-cache.ts";
import { referenceRules, REFERENCE_RULE_LEVELS } from "./reference-rules.ts";
import { texLanguage } from "../eslint-rules/latex-language.ts";
import { present } from "../test/support.ts";

const PAPER = "/work/papers/p";
const TEX = (entries: string) =>
  [
    "\\documentclass{acmart}",
    "\\begin{filecontents*}{refs.bib}",
    entries,
    "\\end{filecontents*}",
    "\\begin{document}",
    "x\\bibliography{refs}",
    "\\end{document}",
    "",
  ].join("\n");
const ENTRIES =
  "@inproceedings{schick2023,\n  title = {Toolformer},\n  author = {Schick, Timo},\n  booktitle = {NeurIPS}\n}\n@misc{other,\n  title = {Other},\n  url = {https://x.org}\n}";

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

/** The paper's sources over `files`, every file counted as committed. */
const depsOf = (files: ReturnType<typeof memoryFiles>) => ({
  files,
  latex: latexReader,
  committed: { isCommitted: () => true },
});

/** The bibliography the build checks for the paper in `files`. */
const checkedIn = (files: ReturnType<typeof memoryFiles>) => {
  const r = paperSources(PAPER, depsOf(files));
  if (!r.ok) throw new Error("no paper.tex");
  return present(checkedBibliography(r.value.bibliography), "the bibliography");
};

/** The step's context over `files`, with every port it does not use stubbed. */
const ctx = (files: ReturnType<typeof memoryFiles>) => ({
  readSources: sourcesReader(depsOf(files)),
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

/** Run the build step on a paper held in memory; returns the files and the step's outcome. */
async function build(tex: string, check: CheckReferences) {
  const files = memoryFiles({ [`${PAPER}/paper.tex`]: tex });
  const out = await referencesStep.run({
    ...ctx(files),
    checkReferences: check,
  });
  return { files, out };
}

/** Lint `tex` as the paper's paper.tex against what `files` recorded. */
async function lint(files: ReturnType<typeof memoryFiles>, tex: string) {
  files.writeAtomic(
    absolutePath(`${PAPER}/paper.tex`),
    new TextEncoder().encode(tex),
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

describe("the references build step", () => {
  it("records a pass, with the hash of the bibliography it checked", async () => {
    const tex = TEX(ENTRIES);
    const { files, out } = await build(
      tex,
      checker([verdict("schick2023"), verdict("other")]),
    );
    expect(out.ok).toBe(true);
    const doc = readReferences(files, PAPER);
    expect(doc?.status).toBe("checked");
    expect(doc?.bib).toEqual({
      sources: ["paper.tex"],
      sha256: bibHash(checkedIn(files)),
    });
    expect(await lint(files, tex)).toEqual([]);
  });

  it("🔴 offline: the step succeeds — the build is not failed — and lint warns once", async () => {
    const tex = TEX(ENTRIES);
    const { files, out } = await build(tex, offline);
    expect(out.ok).toBe(true);
    expect(readReferences(files, PAPER)?.status).toBe("not-checked");
    const msgs = await lint(files, tex);
    expect(msgs.map((m) => [m.ruleId, m.severity])).toEqual([
      ["paper/refs-checked", 1],
    ]);
    expect(msgs[0]?.message).toMatch(/cannot be reached/);
  });

  it("a checker that throws is recorded as not checked, not as a failed build", async () => {
    const { files, out } = await build(TEX(ENTRIES), () =>
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
const cacheText = (files: ReturnType<typeof memoryFiles>): string | null => {
  const b = files.readBytes(absolutePath(lookupCachePath(PAPER)));
  return b === null ? null : new TextDecoder().decode(b);
};

describe("the lookup cache — <paper>/repro/references-cache.json", () => {
  it("a build that fetched writes the cache; the next build is handed it and writes nothing", async () => {
    const f = fetching("crossref:doi:10.1/x");
    const { files, out } = await build(TEX(ENTRIES), f.check);
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

describe("the lookup cache — counting and refusing", () => {
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
    const { out } = await build(TEX(ENTRIES), two);
    expect(out).toEqual({
      ok: true,
      note: "references: 1 checked, 0 failing → _build/references.json; 2 new answers → repro/references-cache.json",
    });
  });

  it("no answer fetched and no cache on disk: no cache file is created", async () => {
    const { files } = await build(
      TEX(ENTRIES),
      checker([verdict("schick2023")]),
    );
    expect(cacheText(files)).toBeNull();
  });

  it("🔴 a cache that does not parse is refused BY NAME and left alone — the check is not run over half a cache", async () => {
    const files = memoryFiles({
      [`${PAPER}/paper.tex`]: TEX(ENTRIES),
      [lookupCachePath(PAPER)]: '{"schema": 7}',
    });
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
  it("one mismatched entry → paper/author-list on that entry's own line", async () => {
    const tex = TEX(ENTRIES);
    const { files } = await build(
      tex,
      checker([verdict("schick2023", "mismatch"), verdict("other")]),
    );
    const msgs = await lint(files, tex);
    expect(msgs.map((m) => m.ruleId)).toEqual(["paper/author-list"]);
    expect(msgs[0]?.line).toBe(3);
    expect(msgs[0]?.message).toMatch(/`schick2023`.*missing hambro/);
  });

  it("an identifier that provably fails → paper/cite-exists on that entry", async () => {
    const tex = TEX(ENTRIES);
    const { files } = await build(
      tex,
      checker([verdict("schick2023"), verdict("other", "skipped", "false")]),
    );
    const msgs = await lint(files, tex);
    expect(msgs.map((m) => [m.ruleId, m.line])).toEqual([
      ["paper/cite-exists", 8],
    ]);
  });

  it("🔴 the bibliography edited after the build → refs-fresh, and the stale verdicts are not judged", async () => {
    const { files } = await build(
      TEX(ENTRIES),
      checker([verdict("schick2023", "mismatch"), verdict("other")]),
    );
    const edited = TEX(
      ENTRIES.replace("Schick, Timo", "Schick, Timo and Hambro, Eric"),
    );
    const msgs = await lint(files, edited);
    expect(msgs.map((m) => [m.ruleId, m.severity])).toEqual([
      ["paper/refs-fresh", 2],
    ]);
  });

  it("the same bibliography, unchanged → silent", async () => {
    const tex = TEX(ENTRIES);
    const { files } = await build(tex, checker([verdict("schick2023")]));
    expect(await lint(files, tex)).toEqual([]);
  });

  it("never built → one warning naming the command", async () => {
    const files = memoryFiles({});
    const msgs = await lint(files, TEX(ENTRIES));
    expect(msgs.map((m) => m.ruleId)).toEqual(["paper/refs-checked"]);
    expect(msgs[0]?.message).toMatch(/npx paperlint build/);
  });

  it("a paper with no bibliography gets nothing", async () => {
    const files = memoryFiles({});
    expect(
      await lint(
        files,
        "\\documentclass{article}\n\\begin{document}x\\end{document}\n",
      ),
    ).toEqual([]);
    expect(referencesPath(PAPER)).toBe(`${PAPER}/_build/references.json`);
  });
});

describe("reading what is on disk", () => {
  it("a paper.tex that declares refs and embeds nothing: the bibliography is refs.bib, all of it", () => {
    const files = memoryFiles({
      [`${PAPER}/paper.tex`]:
        "\\documentclass{article}\\begin{document}\\bibliography{refs}\\end{document}",
      [`${PAPER}/refs.bib`]: ENTRIES,
    });
    const [bib] = checkedIn(files).texts;
    expect([bib.path, bib.body]).toEqual([
      `${PAPER}/refs.bib`,
      { start: 0, end: ENTRIES.length },
    ]);
  });

  it("a references.json of another schema, without entries, or not JSON reads as none", () => {
    for (const body of [
      JSON.stringify({ schema: 999, entries: [] }),
      // Schema 1 named one file in `bib.source`; the next build rewrites it.
      JSON.stringify({ schema: 1, entries: [] }),
      JSON.stringify({ schema: 2 }),
      "null",
      "{",
    ]) {
      const files = memoryFiles({ [referencesPath(PAPER)]: body });
      expect(readReferences(files, PAPER)).toBeNull();
    }
  });
});

/** A record for `bib`, as the build would write it, with `patch` applied to the document. */
const record = (
  files: ReturnType<typeof memoryFiles>,
  body: Record<string, unknown>,
) => {
  const bib = checkedIn(files);
  files.writeAtomic(
    absolutePath(referencesPath(PAPER)),
    new TextEncoder().encode(
      JSON.stringify({
        schema: 2,
        bib: { sources: ["paper.tex"], sha256: bibHash(bib) },
        ...body,
      }),
    ),
  );
};

describe("the reference rules over a record written by hand", () => {
  it("not-checked with no reason recorded says so", async () => {
    const tex = TEX(ENTRIES);
    const files = memoryFiles({ [`${PAPER}/paper.tex`]: tex });
    record(files, { status: "not-checked", entries: [] });
    const msgs = await lint(files, tex);
    expect(msgs.map((m) => m.ruleId)).toEqual(["paper/refs-checked"]);
    expect(msgs[0]?.message).toMatch(/no reason recorded/);
  });

  it("a verdict without a reason, and one for a key the bibliography lacks, still report", async () => {
    const tex = TEX(ENTRIES);
    const files = memoryFiles({ [`${PAPER}/paper.tex`]: tex });
    record(files, {
      status: "checked",
      entries: [
        { key: "schick2023", exists: "true", authors: "mismatch" },
        { key: "ghost", exists: "false", authors: "match" },
      ],
    });
    const msgs = await lint(files, tex);
    expect(msgs.map((m) => [m.ruleId, m.line])).toEqual([
      ["paper/cite-exists", 1],
      ["paper/author-list", 3],
    ]);
  });
});

describe("the reference rules over refs.bib, and on other files", () => {
  it("an external refs.bib: the finding sits at the \\bibliography that declares it, naming the entry's file, line and column", async () => {
    const tex =
      "\\documentclass{acmart}\n\\begin{document}x\n\\bibliography{refs}\\end{document}\n";
    const files = memoryFiles({
      [`${PAPER}/paper.tex`]: tex,
      [`${PAPER}/refs.bib`]: ENTRIES,
    });
    record(files, {
      status: "checked",
      entries: [verdict("schick2023", "mismatch")],
    });
    const msgs = await lint(files, tex);
    expect(msgs.map((m) => [m.ruleId, m.line, m.column])).toEqual([
      ["paper/author-list", 3, 1],
    ]);
    expect(msgs[0]?.message).toMatch(/^refs\.bib:1:1: `schick2023`/);
  });

  it("only paper.tex is judged", () => {
    const files = memoryFiles({});
    const rules = referenceRules(depsOf(files));
    for (const rule of Object.values(rules))
      expect(
        rule.create({
          filename: `${PAPER}/notes.tex`,
          cwd: "/work",
          sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
          report: () => {
            throw new Error("a file that is not paper.tex is never reported");
          },
        }),
      ).toEqual({});
  });
});

describe("the lookup cache — refreshed answers", () => {
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
    const { files } = await build(TEX(ENTRIES), put(OLD));
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

// ── the planted papers of fixtures/paper-sources: the build checks what TeX reads ─────────

const PLANTED = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "fixtures",
  "paper-sources",
);

/** Every file of a planted paper, held in memory under PAPER. */
const planted = (paper: string) =>
  memoryFiles(
    Object.fromEntries(
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
  );

describe("the references step reads the bibliography TeX reads (tex-truth.json)", () => {
  it.each([
    ["v1-stale", ["refs.bib"], ["stale2020"]],
    ["v2-overwrite", ["paper.tex"], ["inline2024"]],
    ["v3-declared", ["paper.bib"], ["declared2023"]],
    ["v4-commented", ["refs.bib"], ["stale2020"]],
    ["v5-percent-entry", ["paper.tex"], ["inline2024", "dead2020"]],
  ])("%s: checks %j, keys %j", async (paper, sources, keys) => {
    const files = planted(paper);
    const handed: string[] = [];
    await referencesStep.run({
      ...ctx(files),
      checkReferences: (bib, cache) => {
        handed.push(bib);
        return Promise.resolve({
          check: { kind: "checked", entries: [] },
          cache,
        });
      },
    });
    expect({
      sources: readReferences(files, PAPER)?.bib.sources,
      keys: [...(handed[0] ?? "").matchAll(/@\w+\{([^,]+),/g)].map((m) => m[1]),
    }).toEqual({ sources, keys });
  });
});

describe("when there is nothing TeX reads, the step says why — and records nothing", () => {
  const nothing = async (
    files: ReturnType<typeof memoryFiles>,
    wired = true,
  ) => {
    const note = await recordReferences(
      files,
      (wired ? sourcesReader(depsOf(files)) : notWiredSources)(PAPER),
      () => Promise.reject(new Error("never asked")),
    );
    return { note, record: readReferences(files, PAPER) };
  };
  const doc = (body: string) =>
    memoryFiles({
      [`${PAPER}/paper.tex`]: `\\documentclass{article}\\begin{document}${body}\\end{document}`,
    });

  it.each([
    ["no paper.tex", memoryFiles(), "no paper.tex — nothing to check"],
    ["no declaration", doc("x"), "no bibliography — nothing to check"],
    [
      "thebibliography",
      doc("\\begin{thebibliography}{9}\\bibitem{k} K.\\end{thebibliography}"),
      "the bibliography is written by hand (thebibliography) — no database to check",
    ],
    [
      "a declared database on no disk",
      doc("\\bibliography{gone}"),
      "no bibliography database on disk (gone: missing) — nothing to check",
    ],
  ])("%s", async (_what, files, note) => {
    expect(await nothing(files)).toEqual({ note, record: null });
  });

  it("no reader wired into the build: it says so, and lint will", async () => {
    expect((await nothing(doc("x"), false)).note).toBe(
      "references NOT checked — no paper reader was wired into this build; lint will say so",
    );
  });
});
