/**
 * `--flag=value` and unknown flags — the command line the CI action actually writes.
 *
 * action.yml runs `npx paperlint lint $PATHS --max-warnings="$MAXWARN" --json`. The parser knew
 * only `--max-warnings <n>`, so `--max-warnings=-1` fell through to the list of PATHS: ESLint was
 * handed a file named `--max-warnings=-1`, found nothing for it, and the run reported "nothing was
 * linted under papers, --max-warnings=-1". Any flag the parser did not know became a path the same
 * way, silently.
 */
import { describe, expect, it } from "vitest";
import { parseArgs, run } from "./cli.ts";

describe("parseArgs — `--flag=value` is the same as `--flag value`", () => {
  it("🔴 the action's own command line: `--max-warnings=-1` is a threshold, not a path", () => {
    const a = parseArgs(["lint", "papers", "--max-warnings=-1", "--json"]);
    // Guards: the defect — the flag landed in `paths`.
    expect(a.paths).toEqual(["papers"]);
    expect(a.maxWarnings).toBe(-1);
  });

  it.each([
    ["--config=o.json", "config", "o.json"],
    ["--venue=agenticdev", "venue", "agenticdev"],
    ["--kind=short", "kind", "short"],
    ["--paper=p", "paper", "p"],
  ] as const)("%s", (flag, key, value) => {
    const a = parseArgs(["new", "x", flag]);
    expect(a[key]).toBe(value);
    expect(a.paths).toEqual(["x"]);
  });

  it("an empty value after `=` is a missing value, refused like `--config` with none", () => {
    expect(parseArgs(["lint", "--config="]).missingValue).toBe("--config");
  });
});

describe("parseArgs — the switches, each turning one field on", () => {
  it.each([
    ["--json", "json"],
    ["--fix", "fix"],
    ["--all", "all"],
    ["--dry-run", "dryRun"],
    ["--check", "check"],
    ["--yes", "yes"],
    ["-y", "yes"],
    ["--no-hooks", "noHooks"],
    ["--allow-venue-name", "allowVenueName"],
  ] as const)("%s → %s", (flag, key) => {
    const off = parseArgs(["new", "x"]);
    const on = parseArgs(["new", "x", flag]);
    expect(off[key]).toBe(false);
    expect(on).toEqual({ ...off, [key]: true });
  });
});

describe("an unknown flag is refused, not read as a path", () => {
  it("exits 2 and names the flag", async () => {
    const err: string[] = [];
    const code = await run(["lint", "--frobnicate"], {
      log: () => {},
      err: (s: string) => err.push(s),
    });
    expect(code).toBe(2);
    expect(err.join("\n")).toMatch(/unknown flag `--frobnicate`/);
  });
});
