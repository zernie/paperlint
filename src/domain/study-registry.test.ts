/**
 * The study registry (`src/domain/study-registry.ts`): the judge over `repro/`'s study folders, the
 * registry and the README's index; the generated index; the next id and the slug. Both halves: a
 * registered `repro/` with its index in sync is clean, and each defect is reported once, with a text
 * that stands alone.
 */
import { format } from "prettier";
import { describe, expect, it } from "vitest";
import {
  INDEX_BEGIN,
  INDEX_END,
  addStudy,
  embeddedIndex,
  isStudyKind,
  indexBlock,
  judgeStudies,
  nextStudyId,
  registryText,
  studyIndex,
  studyMessage,
  studyReadme,
  studySlug,
  withIndex,
  type RegistryState,
  type Study,
  type StudyInput,
  type StudyRegistry,
} from "./study-registry.ts";

const study = (over: Partial<Study> = {}): Study => ({
  id: "P1-S01",
  folder: "P1-S01-baseline",
  title: "Baseline pass rate",
  question: "How often does the agent pass?",
  kind: "measurement",
  status: "designing",
  date: "2026-10-15",
  in_paper: "no",
  ...over,
});

const reg = (...studies: Study[]): StudyRegistry => ({
  prefix: "P1",
  studies,
});

const read = (r: StudyRegistry): RegistryState => ({
  kind: "read",
  registry: r,
});

/** A `repro/` whose folders are exactly the rows', with its index in sync, then `over`. */
const input = (
  r: StudyRegistry,
  over: Partial<StudyInput> = {},
): StudyInput => ({
  folders: r.studies.map((s) => s.folder),
  registry: read(r),
  readme: withIndex("# Reproduction index\n", r),
  existingResults: new Set(),
  ...over,
});

const problems = (i: StudyInput): readonly string[] =>
  judgeStudies(i).map((f) => f.problem);

describe("judgeStudies — silent", () => {
  it("on a registered repro/ with its index in sync", () => {
    const done = study({
      id: "P1-S02",
      folder: "P1-S02-ablation",
      status: "done",
      result: "41 of 60 pass",
      result_file: "out/results.tsv",
    });
    const old = study({
      id: "P1-S03",
      folder: "P1-S03-old",
      status: "superseded",
      superseded_by: "P1-S02",
    });
    const r = reg(study(), done, old);
    expect(
      judgeStudies(
        input(r, {
          existingResults: new Set(["P1-S02-ablation/out/results.tsv"]),
        }),
      ),
    ).toEqual([]);
  });

  it("on a paper with no study folder and no registry", () => {
    expect(
      judgeStudies({
        folders: [],
        registry: { kind: "absent" },
        readme: null,
        existingResults: new Set(),
      }),
    ).toEqual([]);
  });

  it("on an empty registry with its index", () => {
    expect(judgeStudies(input(reg()))).toEqual([]);
  });

  it("on ids of three digits, and a title of exactly eight words", () => {
    const r = reg(
      study({
        id: "P1-S100",
        folder: "P1-S100-x",
        title: "one two three four five six seven eight",
      }),
    );
    expect(judgeStudies(input(r))).toEqual([]);
  });
});

describe("judgeStudies — the registry itself", () => {
  it("study folders and no studies.json: one finding naming the file and the folders", () => {
    expect(
      judgeStudies({
        folders: ["a-2026-10-01", "b-2026-10-02"],
        registry: { kind: "absent" },
        readme: null,
        existingResults: new Set(),
      }),
    ).toEqual([
      { problem: "no-registry", folders: ["a-2026-10-01", "b-2026-10-02"] },
    ]);
  });

  it("a studies.json that does not parse: one finding with the reason, nothing else judged", () => {
    expect(
      judgeStudies({
        folders: ["a-2026-10-01"],
        registry: { kind: "unreadable", why: "prefix: required" },
        readme: null,
        existingResults: new Set(),
      }),
    ).toEqual([{ problem: "unreadable", why: "prefix: required" }]);
  });
});

describe("judgeStudies — folders and rows", () => {
  it("an unregistered folder, with the next free id", () => {
    const r = reg(study());
    expect(
      judgeStudies(
        input(r, { folders: ["P1-S01-baseline", "spike-2026-10-12"] }),
      ),
    ).toEqual([
      { problem: "unregistered", folder: "spike-2026-10-12", next: "P1-S02" },
    ]);
  });

  it("a dangling row: its folder does not exist", () => {
    const r = reg(study());
    expect(judgeStudies(input(r, { folders: [] }))).toEqual([
      { problem: "no-folder", id: "P1-S01", folder: "P1-S01-baseline" },
    ]);
  });

  it("two rows for one folder, reported once", () => {
    const r = reg(study(), study({ id: "P1-S02" }));
    expect(problems(input(r))).toEqual(["two-rows", "folder-name"]);
    expect(
      judgeStudies(input(r)).find((f) => f.problem === "two-rows"),
    ).toEqual({
      problem: "two-rows",
      folder: "P1-S01-baseline",
      ids: ["P1-S01", "P1-S02"],
    });
  });
});

describe("judgeStudies — ids and folder names", () => {
  it.each([
    ["another prefix", "P2-S01"],
    ["one digit", "P1-S1"],
    ["no S", "P1-01"],
    ["lowercase", "p1-s01"],
  ])("a bad id — %s: %s", (_why, id) => {
    const r = reg(study({ id, folder: `${id}-x` }));
    expect(judgeStudies(input(r))).toEqual([
      { problem: "bad-id", id, prefix: "P1" },
    ]);
  });

  it("a duplicate id, reported once", () => {
    const r = reg(
      study(),
      study({ folder: "P1-S01-again" }),
      study({ folder: "P1-S01-thrice" }),
    );
    expect(judgeStudies(input(r))).toEqual([
      { problem: "duplicate-id", id: "P1-S01" },
    ]);
  });

  it.each([
    ["another id", "P1-S02-baseline"],
    ["no slug", "P1-S01"],
    ["a capital in the slug", "P1-S01-Baseline"],
    ["an underscore", "P1-S01-base_line"],
    ["the dated form", "baseline-2026-10-12"],
  ])("a folder that is not <id>-<slug> — %s: %s", (_why, folder) => {
    const r = reg(study({ folder }));
    expect(judgeStudies(input(r))).toEqual([
      { problem: "folder-name", id: "P1-S01", folder },
    ]);
  });

  it("a title over eight words", () => {
    const r = reg(
      study({ title: "one two three four five six seven eight nine" }),
    );
    expect(judgeStudies(input(r))).toEqual([
      { problem: "long-title", id: "P1-S01", words: 9 },
    ]);
  });
});

describe("judgeStudies — status", () => {
  it("done without result and result_file", () => {
    const r = reg(study({ status: "done" }));
    expect(judgeStudies(input(r))).toEqual([
      {
        problem: "no-result",
        id: "P1-S01",
        missing: ["result", "result_file"],
      },
    ]);
  });

  it("done with a result_file that does not exist", () => {
    const r = reg(
      study({ status: "done", result: "x", result_file: "results.tsv" }),
    );
    expect(judgeStudies(input(r))).toEqual([
      {
        problem: "result-file",
        id: "P1-S01",
        path: "results.tsv",
        why: "missing",
      },
    ]);
  });

  it("a result_file that exists is fine on any status", () => {
    const r = reg(study({ status: "running", result_file: "r.tsv" }));
    expect(
      judgeStudies(
        input(r, { existingResults: new Set(["P1-S01-baseline/r.tsv"]) }),
      ),
    ).toEqual([]);
  });

  it("superseded without a target, and with one that is not in the registry", () => {
    const r = reg(
      study({ status: "superseded" }),
      study({
        id: "P1-S02",
        folder: "P1-S02-x",
        status: "superseded",
        superseded_by: "P1-S09",
      }),
    );
    expect(judgeStudies(input(r))).toEqual([
      { problem: "no-successor", id: "P1-S01", superseded_by: null },
      { problem: "no-successor", id: "P1-S02", superseded_by: "P1-S09" },
    ]);
  });
});

describe("judgeStudies — a result_file outside its folder", () => {
  it.each([
    "../tools/numbers.tsv",
    "/etc/passwd",
    "a/../../b",
    "..\\tools\\numbers.tsv",
    "C:\\tools\\numbers.tsv",
    "C:/tools/numbers.tsv",
  ])("a result_file outside the folder: %s", (path) => {
    const r = reg(study({ status: "running", result_file: path }));
    expect(judgeStudies(input(r))).toEqual([
      { problem: "result-file", id: "P1-S01", path, why: "outside" },
    ]);
  });
});

describe("judgeStudies — the index", () => {
  const r = reg(study());

  it("no repro/README.md", () => {
    expect(judgeStudies(input(r, { readme: null }))).toEqual([
      { problem: "stale-index", why: "no-readme" },
    ]);
  });

  it("a README.md without the markers", () => {
    expect(judgeStudies(input(r, { readme: "# index\n" }))).toEqual([
      { problem: "stale-index", why: "no-markers" },
    ]);
  });

  it("a table prettier padded by display width, with wide characters, is in sync", async () => {
    const wide = reg(study({ title: "測定 A" }));
    const readme = await format(withIndex("# index\n", wide), {
      parser: "markdown",
    });
    expect(readme).not.toBe(withIndex("# index\n", wide));
    expect(judgeStudies(input(wide, { readme }))).toEqual([]);
  });

  it("a title with a backslash before a pipe stays one cell through prettier", async () => {
    const bs = reg(study({ title: "foo\\|bar" }));
    const readme = await format(withIndex("# index\n", bs), {
      parser: "markdown",
    });
    expect(judgeStudies(input(bs, { readme }))).toEqual([]);
    expect(readme).toContain("foo\\\\\\|bar");
  });

  it("a title carrying the end marker's text: in sync, and regenerating changes nothing", () => {
    const m = reg(study({ title: `x ${INDEX_END} y` }));
    const readme = withIndex("# index\n", m);
    expect(judgeStudies(input(m, { readme }))).toEqual([]);
    expect(withIndex(readme, m)).toBe(readme);
  });

  it("a block that differs from the registry by one character", () => {
    const readme = withIndex("# index\n", r).replace("designing", "running");
    expect(judgeStudies(input(r, { readme }))).toEqual([
      { problem: "stale-index", why: "differs" },
    ]);
  });
});

describe("the index", () => {
  it("is a table padded the way prettier writes one, a row per study, in registry order", () => {
    const r = reg(
      study(),
      study({
        id: "P1-S02",
        folder: "P1-S02-a-b",
        title: "Pipes | and\nbreaks",
        status: "done",
        result: "41 of 60",
        in_paper: "yes",
      }),
    );
    expect(studyIndex(r)).toBe(
      [
        "| id     | title               | status    | result   | in paper | folder                               |",
        "| ------ | ------------------- | --------- | -------- | -------- | ------------------------------------ |",
        "| P1-S01 | Baseline pass rate  | designing | —        | no       | [P1-S01-baseline/](P1-S01-baseline/) |",
        "| P1-S02 | Pipes \\| and breaks | done      | 41 of 60 | yes      | [P1-S02-a-b/](P1-S02-a-b/)           |",
      ].join("\n"),
    );
  });

  it.each([
    ["two studies, Cyrillic, a dash and a mark", 2],
    ["no study", 0],
  ])("is left as it is by prettier: %s", async (_why, n) => {
    const r = reg(
      ...[
        study(),
        study({
          id: "P1-S02",
          folder: "P1-S02-a-b",
          title: "Pipes | and\nbreaks — Проверка",
          status: "done",
          result: "41 of 60 — ✓",
          in_paper: "yes",
        }),
      ].slice(0, n),
    );
    const md = withIndex("# Reproduction index\n\nSome text.\n", r);
    expect(await format(md, { parser: "markdown" })).toBe(md);
  });
});

describe("the index of an empty registry, and its markers", () => {
  it("of an empty registry is the header alone", () => {
    expect(studyIndex(reg())).toBe(
      [
        "| id  | title | status | result | in paper | folder |",
        "| --- | ----- | ------ | ------ | -------- | ------ |",
      ].join("\n"),
    );
  });

  it("sits between the two markers, a blank line on each side", () => {
    expect(indexBlock(reg())).toBe(
      `${INDEX_BEGIN}\n\n${studyIndex(reg())}\n\n${INDEX_END}`,
    );
  });

  it("is read back from a README as the text between the markers, or null", () => {
    expect(embeddedIndex(`# x\n\n${indexBlock(reg())}\n`)).toBe(
      `\n\n${studyIndex(reg())}\n\n`,
    );
    expect(embeddedIndex("# x\n")).toBeNull();
    expect(embeddedIndex(`${INDEX_END}\n${INDEX_BEGIN}\n`)).toBeNull();
  });
});

describe("withIndex", () => {
  const r = reg(study());

  it("replaces the block in place and keeps the rest", () => {
    const before = `# Index\n\nintro\n\n${indexBlock(reg())}\n\ntail\n`;
    expect(withIndex(before, r)).toBe(
      `# Index\n\nintro\n\n${indexBlock(r)}\n\ntail\n`,
    );
  });

  it("appends the block to a README without markers", () => {
    expect(withIndex("# Index\n\nintro", r)).toBe(
      `# Index\n\nintro\n\n${indexBlock(r)}\n`,
    );
  });

  it("writes a README when there is none", () => {
    expect(withIndex(null, r)).toBe(
      `# Reproduction index\n\n${indexBlock(r)}\n`,
    );
  });

  it("is a fixed point: a second run changes nothing", () => {
    const once = withIndex("# Index\n", r);
    expect(withIndex(once, r)).toBe(once);
  });
});

describe("nextStudyId", () => {
  it("is S01 in an empty registry", () => {
    expect(nextStudyId(reg())).toBe("P1-S01");
  });

  it("is one past the highest number, whatever the order and the gaps", () => {
    expect(
      nextStudyId(
        reg(
          study({ id: "P1-S07" }),
          study({ id: "P1-S02" }),
          study({ id: "bad" }),
        ),
      ),
    ).toBe("P1-S08");
  });

  it("grows past two digits", () => {
    expect(nextStudyId(reg(study({ id: "P1-S99" })))).toBe("P1-S100");
  });
});

describe("studySlug", () => {
  it.each([
    ["Baseline pass rate", "baseline-pass-rate"],
    ["  GPT-5 vs. Claude: 3 arms ", "gpt-5-vs-claude-3-arms"],
    ["Café réglé", "cafe-regle"],
    ["Проверка", ""],
  ])("%s → %s", (title, slug) => {
    expect(studySlug(title)).toBe(slug);
  });
});

describe("registryText", () => {
  it("is the registry as JSON, two-space indented, extra fields kept, with a final newline", () => {
    const r = reg(study({ role: "counted", rules_under_test: ["a", "b"] }));
    expect(registryText(r)).toBe(`${JSON.stringify(r, null, 2)}\n`);
    expect(JSON.parse(registryText(r))).toEqual(r);
  });
});

/** Each finding, and the head of the text it is reported with. */
const MESSAGES = [
  [
    { problem: "no-registry", folders: ["a-2026-10-01", "b-2026-10-02"] },
    '`repro/` holds study folders (`a-2026-10-01/`, `b-2026-10-02/`) but no `repro/studies.json`, the registry that gives every study an id, a plain name and a status. What to do: write `repro/studies.json` with the paper\'s prefix — `{ "prefix": "P1", "studies": [] }` — then give each folder its row and rename it to `<id>-<slug>`; a new study is created with `npx paperlint studies new <paper-dir> "<title>"`.',
  ],
  [
    { problem: "unreadable", why: "prefix: required" },
    "`repro/studies.json` is not a study registry: prefix: required. Its shape is on the rule's page.",
  ],
  [
    { problem: "unregistered", folder: "spike-2026-10-12", next: "P1-S02" },
    '`repro/spike-2026-10-12/` has no row in `repro/studies.json`, and every study folder has exactly one. What to do: add its row with the next free id, `P1-S02`, and rename the folder to `P1-S02-<slug>`; a new study is created with `npx paperlint studies new <paper-dir> "<title>"`, which does both.',
  ],
  [
    { problem: "no-folder", id: "P1-S01", folder: "P1-S01-x" },
    "`repro/studies.json`: the row `P1-S01` names the folder `repro/P1-S01-x/`, which does not exist. What to do: rename the study's folder to it, or correct the row's `folder`.",
  ],
  [
    { problem: "two-rows", folder: "P1-S01-x", ids: ["P1-S01", "P1-S02"] },
    "`repro/studies.json`: the rows `P1-S01`, `P1-S02` all name the folder `repro/P1-S01-x/`, and a study folder has exactly one row. What to do: keep one row for it.",
  ],
  [
    { problem: "bad-id", id: "P1-S1", prefix: "P1" },
    "`repro/studies.json`: the id `P1-S1` is not `P1-S` followed by two or more digits (`P1-S01`). What to do: give the row the next free id and rename its folder to match.",
  ],
  [
    { problem: "duplicate-id", id: "P1-S01" },
    "`repro/studies.json`: the id `P1-S01` is on more than one row, and an id names one study. What to do: give each other row the next free id and rename its folder to match.",
  ],
  [
    { problem: "folder-name", id: "P1-S01", folder: "x" },
    "`repro/studies.json`: the row `P1-S01` names the folder `x`, which is not `P1-S01-<slug>` — the id, then lowercase letters and digits in words joined by hyphens. What to do: rename the folder and the row's `folder` together.",
  ],
  [
    { problem: "long-title", id: "P1-S01", words: 9 },
    "`repro/studies.json`: the title of `P1-S01` has 9 words; a title is a plain name of at most 8. What to do: shorten it, and put the detail in `question`.",
  ],
  [
    { problem: "no-result", id: "P1-S01", missing: ["result"] },
    "`repro/studies.json`: `P1-S01` is `done` without `result`. What to do: write the one-line result and the file it is read from (`result`, `result_file`), or set the status it really has.",
  ],
  [
    {
      problem: "result-file",
      id: "P1-S01",
      path: "r.tsv",
      why: "missing",
    },
    "`repro/studies.json`: the `result_file` of `P1-S01`, `r.tsv`, is not a file in its folder. What to do: name a file that exists, relative to the study's folder.",
  ],
  [
    {
      problem: "result-file",
      id: "P1-S01",
      path: "../r.tsv",
      why: "outside",
    },
    "`repro/studies.json`: the `result_file` of `P1-S01`, `../r.tsv`, is outside its folder. What to do: name a file that exists, relative to the study's folder.",
  ],
  [
    { problem: "no-successor", id: "P1-S01", superseded_by: null },
    "`repro/studies.json`: `P1-S01` is `superseded` without `superseded_by`. What to do: name the id of the study that replaced it.",
  ],
  [
    { problem: "no-successor", id: "P1-S01", superseded_by: "P1-S09" },
    "`repro/studies.json`: `P1-S01` is `superseded` by `P1-S09`, which is no study in the registry. What to do: name the id of the study that replaced it.",
  ],
  [
    { problem: "stale-index", why: "differs" },
    "The index in `repro/README.md` (between the `studies:begin` and `studies:end` markers) is not the one `repro/studies.json` generates. What to do: run `npx paperlint studies index <paper-dir>`; the block is generated, never edited by hand.",
  ],
  [
    { problem: "stale-index", why: "no-markers" },
    "`repro/README.md` has no index of the studies (the `studies:begin` and `studies:end` markers). What to do: run `npx paperlint studies index <paper-dir>`; the block is generated, never edited by hand.",
  ],
  [
    { problem: "stale-index", why: "no-readme" },
    "`repro/README.md`, the index of the studies, does not exist. What to do: run `npx paperlint studies index <paper-dir>`; the block is generated, never edited by hand.",
  ],
] as const;

describe("studyMessage — stands alone", () => {
  const RULE =
    "Rule repro/study-registered: https://github.com/zernie/paperlint/blob/main/docs/rules/repro/study-registered.md";

  it.each(MESSAGES)("%j", (finding, head) => {
    expect(studyMessage(finding)).toBe(`${head}\n${RULE}`);
  });
});

describe("addStudy", () => {
  const NEW = {
    title: "Baseline pass rate",
    kind: "spike",
    date: "2026-10-15",
  } as const;

  it("appends the next id, its folder, designing, not in the paper, an empty question", () => {
    const r = reg(study({ id: "P1-S04", folder: "P1-S04-x", foo: 1 }));
    const out = addStudy(r, { ...NEW, title: "  Baseline\n pass   rate " });
    const added: Study = {
      id: "P1-S05",
      folder: "P1-S05-baseline-pass-rate",
      title: "Baseline pass rate",
      question: "",
      kind: "spike",
      status: "designing",
      date: "2026-10-15",
      in_paper: "no",
    };
    expect(out).toEqual({
      ok: true,
      registry: { prefix: "P1", studies: [...r.studies, added] },
      study: added,
    });
  });

  it.each([
    ["an empty title", "  ", "the title is empty"],
    [
      "nine words",
      "one two three four five six seven eight nine",
      "the title has 9 words; a title is a plain name of at most 8 — the detail goes in the row's `question`",
    ],
    [
      "no Latin letter or digit",
      "Проверка гипотезы",
      "the title has no Latin letter or digit to name the folder by; give it one (an English title, or a word such as the method's name)",
    ],
  ])("refuses %s", (_why, title, why) => {
    expect(addStudy(reg(), { ...NEW, title })).toEqual({ ok: false, why });
  });
});

describe("isStudyKind", () => {
  it("is true for each kind and false for anything else", () => {
    expect(
      ["measurement", "spike", "tooling", "data", "artifact", "salvage"].every(
        isStudyKind,
      ),
    ).toBe(true);
    expect(isStudyKind("benchmark")).toBe(false);
  });
});

describe("studyReadme", () => {
  it("frontmatter with the id and the quoted title, then the sections", () => {
    expect(studyReadme(study({ title: 'A "quoted": title' }))).toBe(
      [
        "---",
        "id: P1-S01",
        'title: "A \\"quoted\\": title"',
        "---",
        "",
        '# P1-S01 — A "quoted": title',
        "",
        "Its row in `../studies.json` holds its status. When the study ends, set `status`, `result`,",
        "`result_file` and `in_paper` there, then run `npx paperlint studies index <paper-dir>`.",
        "",
        "## Question",
        "",
        "## How to run",
        "",
        "## Result",
        "",
      ].join("\n"),
    );
  });
});
