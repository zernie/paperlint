/** A failed refresh, reported once: a new issue, or a comment on the open one — through `gh`. */
import { execFile } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import {
  fromEnv,
  ghIssues,
  reportFailure,
  TITLE,
} from "./report-refresh-failure.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RUN = "https://github.com/zernie/paperlint/actions/runs/1";

/** A fake `gh`: records every call, and answers `issue list` with `rows`. */
const fakeGh = (rows: unknown) => {
  const calls: (readonly string[])[] = [];
  const gh = (args: readonly string[]): string => {
    calls.push(args);
    return args[1] === "list" ? JSON.stringify(rows) : "";
  };
  return { calls, gh };
};

describe("reportFailure", () => {
  test("🔴 no open issue with the title: one is created, linking the run", () => {
    const f = fakeGh([{ number: 9, title: "something else" }]);
    const done = reportFailure(ghIssues("zernie/paperlint", f.gh), RUN);
    expect(done).toBe(`opened "${TITLE}"`);
    expect(f.calls.map((c) => c.slice(0, 2))).toEqual([
      ["issue", "list"],
      ["issue", "create"],
    ]);
    expect(f.calls[1]).toEqual([
      "issue",
      "create",
      "--repo",
      "zernie/paperlint",
      "--title",
      "deadline refresh failing",
      "--body",
      expect.stringContaining(RUN),
    ]);
  });

  test("an open issue with the title: it gets a comment, no second issue", () => {
    const f = fakeGh([{ number: 41, title: TITLE }]);
    expect(reportFailure(ghIssues("zernie/paperlint", f.gh), RUN)).toBe(
      `commented on #41 "${TITLE}"`,
    );
    expect(f.calls[1]?.slice(0, 5)).toEqual([
      "issue",
      "comment",
      "41",
      "--repo",
      "zernie/paperlint",
    ]);
  });

  test("an answer that is not a list of issues is read as none open", () => {
    const f = fakeGh({ message: "not a list" });
    expect(reportFailure(ghIssues("r/r", f.gh), RUN)).toBe(`opened "${TITLE}"`);
  });
});

test(
  "`npm run report-refresh-failure`, as the workflow runs it: the real script, a `gh` on PATH that records",
  { timeout: 60_000 },
  async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "gh-fake-")));
    const log = join(dir, "calls.log");
    writeFileSync(
      join(dir, "gh"),
      [
        "#!/bin/sh",
        `printf '%s\\n' "$*" >> "${log}"`,
        'if [ "$2" = "list" ]; then echo "[]"; fi',
      ].join("\n"),
      { mode: 0o755 },
    );
    const r = await promisify(execFile)(
      "npm",
      ["run", "-s", "report-refresh-failure"],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          PATH: `${dir}:${process.env["PATH"] ?? ""}`,
          REPO: "zernie/paperlint",
          RUN_URL: RUN,
        },
      },
    );
    expect(r.stdout.trim()).toBe(`opened "${TITLE}"`);
    const calls = readFileSync(log, "utf8").trim().split("\n");
    expect(calls[1]).toMatch(
      /^issue create --repo zernie\/paperlint --title deadline refresh failing --body .*actions\/runs\/1/,
    );
  },
);

test("fromEnv: the repository and the run's link, empty when the step sets none", () => {
  expect(fromEnv({ REPO: "a/b", RUN_URL: RUN })).toEqual({
    repo: "a/b",
    runUrl: RUN,
  });
  expect(fromEnv({})).toEqual({ repo: "", runUrl: "" });
});
