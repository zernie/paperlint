/**
 * The `submission-confirm` hook: which commands send a submission (asked), which do not (silent), and
 * what the person is told — including when what it reads is missing, stale or broken.
 */
import { expect, test } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import { sha256Hex } from "./domain/sha256.ts";
import type { Files } from "./ports/files.ts";
import { leafCommandsNormalized as shellLeaves } from "vigiles/hook";
import { submissionSend } from "./cli.ts";
import { presetsDir } from "./package-dirs.ts";
import {
  sendKind,
  submissionConfirm as confirmWith,
  type ConfirmDeps,
} from "./submission-confirm-hook.ts";
import { HEX, PDF, facts, withPresets } from "../test/submission-fixtures.ts";

/** What the command sends, read through the real shell parser. */
const kind = (command: string, hosts: () => readonly string[]) =>
  sendKind(command, hosts);

/** The portal hosts the project declares, in these tests: one venue on its own domain. */
const HOSTS = ["submit.example-venue.org"];

/** The hook over `fs` (the shipped presets readable beside it), the project declaring `HOSTS`. */
const submissionConfirm = (
  stdin: string,
  fs: Files,
  more: Partial<ConfirmDeps> = {},
) =>
  confirmWith(stdin, {
    files: withPresets(fs),
    venuesDir: presetsDir(),
    portalHosts: () => HOSTS,
    shellLeaves,
    readSend: submissionSend,
    ...more,
  });

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
  "npx paperlint new --save submission",
])("asked: %s", (command) => {
  expect(kind(command, () => [])).toBe("paperlint");
});

test.each([
  'curl -X POST -H "Authorization: bearer $HOTCRP_TOKEN" https://x.hotcrp.com/api/paper',
  "wget --post-file=paper.pdf https://venue.hotcrp.com/api/upload",
  "http POST https://venue.hotcrp.com/api/paper",
  `node -e "fetch('https://venue.hotcrp.com/api/paper', { method: 'POST' })"`,
  `python3 -c "import requests; requests.post('https://venue.hotcrp.com/api/paper')"`,
  "curl -F file=@paper.pdf https://SUBMIT.example-venue.org/api/upload",
  `node -e "require('https').request('https://venue.hotcrp.com/api/paper', { method: 'POST' })"`,
  "node upload.mjs submit.example-venue.org",
  "echo https://venue.hotcrp.com",
])("asked, straight at HotCRP: %s", (command) => {
  expect(kind(command, () => HOSTS)).toBe("direct");
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
  "grep -rn hotcrp src/",
  "cat src/adapters/hotcrp/index.ts",
  "",
  "curl https://example.org/api/paper",
])("silent: %s", (command) => {
  expect(kind(command, () => HOSTS)).toBe(null);
});

test("the hosts are read only for a command that makes a request: anything else pays nothing", () => {
  const never = () => {
    throw new Error("read the hosts for a command with no request in it");
  };
  expect(kind("ls -la", never)).toBe(null);
  // An empty host would be in every command: it matches nothing.
  expect(kind("curl https://example.org/x", () => [""])).toBe(null);
  expect(kind("npx paperlint submission new --save", never)).toBe("paperlint");
});

test("hosts that cannot be read: a request still asks, rather than passing unseen", () => {
  expect(
    submissionConfirm(payload("curl https://example.org/x"), memoryFiles({}), {
      portalHosts: () => {
        throw new Error("broken preset");
      },
    }),
  ).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason:
        "paperlint could not read the venue portals this project declares (broken preset), so it cannot tell whether this request sends to one. Allow only if you have read the dry run's venue check.",
    },
  });
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

test("the paper's own `pdf` setting is the PDF hashed when the command names no --pdf, as the command sends it", () => {
  const fs = memoryFiles({
    "/w/papers/p/paperlint.json": JSON.stringify({ pdf: "out/main.pdf" }),
    "/w/papers/p/out/main.pdf": PDF,
  });
  expect(reasonOf(SEND, fs).split("\n")[2]).toBe(
    `PDF: papers/p/out/main.pdf, sha256 ${HEX.slice(0, 12)}`,
  );
});

test("a paperlint.json that does not parse: the PDF is the default paper.pdf, and the ask still goes out", () => {
  const fs = memoryFiles({
    "/w/papers/p/paperlint.json": "{ nope",
    "/w/papers/p/paper.pdf": PDF,
  });
  expect(reasonOf(SEND, fs).split("\n")[2]).toBe(
    `PDF: papers/p/paper.pdf, sha256 ${HEX.slice(0, 12)}`,
  );
});

test("a --pdf at the end with no value, which the command refuses, and `submission` as the last word: unresolved", () => {
  expect(
    reasonOf(
      "npx paperlint submission update papers/p --save --pdf",
      paper(facts()),
    ),
  ).toBe([HEAD, UNRESOLVED, LAST].join("\n"));
  expect(
    reasonOf("npx paperlint new --save submission", paper(null), "/w/papers/p"),
  ).toBe([HEAD, UNRESOLVED, LAST].join("\n"));
});

/** What the reason says for a send the parse cannot resolve. */
const UNRESOLVED =
  "could not resolve which PDF this send uploads — check the dry run";

test("the send's words are read by the command's own parser: a value flag before the paper does not shift it; words it would refuse are unresolved", () => {
  expect(
    reasonOf(
      "npx paperlint submission update --max-warnings 0 --config paperlint.json papers/p --save",
      paper(facts()),
    ).split("\n")[1],
  ).toBe("paper folder: papers/p");
  expect(
    reasonOf(
      "npx paperlint submission update papers/p --nope --save",
      paper(null),
    ),
  ).toBe([HEAD, UNRESOLVED, LAST].join("\n"));
});

test("anything that may change the directory before the send makes its PDF unresolved, not guessed", () => {
  for (const command of [
    "cd papers/p && npx paperlint submission update --save",
    "pushd papers/p; npx paperlint submission update --save",
    "env -C papers/p npx paperlint submission update --save",
  ])
    expect(reasonOf(command, paper(facts())), command).toBe(
      [HEAD, UNRESOLVED, LAST].join("\n"),
    );
});

test("a quoted --pdf=<file> with a space is one word: the PDF is that file", () => {
  const fs = memoryFiles({ "/w/final copies/paper.pdf": PDF });
  expect(
    reasonOf(
      `npx paperlint submission update papers/p --pdf="final copies/paper.pdf" --save`,
      fs,
    ).split("\n")[2],
  ).toBe(`PDF: final copies/paper.pdf, sha256 ${HEX.slice(0, 12)}`);
});

/** A second paper's PDF, other bytes. */
const B = new TextEncoder().encode("%PDF b");

test("every send in a chain is described, one block each", () => {
  const fs = memoryFiles({
    "/w/papers/a/paper.pdf": PDF,
    "/w/papers/b/paper.pdf": B,
  });
  const reason = reasonOf(
    "npx paperlint submission update papers/a --save && npx paperlint submission new papers/b --save",
    fs,
  ).split("\n");
  expect(
    reason.filter((l) => /^(?:send|paper folder|PDF)/u.test(l)),
  ).toStrictEqual([
    "send 1 of 2:",
    "paper folder: papers/a",
    `PDF: papers/a/paper.pdf, sha256 ${HEX.slice(0, 12)}`,
    "send 2 of 2:",
    "paper folder: papers/b",
    `PDF: papers/b/paper.pdf, sha256 ${sha256Hex(B).slice(0, 12)}`,
  ]);
});

test("a send whose words the shell would expand, or one inside a string, is asked about as unresolved", () => {
  expect(
    reasonOf('npx paperlint submission update "$P" --save', paper(null)),
  ).toBe([HEAD, UNRESOLVED, LAST].join("\n"));
  expect(
    reasonOf(
      `bash -c "npx paperlint submission update papers/p --save"`,
      paper(null),
    ),
  ).toBe([HEAD, UNRESOLVED, LAST].join("\n"));
});

test("a client run by its path or quoted is a request: the program is read by its basename", () => {
  expect(
    kind("/usr/bin/curl -X POST https://venue.hotcrp.com/api/paper", () => []),
  ).toBe("direct");
  expect(
    kind(
      `"/usr/bin/curl" -F f=@p.pdf https://submit.example-venue.org/api`,
      () => HOSTS,
    ),
  ).toBe("direct");
});

test("straight at HotCRP: asked, naming that paperlint's check is skipped", () => {
  expect(
    reasonOf(
      "curl -F file=@paper.pdf https://venue.hotcrp.com/api/upload",
      paper(null),
    ),
  ).toBe(
    "This command names a venue's submission portal, so it may send to it outside paperlint and its venue check. Allow only if you have read the dry run's venue check.",
  );
});

test("a command that sends nothing: no output at all — neither allow nor deny", () => {
  expect(
    submissionConfirm(
      payload("npx paperlint submission update papers/p"),
      paper(null),
    ),
  ).toBe(null);
  expect(
    submissionConfirm(JSON.stringify({ tool_input: {} }), paper(null)),
  ).toBe(null);
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
    `${HEAD} paperlint could not say what will be sent: disk on fire at /w/papers/p/paperlint.json. ${LAST}`,
  );
  expect(
    submissionConfirm(`{"tool_input": {"command": "${SEND}"`, paper(null))
      ?.hookSpecificOutput.permissionDecision,
  ).toBe("ask");
  // A relative or missing cwd: the hook's own working directory.
  expect(
    submissionConfirm(payload(SEND, "relative"), paper(null))
      ?.hookSpecificOutput.permissionDecision,
  ).toBe("ask");
});
