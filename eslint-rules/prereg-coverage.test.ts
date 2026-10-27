/**
 * `study/declare-sample`: the declaration a study's `prereg.json` carries — population, strata,
 * screens, coverage, the author's check — judged field by field, then across fields, then through
 * ESLint on a paper's `PIPELINE-STATUS.md` with study folders beside it.
 */
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REPRO_DIR as LAYOUT_REPRO_DIR,
  REPRO_DIRS,
} from "../src/domain/repro-layout.ts";
import { useTempDir, writeTree } from "../test/support.ts";
import preregCoverage, {
  REPRO_DIR,
  SHARED_DIRS,
  WHY,
  judgePrereg,
  pathText,
  paperFindings,
  preregFiles,
  preregProblems,
  problemMessage,
} from "./prereg-coverage.ts";

const PAGE =
  "https://github.com/zernie/paperlint/blob/main/docs/rules/study/declare-sample.md";

/** A declaration that passes: a sample screened down, saying so, and checked by its author. */
const GOOD = {
  study: "the author's own keys are not read",
  population: {
    about: "rules written in agent instruction files of public repositories",
    source: "a census of instruction files, crawled 2026-07-28",
    size: 4210,
  },
  strata: { by: "rule type", values: ["crisp", "parameterised", "vague"] },
  screens: [
    {
      name: "judgeable from one code excerpt of at most 40 lines",
      removed: { crisp: 120, parameterised: 410, vague: 1630 },
    },
  ],
  coverage: {
    share: 0.31,
    unreachable: ["vague", "rules about process rather than code"],
  },
  author_check: {
    who: "first author",
    when: "2026-10-12",
    units_seen: 24,
    units_drawn: 24,
    verdict: "representative",
  },
};

/** `GOOD` with `patch` merged into one of its object fields. */
const withField = (
  key: "coverage" | "author_check",
  patch: object,
): object => ({ ...GOOD, [key]: { ...GOOD[key], ...patch } });

/** The problems as `at: text`, the whole list. */
const judged = (data: unknown): string[] =>
  judgePrereg(data).map((p) => `${p.at}: ${p.text}`);

describe("judgePrereg", () => {
  it("a complete declaration, and keys the rule does not read: silent", () => {
    expect(judged(GOOD)).toEqual([]);
  });
});

describe("judgePrereg: the fields, missing", () => {
  it("an empty object: each of the five fields, with what to add", () => {
    expect(judged({})).toEqual([
      "population: is missing — add `population`: what the paper's claim is about (`about`), where its units come from (`source`) and how many there are (`size`)",
      "strata: is missing — add `strata`: the property the screens are counted by (`by`, e.g. rule type) and its values (`values`)",
      "screens: is missing — add `screens`: one entry per screen applied between the population and the sample, each with `name` and `removed` — [] when none was",
      "coverage: is missing — add `coverage`: the share of the population the sample can represent (`share`, 0 to 1, or null with a `reason`) and the strata it cannot reach (`unreachable`)",
      "author_check: is missing — add `author_check`: who looked at the drawn units before the run (`who`), when (`when`), how many of how many (`units_seen`, `units_drawn`), and what they said (`verdict`)",
    ]);
  });

  it("not an object at all: one problem about the file", () => {
    expect(judged([1])).toEqual([
      ": is not valid — it must be a JSON object holding `population`, `strata`, `screens`, `coverage` and `author_check`",
    ]);
  });

  it("the fields inside each part, missing", () => {
    expect(
      judged({
        ...GOOD,
        population: {},
        strata: {},
        screens: [{}],
        coverage: {},
        author_check: {},
      }),
    ).toEqual([
      "population.about: is missing — add what the paper's claim is about, in the paper's own words (e.g. the rules written in agent instruction files of public repositories)",
      "population.source: is missing — add where the population's units come from — the census, crawl or registry, with its date",
      "population.size: is missing — add the number of units in the population, a whole number above 0 (an estimate is fine; say how it was made in `source`)",
      "strata.by: is missing — add the property the units are stratified by, e.g. rule type",
      "strata.values: is missing — add the stratum's values, a list of names",
      "screens[0].name: is missing — add what the screen keeps, as it was applied (e.g. judgeable from one code excerpt of at most 40 lines)",
      "screens[0].removed: is missing — add the number of candidates the screen removed in each declared stratum value, an object {<value>: <count>} with 0 where it removed none",
      "coverage.share: is missing — add the share of the population the sample can represent, a number from 0 to 1, or null with a `reason`",
      "coverage.unreachable: is missing — add the strata (or kinds of units) the sample cannot reach, a list of names — [] only when it reaches them all",
      "author_check.who: is missing — add who looked at the drawn units (a name or a role)",
      "author_check.when: is missing — add the date of the check, YYYY-MM-DD",
      "author_check.units_seen: is missing — add how many of the drawn units — the rules or cases drawn, not the items made from them — the author looked at, a whole number above 0",
      "author_check.units_drawn: is missing — add how many units the sample drew",
      'author_check.verdict: is missing — add the author\'s answer to "is this what you meet in practice?" — one of representative, partly, not-representative',
    ]);
  });
});

describe("judgePrereg: the fields, malformed", () => {
  it("the fields inside each part, malformed", () => {
    expect(
      judged({
        ...GOOD,
        population: { about: "  ", source: 3, size: 0.5 },
        strata: { by: "rule type", values: [] },
        screens: [
          "a screen in a sentence",
          { name: "short", removed: { crisp: -1 } },
        ],
        coverage: { share: 1.5, reason: "", unreachable: "vague" },
        author_check: {
          who: "first author",
          when: "2026-02-30",
          units_seen: 0,
          units_drawn: 10,
          verdict: "fine",
          decision: { proceed: "yes" },
        },
      }),
    ).toEqual([
      "population.about: is empty — write what the paper's claim is about, in the paper's own words (e.g. the rules written in agent instruction files of public repositories)",
      "population.source: is not valid — it must be where the population's units come from — the census, crawl or registry, with its date",
      "population.size: is not valid — it must be the number of units in the population, a whole number above 0 (an estimate is fine; say how it was made in `source`)",
      "strata.values: is empty — list the stratum's values, at least one",
      "screens[0]: is not valid — it must be a screen: `name` and `removed`",
      "screens[1].removed.crisp: is not valid — it must be a count, a whole number from 0",
      "coverage.share: is not valid — it must be the share of the population the sample can represent, a number from 0 to 1, or null with a `reason`",
      "coverage.reason: is empty — write why the share cannot be stated",
      "coverage.unreachable: is not valid — it must be the strata (or kinds of units) the sample cannot reach, a list of names — [] only when it reaches them all",
      "author_check.when: is not valid — it must be the date of the check, YYYY-MM-DD",
      "author_check.units_seen: is not valid — it must be how many of the drawn units — the rules or cases drawn, not the items made from them — the author looked at, a whole number above 0",
      'author_check.verdict: is not valid — it must be the author\'s answer to "is this what you meet in practice?" — one of representative, partly, not-representative',
      "author_check.decision.proceed: is not valid — it must be whether the study runs on this sample, true or false",
      "author_check.decision.by: is missing — add who decided",
      "author_check.decision.why: is missing — add why, in a sentence",
    ]);
  });

  it("a decision that is not an object names the three fields it holds", () => {
    expect(
      judged(withField("author_check", { verdict: "partly", decision: "go" })),
    ).toEqual([
      "author_check.decision: is not valid — it must be the decision taken after the verdict: `proceed` (true or false), `by` whom, and `why`",
    ]);
  });
});

describe("judgePrereg: across fields", () => {
  it("`removed` keyed by other than the declared strata: each missing value and each unknown key", () => {
    expect(
      judged({
        ...GOOD,
        screens: [
          { name: "R1", removed: { crisp: 1, vague: 2, procedural: 3 } },
          { name: "R2", removed: {} },
        ],
      }),
    ).toEqual([
      "screens[0].removed.parameterised: is missing — every screen states how many candidates it removed in each declared stratum value (crisp, parameterised, vague), 0 where it removed none",
      "screens[0].removed.procedural: is not a declared stratum value — `strata.values` declares crisp, parameterised, vague; add it there or count it under one of them",
      "screens[1].removed.crisp: is missing — every screen states how many candidates it removed in each declared stratum value (crisp, parameterised, vague), 0 where it removed none",
      "screens[1].removed.parameterised: is missing — every screen states how many candidates it removed in each declared stratum value (crisp, parameterised, vague), 0 where it removed none",
      "screens[1].removed.vague: is missing — every screen states how many candidates it removed in each declared stratum value (crisp, parameterised, vague), 0 where it removed none",
    ]);
  });

  it("no screens at all is a declaration, not an omission: silent", () => {
    expect(judged({ ...GOOD, screens: [] })).toEqual([]);
  });

  it("🔴 a stratum value that Object.prototype also has must be counted in `removed` itself", () => {
    expect(
      judged({
        ...GOOD,
        strata: { by: "kind", values: ["constructor", "toString"] },
        screens: [{ name: "R1", removed: {} }],
      }),
    ).toEqual(
      ["constructor", "toString"].map(
        (v) =>
          `screens[0].removed.${v}: is missing — every screen states how many candidates it removed in each declared stratum value (constructor, toString), 0 where it removed none`,
      ),
    );
  });
});

describe("judgePrereg: the coverage", () => {
  it("a null share needs its reason; with one it is silent", () => {
    expect(judged(withField("coverage", { share: null }))).toEqual([
      "coverage.reason: is missing — `share` is null, so say why the share cannot be stated",
    ]);
    expect(
      judged(
        withField("coverage", {
          share: null,
          reason: "the census has no rule-type labels",
        }),
      ),
    ).toEqual([]);
  });

  it("a share of 1 with strata it cannot reach contradicts itself; a share below 1 may list them", () => {
    expect(
      judged(withField("coverage", { share: 1, unreachable: ["vague"] })),
    ).toEqual([
      "coverage.unreachable: contradicts `share` 1 — a sample that cannot reach «vague» does not represent the whole population: lower `share`, or empty the list",
    ]);
    expect(
      judged(withField("coverage", { share: 0.7, unreachable: ["vague"] })),
    ).toEqual([]);
  });
});

describe("judgePrereg: within the strata and the check", () => {
  it("a stratum value named twice", () => {
    expect(
      judged({
        ...GOOD,
        strata: { by: "rule type", values: ["crisp", "vague", "crisp"] },
        screens: [],
      }),
    ).toEqual([
      "strata.values: names «crisp» more than once — each stratum value once",
    ]);
  });

  it("more units seen than drawn", () => {
    expect(judged(withField("author_check", { units_seen: 30 }))).toEqual([
      "author_check.units_seen: is 30, more than the 24 units drawn (`units_drawn`)",
    ]);
  });

  it("a doubtful verdict without a decision is an error; with one, either way, it is silent", () => {
    const missing = (verdict: string): string =>
      `author_check.decision: is missing — the verdict is «${verdict}», and a doubtful verdict with no recorded decision is how a sample the author doubted gets run anyway: add \`proceed\` (true or false), \`by\` whom and \`why\``;
    expect(judged(withField("author_check", { verdict: "partly" }))).toEqual([
      missing("partly"),
    ]);
    expect(
      judged(withField("author_check", { verdict: "not-representative" })),
    ).toEqual([missing("not-representative")]);
    const decided = (proceed: boolean): string[] =>
      judged(
        withField("author_check", {
          verdict: "not-representative",
          decision: {
            proceed,
            by: "first author",
            why: "redrawn from the census",
          },
        }),
      );
    expect(decided(true)).toEqual([]);
    expect(decided(false)).toEqual([]);
  });
});

describe("preregProblems and the message", () => {
  it("text that is not JSON: one problem, with the parser's reason", () => {
    const problems = preregProblems("{ not json");
    expect(problems.map((p) => p.at)).toEqual([""]);
    expect(problems[0]?.text).toMatch(
      /^does not parse as JSON \(.+\) — there is no declaration to read$/u,
    );
  });

  it("JSON text is judged", () => {
    expect(preregProblems(JSON.stringify(GOOD))).toEqual([]);
  });

  it("a path as written in the file", () => {
    expect(pathText(["screens", 0, "removed", "vague"])).toBe(
      "screens[0].removed.vague",
    );
    expect(pathText([])).toBe("");
  });

  it("a message names the file and the field, then why, then the rule's page", () => {
    expect(
      problemMessage("repro/s-2026-10-12/prereg.json", {
        at: "coverage",
        text: "is missing — add it",
      }),
    ).toBe(
      `\`repro/s-2026-10-12/prereg.json\`: \`coverage\` is missing — add it. ${WHY} Rule study/declare-sample: ${PAGE}`,
    );
    expect(
      problemMessage("repro/s/prereg.json", { at: "", text: "is broken" }),
    ).toBe(
      `\`repro/s/prereg.json\` is broken. ${WHY} Rule study/declare-sample: ${PAGE}`,
    );
  });
});

const root = useTempDir("prereg-coverage-");

describe("which files are judged", () => {
  it("repro/ and its shared folders are the ones repro/allowed-files-only names", () => {
    expect(REPRO_DIR).toBe(LAYOUT_REPRO_DIR);
    expect(SHARED_DIRS).toEqual(REPRO_DIRS);
  });

  it("every study folder at the top of repro/ that holds a prereg.json, sorted; never tools/ or data/", () => {
    const dir = writeTree(join(root, "files"), {
      "repro/tools/prereg.json": "{}",
      "repro/data/prereg.json": "{}",
      "repro/Misnamed Study/prereg.json": "{}",
      "repro/b-2026-10-12/prereg.json": "{}",
      "repro/a-2026-10/prereg.json": "{}",
      "repro/no-prereg-2026-10-01/README.md": "# s\n",
      "repro/README.md": "# repro\n",
      "repro/a-2026-10/deeper/prereg.json": "{}",
    });
    expect(preregFiles(dir)).toEqual([
      "repro/Misnamed Study/prereg.json",
      "repro/a-2026-10/prereg.json",
      "repro/b-2026-10-12/prereg.json",
    ]);
  });

  it("no repro/, or a file named repro: nothing", () => {
    expect(preregFiles(writeTree(join(root, "none"), { "x.md": "" }))).toEqual(
      [],
    );
    expect(
      preregFiles(writeTree(join(root, "file"), { repro: "not a folder" })),
    ).toEqual([]);
  });

  it("the findings of a paper: each file's problems, each as its message", () => {
    const dir = writeTree(join(root, "findings"), {
      "repro/ok-2026-10-01/prereg.json": JSON.stringify(GOOD),
      "repro/bad-2026-10-02/prereg.json": JSON.stringify(
        withField("coverage", { share: null }),
      ),
    });
    expect(paperFindings(dir)).toEqual([
      `\`repro/bad-2026-10-02/prereg.json\`: \`coverage.reason\` is missing — \`share\` is null, so say why the share cannot be stated. ${WHY} Rule study/declare-sample: ${PAGE}`,
    ]);
  });

  it("🔴 a prereg.json that is a folder is a finding, not a crash of the whole lint run", () => {
    const dir = writeTree(join(root, "folder-prereg"), {
      "repro/s-2026-10-01/prereg.json/x.txt": "",
    });
    expect(paperFindings(dir)).toEqual([
      `\`repro/s-2026-10-01/prereg.json\` is not a file — the declaration is one JSON file; move what the folder holds elsewhere. ${WHY} Rule study/declare-sample: ${PAGE}`,
    ]);
  });
});

describe("which files are judged: through a link", () => {
  it("🔴 a study folder linked into repro/ is judged like any other: the layout rule follows the link too", () => {
    const dir = writeTree(join(root, "linked"), {
      "elsewhere/s-2026-10-01/prereg.json": "{}",
      "repro/README.md": "# repro\n",
    });
    symlinkSync(
      join(dir, "elsewhere", "s-2026-10-01"),
      join(dir, "repro", "s-2026-10-01"),
    );
    expect(preregFiles(dir)).toEqual(["repro/s-2026-10-01/prereg.json"]);
  });

  it("a link in repro/ to nothing is passed over, not a crash", () => {
    const dir = writeTree(join(root, "dangling"), {
      "repro/README.md": "# repro\n",
    });
    symlinkSync(join(dir, "gone"), join(dir, "repro", "s-2026-10-02"));
    expect(preregFiles(dir)).toEqual([]);
  });
});

describe("the rule, on the status file of a paper", () => {
  const rule = preregCoverage.rules["declare-sample"];
  /** What the rule reports for `file` in `dir`, each finding with its line and its whole text. */
  const lint = (dir: string, file = "PIPELINE-STATUS.md") => {
    const out: { line: number; messageId: string; message: string }[] = [];
    rule
      .create({
        filename: join(dir, file),
        cwd: dir,
        options: [],
        settings: {},
        sourceCode: {
          text: "# Status\n",
          getLocFromIndex: (i) => ({ line: i + 1, column: 0 }),
          getText: () => "",
        },
        report: (d) => {
          out.push({
            line: d.loc?.start.line ?? 0,
            messageId: d.messageId,
            message: rule.meta.messages.coverage.replace(
              "{{text}}",
              String(d.data?.["text"]),
            ),
          });
        },
      })
      .root?.();
    return out;
  };

  it("reports each problem on the status file's first line", () => {
    const dir = writeTree(join(root, "lint-bad"), {
      "repro/s-2026-10-12/prereg.json": "[]",
    });
    expect(lint(dir)).toEqual([
      {
        line: 1,
        messageId: "coverage",
        message: `\`repro/s-2026-10-12/prereg.json\` is not valid — it must be a JSON object holding \`population\`, \`strata\`, \`screens\`, \`coverage\` and \`author_check\`. ${WHY} Rule study/declare-sample: ${PAGE}`,
      },
    ]);
  });

  it("silent on a complete declaration, and on any file but the status file", () => {
    const dir = writeTree(join(root, "lint-good"), {
      "repro/s-2026-10-12/prereg.json": JSON.stringify(GOOD),
      "repro/t-2026-10-12/prereg.json": "{}",
    });
    expect(lint(dir, "NOTES.md")).toEqual([]);
    const good = writeTree(join(root, "lint-good-only"), {
      "repro/s-2026-10-12/prereg.json": JSON.stringify(GOOD),
    });
    expect(lint(good)).toEqual([]);
  });
});
