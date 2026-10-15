/**
 * `paperlint studies new|index` through the CLI's own `run`, on a real paper folder in a temp
 * directory: the wiring (`src/cli.ts`), the disk, today's date — and the promise both commands make,
 * that what they write is what `repro/study-registered` accepts. Both halves: a registry left stale
 * by hand is reported by the same lint, and `studies index` makes it clean again.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "./cli.ts";
import { lintReport } from "../test/lint-report.ts";
import { useTempDir, writeTree } from "../test/support.ts";

const root = useTempDir("studies-cli-");

/** `paperlint <args>` from the project root: the exit code and both streams. */
async function cli(cwd: string, args: readonly string[]) {
  const log: string[] = [];
  const err: string[] = [];
  const code = await run(args, {
    cwd,
    log: (s: string) => log.push(s),
    err: (s: string) => err.push(s),
  });
  return { code, log, err };
}

/** The `repro/study-registered` findings of `paperlint lint` over the project. */
async function registryFindings(cwd: string): Promise<readonly string[]> {
  const { log } = await cli(cwd, ["lint", "--json"]);
  return lintReport(log.join("\n")).flatMap((r) =>
    r.messages
      .filter((m) => m.ruleId === "repro/study-registered")
      .map((m) => m.message),
  );
}

/** A local `YYYY-MM-DD`, as the CLI reads the clock. */
const localDate = (d: Date): string =>
  `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("paperlint studies — through the CLI", () => {
  const dir = join(root, "project");
  writeTree(dir, {
    "package.json": "{}",
    "papers/example/PIPELINE-STATUS.md": "---\nstages: []\n---\n# status\n",
    "papers/example/paper.tex":
      "\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n",
    "papers/example/repro/README.md": "# Reproduction index\n",
    "papers/example/repro/studies.json": '{ "prefix": "P1", "studies": [] }\n',
  });
  const repro = join(dir, "papers/example/repro");

  it("new registers a study dated today, and the lint finds nothing to report", async () => {
    const before = localDate(new Date());
    const out = await cli(dir, [
      "studies",
      "new",
      "papers/example",
      "Baseline pass rate",
      "--kind",
      "spike",
    ]);
    const after = localDate(new Date());
    expect([out.code, out.err]).toEqual([0, []]);
    expect(out.log[0]).toBe(
      "created papers/example/repro/P1-S01-baseline-pass-rate/README.md",
    );
    const registry = JSON.parse(
      readFileSync(join(repro, "studies.json"), "utf8"),
    ) as { studies: { id: string; kind: string; date: string }[] };
    expect(registry.studies.map((s) => [s.id, s.kind])).toEqual([
      ["P1-S01", "spike"],
    ]);
    expect([before, after]).toContain(registry.studies[0]?.date);
    expect(await registryFindings(dir)).toEqual([]);
  });

  it("a row edited by hand leaves the index stale; studies index makes it clean again", async () => {
    const file = join(repro, "studies.json");
    writeTree(repro, {
      "studies.json": readFileSync(file, "utf8").replace(
        '"designing"',
        '"running"',
      ),
    });
    expect(await registryFindings(dir)).toEqual([
      expect.stringMatching(/^The index in `repro\/README\.md`/u),
    ]);
    const out = await cli(dir, ["studies", "index", "papers/example"]);
    expect([out.code, out.log, out.err]).toEqual([
      0,
      ["wrote the index of 1 study in papers/example/repro/README.md"],
      [],
    ]);
    expect(readFileSync(join(repro, "README.md"), "utf8")).toContain(
      "| P1-S01 | Baseline pass rate | running |",
    );
    expect(await registryFindings(dir)).toEqual([]);
  });

  it("a refusal exits non-zero and says why", async () => {
    const out = await cli(dir, ["studies", "new", "papers/example"]);
    expect([out.code, out.err]).toEqual([
      2,
      [
        'studies new needs the study\'s title: npx paperlint studies new <paper-dir> "<title>" [--kind <kind>]',
      ],
    ]);
  });
});
