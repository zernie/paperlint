#!/usr/bin/env node
/**
 * `npm run report-refresh-failure` — what `.github/workflows/deadlines.yml` runs when the refresh
 * failed: ONE open issue titled "deadline refresh failing", created, or commented on when it is
 * already open, with the failed run's link. The job failed on every scheduled run from 2026-10-06
 * to 2026-10-19 and nobody looked; a failure must reach a place people read.
 *
 * The GitHub side goes through the `gh` CLI the runner carries (`GH_TOKEN` in the step's env);
 * `ghIssues` takes the program as an argument, so the tests pass a fake one and nothing here
 * parses YAML or needs jq.
 */
import { execFileSync } from "node:child_process";
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";

/** The issue a failed refresh is reported in. */
export const TITLE = "deadline refresh failing";

/** The repository's issues, as the report needs them. */
export interface Issues {
  /** The number of the open issue with exactly this title, or null. */
  openTitled(title: string): number | null;
  create(title: string, body: string): void;
  comment(issue: number, body: string): void;
}

/** Runs `gh` with these arguments and returns what it prints. */
export type Gh = (args: readonly string[]) => string;

/** A row of `gh issue list --json number,title`. */
const isRow = (
  v: unknown,
): v is { readonly number: number; readonly title: string } =>
  typeof v === "object" &&
  v !== null &&
  "number" in v &&
  typeof v.number === "number" &&
  "title" in v &&
  typeof v.title === "string";

/** The issues of `repo`, through `gh`. */
export const ghIssues = (repo: string, gh: Gh): Issues => ({
  openTitled: (title) => {
    const rows: unknown = JSON.parse(
      gh([
        "issue",
        "list",
        "--repo",
        repo,
        "--state",
        "open",
        "--search",
        `in:title "${title}"`,
        "--json",
        "number,title",
      ]),
    );
    const hit = (Array.isArray(rows) ? rows : [])
      .filter(isRow)
      .find((r) => r.title === title);
    return hit?.number ?? null;
  },
  create: (title, body) => {
    gh(["issue", "create", "--repo", repo, "--title", title, "--body", body]);
  },
  comment: (issue, body) => {
    gh(["issue", "comment", String(issue), "--repo", repo, "--body", body]);
  },
});

/** The failure reported: a new issue, or a comment on the open one. What was done, in one line. */
export function reportFailure(issues: Issues, runUrl: string): string {
  const body = `The scheduled refresh of the venue presets' deadlines (.github/workflows/deadlines.yml) failed: ${runUrl} — until it is fixed, a deadline a portal moves is not picked up by the presets.`;
  const open = issues.openTitled(TITLE);
  if (open === null) {
    issues.create(TITLE, body);
    return `opened "${TITLE}"`;
  }
  issues.comment(open, body);
  return `commented on #${String(open)} "${TITLE}"`;
}

/** The repository and the failed run's link, from the step's environment; empty when unset. */
export const fromEnv = (
  env: Readonly<Record<string, string | undefined>>,
): { readonly repo: string; readonly runUrl: string } => ({
  repo: env["REPO"] ?? "",
  runUrl: env["RUN_URL"] ?? "",
});

if (isMain(import.meta.url)) {
  const { repo, runUrl } = fromEnv(process.env);
  const gh: Gh = (args) => execFileSync("gh", args, { encoding: "utf8" });
  console.log(reportFailure(ghIssues(repo, gh), runUrl));
}
