/**
 * `tex/ref-list-same-number` against what TeX itself printed. The rule reads the source alone and
 * claims that two keys of one reference list print the same number; the oracle is the `.aux` of a
 * real `pdflatex` run, whose `\newlabel{key}{{<number>}…}` is exactly what `\ref{key}` prints.
 *
 * ONE fake paper (`test/fixtures/ref-list-same-number/paper.tex`), built once: the bug (a run-in's
 * label cited next to its enclosing section), a clean list, a `\cref` with several keys, a starred
 * heading, a label deeper than `secnumdepth`, and lists the rule must leave alone. The findings of
 * `paperlint lint` must be exactly the lines of the lists in which the `.aux` shows two different
 * keys printing one number — no more, no less. A fake, because it can hold every case; real papers
 * rarely contain the bug (`docs/rules/tex/ref-list-same-number.md`, "Measured").
 *
 *   npm run test:e2e:tex
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { PAPERS_DIR_FIELD } from "../../../lib/paper-config.ts";
import { latexReader } from "../../../dist/adapters/latex/index.js";
import { referencesChecker } from "../../../dist/adapters/references/index.js";
import { missing } from "../need.ts";
import { buildIn, engineIn } from "./build-in.ts";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const CLI = join(ROOT, "bin", "paperlint.mjs");
const RULE = "tex/ref-list-same-number";

/** What each key prints, from an `.aux`: its `\newlabel{key}{{number}{page}…}` lines. */
export function printed(aux: string): ReadonlyMap<string, string> {
  return new Map(
    aux
      .split("\n")
      .filter((l) => l.startsWith("\\newlabel{") && !l.includes("@"))
      .map((l) => {
        const [key = "", rest = ""] = l.slice("\\newlabel{".length).split("}{{");
        return [key, rest.split("}{")[0] ?? ""] as const;
      }),
  );
}

/**
 * The lines on which a reference list prints a number an earlier reference of the list, with
 * another key, already printed — what the rule claims, decided by the `.aux`.
 */
export function auxHits(
  src: string,
  aux: string,
): readonly number[] {
  const numbers = printed(aux);
  const lineOf = (at: number): number => src.slice(0, at).split("\n").length;
  return latexReader.refLists(src).flatMap((list) =>
    list.flatMap((r, i) => {
      const mine = numbers.get(r.key);
      const before = list.slice(0, i);
      return mine !== undefined &&
        !before.some((b) => b.key === r.key) &&
        before.some((b) => numbers.get(b.key) === mine)
        ? [lineOf(r.span.start)]
        : [];
    }),
  );
}

const LintReport = z.array(
  z.looseObject({
    filePath: z.string(),
    messages: z.array(
      z.looseObject({
        ruleId: z.string().nullable(),
        line: z.number().optional(),
      }),
    ),
  }),
);

const work = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-reflist-")));
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});
cpSync(
  join(ROOT, "test", "fixtures", "ref-list-same-number"),
  join(work, "papers", "fake"),
  { recursive: true },
);
writeFileSync(
  join(work, "package.json"),
  JSON.stringify({ name: "consumer", private: true }),
);
writeFileSync(
  join(work, "paperlint.json"),
  JSON.stringify({ [PAPERS_DIR_FIELD]: "papers" }),
);

const engine = engineIn(work);
const skip = missing(
  "a TeX Live with every declared package",
  engine !== "" && !engine.startsWith("engine: none"),
  "install one with `node bin/paperlint.mjs toolchain`",
);

describe.skipIf(skip)("tex/ref-list-same-number against the .aux", () => {
  const paper = join(work, "papers", "fake");
  let built = { status: -1, out: "" };
  beforeAll(async () => {
    built = await buildIn(work, ["papers/fake"], {
      asked: [],
      checkReferences: referencesChecker({ today: () => "2026-11-09" }),
    });
  });

  it("the findings are exactly the lines of the lists the .aux shows printing one number twice", () => {
    expect(built.status, built.out).toBe(0);
    const src = readFileSync(join(paper, "paper.tex"), "utf8");
    const expected = auxHits(src, readFileSync(join(paper, "paper.aux"), "utf8"));
    const r = spawnSync(
      process.execPath,
      [CLI, "lint", "papers/fake", "--json"],
      { cwd: work, encoding: "utf8" },
    );
    const got = LintReport.parse(JSON.parse(r.stdout))
      .flatMap((f) => f.messages)
      .filter((m) => m.ruleId === RULE)
      .map((m) => m.line ?? 0);
    // Guards: the bug, the \cref list, the starred heading and the deeper-than-secnumdepth label
    // are four lists; the clean list and the lone run-in are none. Without this the equality
    // below would hold for a paper with no bug in it.
    expect(expected).toHaveLength(4);
    expect([...got].sort((a, b) => a - b)).toEqual(
      [...expected].sort((a, b) => a - b),
    );
  });
});
