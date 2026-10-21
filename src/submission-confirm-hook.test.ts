/**
 * The `submission-confirm` hook: which commands send a submission (asked), which do not (silent), and
 * what the person is told — including when what it reads is missing, stale or broken.
 */
import { expect, test } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import type { Files } from "./ports/files.ts";
import { sendKind, submissionConfirm } from "./submission-confirm-hook.ts";
import { HEX, PDF, facts } from "../test/submission-fixtures.ts";

const payload = (command: string, cwd = "/w"): string =>
  JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd });

test.each([
  "npx paperlint submission update papers/p --save",
  "npx paperlint submission new papers/p --save",
  "npx paperlint submission update --submit --save papers/p",
  "npx paperlint submission update papers/p --save=true",
  "node node_modules/paperlint/bin/paperlint.mjs submission update papers/p --submit",
  "pnpm exec paperlint submission new --save papers/p",
  "HOTCRP_TOKEN_X=abc npx paperlint submission update papers/p --save",
  "npm run build && npx paperlint submission update papers/p --save",
  `npx paperlint "submission" 'update' papers/p "--save"`,
  "npx paperlint --save submission update papers/p",
])("asked: %s", (command) => {
  expect(sendKind(command)).toBe("paperlint");
});

test.each([
  'curl -X POST -H "Authorization: bearer $HOTCRP_TOKEN" https://x.hotcrp.com/api/paper',
  "wget --post-file=paper.pdf https://venue.hotcrp.com/api/upload",
  "http POST https://venue.hotcrp.com/api/paper",
  `node -e "fetch('https://venue.hotcrp.com/api/paper', { method: 'POST' })"`,
  `python3 -c "import requests; requests.post('https://venue.hotcrp.com/api/paper')"`,
])("asked, straight at HotCRP: %s", (command) => {
  expect(sendKind(command)).toBe("direct");
});

test.each([
  "npx paperlint submission update papers/p",
  "npx paperlint submission new papers/p",
  "npx paperlint submission show papers/p",
  "npx paperlint submission topics papers/p --save",
  "grep -rn submission docs/",
  "git log --grep submission",
  "cat docs/submission.md",
  "curl https://example.org/new --save-dir x",
  "echo https://venue.hotcrp.com",
  "",
])("silent: %s", (command) => {
  expect(sendKind(command)).toBe(null);
});

/** The made-up paper: its PDF, and its facts when given. */
const paper = (factsText: string | null): Files =>
  memoryFiles({
    "/w/papers/p/paper.pdf": PDF,
    ...(factsText === null
      ? {}
      : { "/w/papers/p/_build/paper.facts.json": factsText }),
  });

const reasonOf = (command: string, fs: Files, cwd = "/w"): string =>
  submissionConfirm(payload(command, cwd), fs)?.hookSpecificOutput
    .permissionDecisionReason ?? "(no ask)";

const SEND = "npx paperlint submission update papers/p --submit --save";
const HEAD =
  "This sends the paper to the venue's portal (paperlint submission with --save or --submit).";
const LAST = "Allow only if you have read the dry run's venue check.";

test("the ask: the paper folder, the PDF and its sha256, the body pages the build counted, and the line to read the venue check", () => {
  expect(submissionConfirm(payload(SEND), paper(facts()))).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: [
        HEAD,
        "paper folder: papers/p",
        `PDF: papers/p/paper.pdf, sha256 ${HEX.slice(0, 12)}`,
        "body pages: 4 (up to the references on page 5)",
        LAST,
      ].join("\n"),
    },
  });
});

test("a stale build is said loudly; no facts, broken facts and a missing PDF are said too — and every one still asks", () => {
  expect(reasonOf(SEND, paper(facts({ sha: "b".repeat(64) })))).toBe(
    [
      HEAD,
      "paper folder: papers/p",
      `PDF: papers/p/paper.pdf, sha256 ${HEX.slice(0, 12)}`,
      "!! THE LAST BUILD IS NOT OF THIS PDF — the check did not see it. Rebuild (`paperlint build`) and run the dry run again.",
      "body pages: 4 (up to the references on page 5)",
      LAST,
    ].join("\n"),
  );
  expect(reasonOf(SEND, paper(null)).split("\n")[3]).toBe(
    "no build facts (_build/paper.facts.json): the paper was not built, so the venue check did not see this PDF",
  );
  expect(reasonOf(SEND, paper("{")).split("\n")[3]).toMatch(
    /^could not read the build facts \(_build\/paper\.facts\.json\): /u,
  );
  expect(
    reasonOf(SEND, paper(JSON.stringify({ schema: 1 }))).split("\n")[3],
  ).toBe("could not read the build facts (_build/paper.facts.json): schema 1");
  expect(
    reasonOf(
      "npx paperlint submission update papers/p --pdf gone.pdf --save",
      paper(facts()),
    ).split("\n")[2],
  ).toBe("PDF: gone.pdf — NOT FOUND");
});

test("the body pages: up to the references when the build found them, else banal's count, else not counted", () => {
  const noHeading = (measured: boolean) =>
    JSON.stringify({
      ...JSON.parse(facts({ measured })),
      pages_text: ["Only body."],
    });
  expect(reasonOf(SEND, paper(noHeading(true))).split("\n")[3]).toBe(
    "body pages: 4 (as banal counts them)",
  );
  expect(reasonOf(SEND, paper(noHeading(false))).split("\n")[3]).toBe(
    "body pages: not counted (the build found no references heading and measured no geometry)",
  );
});

test("the paper and the PDF as the command names them: the current folder by default, --pdf=<file> too", () => {
  const fs = memoryFiles({
    "/w/papers/p/paper.pdf": PDF,
    "/w/papers/p/out.pdf": PDF,
  });
  expect(
    reasonOf("npx paperlint submission update --save", fs, "/w/papers/p")
      .split("\n")
      .slice(1, 3),
  ).toStrictEqual([
    "paper folder: p (the current folder)",
    `PDF: paper.pdf, sha256 ${HEX.slice(0, 12)}`,
  ]);
  expect(
    reasonOf(
      "npx paperlint submission update --abstract a.txt --pdf=papers/p/out.pdf papers/p --save",
      fs,
    )
      .split("\n")
      .slice(1, 3),
  ).toStrictEqual([
    "paper folder: papers/p",
    `PDF: papers/p/out.pdf, sha256 ${HEX.slice(0, 12)}`,
  ]);
});

test("straight at HotCRP: asked, naming that paperlint's check is skipped", () => {
  expect(
    reasonOf(
      "curl -F file=@paper.pdf https://venue.hotcrp.com/api/upload",
      paper(null),
    ),
  ).toBe(
    "This sends a request straight to a HotCRP site, outside paperlint and its venue check. Allow only if you have read the dry run's venue check.",
  );
});

test("a command that sends nothing: no output at all — neither allow nor deny", () => {
  expect(
    submissionConfirm(payload("npx paperlint submission update papers/p"), paper(null)),
  ).toBe(null);
  expect(submissionConfirm(JSON.stringify({ tool_input: {} }), paper(null))).toBe(
    null,
  );
});

test("a crash while describing the send still asks; a payload that is not JSON is matched as text", () => {
  const broken: Files = {
    isFile: () => false,
    readBytes: (p: AbsolutePath) => {
      throw new Error(`disk on fire at ${p}`);
    },
    writeAtomic: () => undefined,
  };
  expect(reasonOf(SEND, broken)).toBe(
    `${HEAD} paperlint could not say what will be sent: disk on fire at /w/papers/p/paper.pdf. ${LAST}`,
  );
  expect(
    submissionConfirm(`{"tool_input": {"command": "${SEND}"`, paper(null))
      ?.hookSpecificOutput.permissionDecision,
  ).toBe("ask");
  // A relative or missing cwd: the hook's own working directory.
  expect(
    submissionConfirm(payload(SEND, "relative"), paper(null))?.hookSpecificOutput
      .permissionDecision,
  ).toBe("ask");
});
