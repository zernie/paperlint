/**
 * The `submission-confirm` hook: which commands send a submission, which do not (silent); a send runs
 * only after the person's AskUserQuestion yes naming its PDF's sha256, once; what the agent is told to
 * ask — including when what it reads is missing, stale or broken.
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
  submissionConfirm as confirmWith,
  type ConfirmDeps,
} from "./submission-confirm-hook.ts";
import { HEX, PDF, facts, withPresets } from "../test/submission-fixtures.ts";

/** What the command sends, read through the real shell parser. */
const kind = (command: string, hosts: () => readonly string[]) => {
  const reason =
    submissionConfirm(payload(command), memoryFiles({}), {
      portalHosts: hosts,
    })?.hookSpecificOutput.permissionDecisionReason ?? null;
  if (reason === null) return null;
  if (reason.startsWith(NOT_SENT)) return "paperlint";
  return reason.startsWith("Not run: this command names") ? "direct" : reason;
};

/** The portal hosts the project declares, in these tests: one venue on its own domain. */
const HOSTS = ["submit.example-venue.org", "conference.org"];

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

/** The session's transcript, in every test that does not give its own. */
const T = "/t/session.jsonl";

const payload = (
  command: string,
  cwd = "/w",
  more: object = { transcript_path: T, tool_use_id: "now" },
): string =>
  JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd, ...more });

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
  `npx paperlint submis"sion" up'date' papers/p --sa"ve"`,
])("a send: %s", (command) => {
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
  "curl -X POST CONFERENCE.org/api/paper",
  "echo https://venue.hotcrp.com",
])("refused, straight at HotCRP: %s", (command) => {
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
  // `paperlint new` with a paper named "submission": not a send.
  "npx paperlint new --save submission",
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

test("presets that cannot be read: only HotCRP-hosted sites and paperlint sends are recognised, and a refusal says why", () => {
  const broken = {
    portalHosts: () => {
      throw new Error("broken preset");
    },
  };
  const reason = (command: string) =>
    submissionConfirm(payload(command), paper(facts()), broken)
      ?.hookSpecificOutput.permissionDecisionReason ?? null;
  const FALLBACK =
    "The venue presets could not be read (broken preset), so only HotCRP-hosted sites and paperlint sends are recognised until they are fixed.";
  // A command that names no HotCRP site runs: one bad preset does not stop the shell.
  expect(reason("curl https://submit.example-venue.org/x")).toBe(null);
  expect(reason("cat notes.txt")).toBe(null);
  expect(
    reason("curl https://venue.hotcrp.com/api/paper")?.split("\n").at(-1),
  ).toBe(FALLBACK);
  expect(reason(SEND)?.split("\n").at(-1)).toBe(FALLBACK);
});
/** The made-up paper: its PDF, its facts when given, and an empty transcript. */
const paper = (factsText: string | null): Files =>
  memoryFiles({
    [T]: "",
    "/w/papers/p/paper.pdf": PDF,
    ...(factsText === null
      ? {}
      : { "/w/papers/p/_build/paper.facts.json": factsText }),
  });

const reasonOf = (command: string, fs: Files, cwd = "/w"): string =>
  submissionConfirm(payload(command, cwd), fs)?.hookSpecificOutput
    .permissionDecisionReason ?? "(let through)";

const SEND = "npx paperlint submission update papers/p --submit --save";
const NOT_SENT = "Not run: this sends the paper to the venue's portal";
/** The first line when no yes was found. */
const HEAD = `${NOT_SENT}, and the person has not said yes to it since the last send.`;
/** What the agent is told to ask: the last lines of that refusal. */
const LAST = [
  "Ask the person with AskUserQuestion first, then run this command again. In the question, give:",
  "- the paper folder, the PDF and its sha256 as written above (the sha256 must be in the question text),",
  "- what the lines above say about the build (the body pages, or that it is stale or missing),",
  "- the dry run's venue check, quoted word for word (its `venue rules at their default options` line and every error under it).",
  'Options: "Yes, send it" and "No". One yes lets one send through.',
].join("\n");

test("no yes: refused, telling the agent what to ask — the paper folder, the PDF and its sha256, the body pages, the venue check, yes or no", () => {
  expect(submissionConfirm(payload(SEND), paper(facts()))).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
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

test("a stale build is said loudly; no facts and broken facts are said too", () => {
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
});

/** The refusal of a send whose PDF is not known or not there: nothing to ask about yet. */
const NO_PDF = (...lines: readonly string[]): string =>
  [
    `${NOT_SENT}, and paperlint cannot find the PDF it uploads, so there is no sha256 to ask the person about.`,
    ...lines,
    "Name the paper folder and the PDF plainly (no cd, no $…), build the PDF, run the dry run, and ask then.",
  ].join("\n");

test("a PDF that is not there: refused, whatever the transcript says — there is no sha256 to ask about", () => {
  expect(
    reasonOf(
      "npx paperlint submission update papers/p --pdf gone.pdf --save",
      paper(facts()),
    ),
  ).toBe(
    NO_PDF(
      "paper folder: papers/p",
      "PDF: gone.pdf — NOT FOUND",
      "!! THE LAST BUILD IS NOT OF THIS PDF — the check did not see it. Rebuild (`paperlint build`) and run the dry run again.",
      "body pages: 4 (up to the references on page 5)",
    ),
  );
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
    [T]: "",
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
    [T]: "",
    "/w/papers/p/paperlint.json": JSON.stringify({ pdf: "out/main.pdf" }),
    "/w/papers/p/out/main.pdf": PDF,
  });
  expect(reasonOf(SEND, fs).split("\n")[2]).toBe(
    `PDF: papers/p/out/main.pdf, sha256 ${HEX.slice(0, 12)}`,
  );
});

test("a paperlint.json that does not parse: the PDF is the default paper.pdf, and the send is still described", () => {
  const fs = memoryFiles({
    [T]: "",
    "/w/papers/p/paperlint.json": "{ nope",
    "/w/papers/p/paper.pdf": PDF,
  });
  expect(reasonOf(SEND, fs).split("\n")[2]).toBe(
    `PDF: papers/p/paper.pdf, sha256 ${HEX.slice(0, 12)}`,
  );
});

test("a --pdf at the end with no value, which the command refuses: unresolved", () => {
  expect(
    reasonOf(
      "npx paperlint submission update papers/p --save --pdf",
      paper(facts()),
    ),
  ).toBe(NO_PDF(UNRESOLVED));
});

test("a command that only mentions `submission` beside a send is no second send", () => {
  expect(
    reasonOf(
      "npx paperlint submission update papers/p --save; echo submission",
      paper(facts()),
    ).split("\n")[1],
  ).toBe("paper folder: papers/p");
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
  ).toBe(NO_PDF(UNRESOLVED));
});

test("anything that may change the directory before the send makes its PDF unresolved, not guessed", () => {
  for (const command of [
    "cd papers/p && npx paperlint submission update --save",
    "pushd papers/p; npx paperlint submission update --save",
    "env -C papers/p npx paperlint submission update --save",
  ])
    expect(reasonOf(command, paper(facts())), command).toBe(NO_PDF(UNRESOLVED));
});

test("a quoted --pdf=<file> with a space is one word: the PDF is that file", () => {
  const fs = memoryFiles({ [T]: "", "/w/final copies/paper.pdf": PDF });
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
    [T]: "",
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

test("a send whose words the shell would expand, or one inside a string, is refused as unresolved", () => {
  expect(
    reasonOf('npx paperlint submission update "$P" --save', paper(null)),
  ).toBe(NO_PDF(UNRESOLVED));
  expect(
    reasonOf(
      `bash -c "npx paperlint submission update papers/p --save"`,
      paper(null),
    ),
  ).toBe(NO_PDF(UNRESOLVED));
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

/** What the agent is told to ask before a command that names a portal. */
const ASK_PORTAL = [
  "It may send to the portal around paperlint's venue check. Ask the person with AskUserQuestion first, then run this command again: the question must contain the portal host and the command start above, exactly as written, and say what the command does.",
  'Options: "Yes, run it" and "No". One yes lets one command through. To send a paper, use `paperlint submission new|update --save` instead.',
].join("\n");

test("straight at a portal, with no yes: refused, naming the host and the command's first 60 characters to ask about", () => {
  expect(
    reasonOf(
      "  curl -F file=@paper.pdf https://Venue.HotCRP.com/api/upload?p=1&token=secret",
      paper(null),
    ),
  ).toBe(
    [
      "Not run: this command names a venue's submission portal, and the person has not said yes to it since the last send.",
      "portal host: hotcrp.com",
      "command start: curl -F file=@paper.pdf https://Venue.HotCRP.com/api/upload?",
      ASK_PORTAL,
    ].join("\n"),
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

test("a crash while describing the send is refused; a payload that is not JSON is refused", () => {
  const broken: Files = {
    isFile: () => false,
    readBytes: (p: AbsolutePath) => {
      throw new Error(`disk on fire at ${p}`);
    },
    writeAtomic: () => undefined,
  };
  expect(reasonOf(SEND, broken)).toBe(
    "Not run: paperlint could not check whether this command sends a paper: disk on fire at /w/papers/p/paperlint.json.",
  );
  expect(
    submissionConfirm(`{"tool_input": {"command": "${SEND}"`, paper(null))
      ?.hookSpecificOutput,
  ).toStrictEqual({
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason:
      "Not run: paperlint could not read this command, so it cannot tell whether it sends a paper to a venue's portal.",
  });
  // A relative or missing cwd: the hook's own working directory.
  expect(
    submissionConfirm(payload(SEND, "relative"), paper(null))
      ?.hookSpecificOutput.permissionDecision,
  ).toBe("deny");
});

// ── the person's yes, read from the transcript ───────────────────────────────────────────
// Hand-built entries in the shape Claude Code writes: the assistant's `tool_use`, and the user
// entry with the matching `tool_result` and `toolUseResult.answers` (question text → option).

const SHA = HEX.slice(0, 12);

/** The assistant asks one AskUserQuestion; with an answer, the person's reply follows. */
const question = (id: string, text: string, answer?: unknown): string[] => {
  const questions = [
    {
      question: text,
      header: "Send",
      multiSelect: false,
      options: [
        { label: "Yes, send it", description: "Send this PDF." },
        { label: "No", description: "Do not send." },
      ],
    },
  ];
  return [
    JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Asking first." },
          {
            type: "tool_use",
            id,
            name: "AskUserQuestion",
            input: { questions },
          },
        ],
      },
    }),
    ...(answer === undefined
      ? []
      : [
          JSON.stringify({
            type: "user",
            message: {
              role: "user",
              content: [
                { type: "tool_result", tool_use_id: id, content: "answered" },
              ],
            },
            toolUseResult: { questions, answers: { [text]: answer } },
          }),
        ]),
  ];
};

/** The assistant runs a Bash command. */
const bash = (id: string, command: unknown): string[] => [
  JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name: "Bash", input: { command } }],
    },
  }),
];

const asks = (sha: string) =>
  `Send papers/p/paper.pdf (sha256 ${sha}) to the portal? Venue check: venue rules at their default options: no errors`;

/** The hook's answer to SEND, over the paper with this transcript. */
const withTranscript = (lines: readonly string[], command = SEND) =>
  submissionConfirm(
    payload(command),
    memoryFiles({
      [T]: `${lines.join("\n")}\n`,
      "/w/papers/p/paper.pdf": PDF,
      "/w/papers/p/_build/paper.facts.json": facts(),
    }),
  );

test("a yes to a question naming the PDF's sha256: the send runs — the hook says nothing, so Claude Code's own permissions apply", () => {
  expect(withTranscript(question("q1", asks(SHA), "Yes, send it"))).toBe(null);
  // The answer is a yes by its first word, in any case, typed or chosen.
  expect(withTranscript(question("q1", asks(SHA), " yes"))).toBe(null);
  // The call being decided may already be in the transcript: it is no earlier send.
  expect(
    withTranscript([
      ...question("q1", asks(SHA), "Yes, send it"),
      ...bash("now", SEND),
    ]),
  ).toBe(null);
});

test("one yes, one send: the same send again is refused until the person is asked again", () => {
  const once = [
    ...question("q1", asks(SHA), "Yes, send it"),
    ...bash("b1", SEND),
  ];
  expect(
    withTranscript(once)?.hookSpecificOutput.permissionDecisionReason,
  ).toMatch(new RegExp(`^${HEAD}`, "u"));
  expect(
    withTranscript([...once, ...question("q2", asks(SHA), "Yes, send it")]),
  ).toBe(null);
  // A send the hook refused uses the yes up too: a question asked BEFORE it does not count.
  expect(
    withTranscript([
      ...question("q1", asks(SHA), "Yes"),
      ...bash("b1", `${SEND} && echo`),
    ])?.hookSpecificOutput.permissionDecision,
  ).toBe("deny");
  // Other commands in between use up nothing.
  expect(
    withTranscript([
      ...question("q1", asks(SHA), "Yes"),
      ...bash("b1", "npx paperlint submission show papers/p"),
      ...bash("b2", 42),
    ]),
  ).toBe(null);
});

test("no yes: a 'No', no answer yet, an answer that is not a yes, a yes withdrawn later — refused", () => {
  const refused = (lines: readonly string[]) =>
    withTranscript(lines)?.hookSpecificOutput.permissionDecisionReason.split(
      "\n",
    )[0];
  expect(refused(question("q1", asks(SHA), "No"))).toBe(HEAD);
  // Asked in the same turn as the send: not answered yet.
  expect(refused(question("q1", asks(SHA)))).toBe(HEAD);
  expect(
    refused(question("q1", asks(SHA), "Yesterday's build, not this one")),
  ).toBe(HEAD);
  expect(refused(question("q1", asks(SHA), ["Yes"]))).toBe(HEAD);
  // A reply with no answers in it, and a tool other than a question or Bash, count for nothing.
  const reply = question("q1", asks(SHA), "Yes");
  expect(
    refused([
      reply[0] ?? "",
      (reply[1] ?? "")
        .replace('"toolUseResult"', '"otherResult"')
        .replace('"type":"user"', '"type":"user","toolUseResult":"Yes"'),
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", id: "r1", name: "Read", input: {} }],
        },
      }),
    ]),
  ).toBe(HEAD);
  // The latest question naming the sha decides.
  expect(
    refused([
      ...question("q1", asks(SHA), "Yes"),
      ...question("q2", asks(SHA), "No"),
    ]),
  ).toBe(HEAD);
  // An answer that arrives after a send, to a question asked before it, is no fresh yes.
  const late = question("q1", asks(SHA), "Yes");
  expect(refused([late[0] ?? "", ...bash("b1", SEND), late[1] ?? ""])).toBe(
    HEAD,
  );
});

test("a stale sha: a yes to another PDF's bytes does not let this one through", () => {
  expect(
    withTranscript(
      question("q1", asks("b".repeat(12)), "Yes, send it"),
    )?.hookSpecificOutput.permissionDecisionReason.split("\n")[0],
  ).toBe(HEAD);
});

test("two sends in one command: each needs a yes naming its own sha256", () => {
  const command =
    "npx paperlint submission update papers/a --save && npx paperlint submission new papers/b --save";
  const shaB = sha256Hex(B).slice(0, 12);
  const decide = (lines: readonly string[]) =>
    submissionConfirm(
      payload(command),
      memoryFiles({
        [T]: lines.join("\n"),
        "/w/papers/a/paper.pdf": PDF,
        "/w/papers/b/paper.pdf": B,
      }),
    );
  expect(
    decide(question("q1", asks(SHA), "Yes"))?.hookSpecificOutput
      .permissionDecision,
  ).toBe("deny");
  expect(
    decide([
      ...question("q1", asks(SHA), "Yes"),
      ...question("q2", asks(shaB), "Yes"),
    ]),
  ).toBe(null);
  expect(decide(question("q1", `${asks(SHA)} and ${shaB}`, "Yes"))).toBe(null);
});

test("a transcript that cannot be read, or no transcript: refused", () => {
  const reason = (fs: Files, more?: object) =>
    submissionConfirm(payload(SEND, "/w", more), fs)?.hookSpecificOutput
      .permissionDecisionReason;
  const files = (transcript?: string) =>
    memoryFiles({
      "/w/papers/p/paper.pdf": PDF,
      ...(transcript === undefined ? {} : { [T]: transcript }),
    });
  expect(reason(files())).toBe(
    `${NOT_SENT}, and the transcript ${T} could not be read, so paperlint cannot see the person's yes.`,
  );
  expect(reason(files(""), {})).toBe(
    `${NOT_SENT}, and the hook was given no transcript_path, so paperlint cannot see the person's yes.`,
  );
  expect(reason(files(""), { transcript_path: "session.jsonl" })).toBe(
    `${NOT_SENT}, and the hook was given no transcript_path, so paperlint cannot see the person's yes.`,
  );
});

test("a broken transcript line: one that may hold a send uses the yes before it up; any other is skipped", () => {
  const yes = question("q1", asks(SHA), "Yes");
  const decide = (lines: readonly string[]) =>
    withTranscript(lines)?.hookSpecificOutput.permissionDecision ?? "runs";
  // An entry cut short and run into the next, as real transcripts have them.
  const cut = (entry: string) => `${entry.slice(0, 80)}${entry}`;
  const send = bash("b1", SEND)[0] ?? "";
  const other = bash("b1", "ls -la")[0] ?? "";
  expect(decide([...yes, cut(send)])).toBe("deny");
  expect(decide([...yes, cut(other)])).toBe("runs");
  // A yes asked after it counts again; a line with no content list is skipped.
  expect(
    decide([
      cut(send),
      JSON.stringify({ type: "user", message: { content: "toolUseResult" } }),
      ...yes,
    ]),
  ).toBe("runs");
});

test("a command naming a portal runs after a yes to a question with its host and its start, once", () => {
  const command = "curl -X POST https://venue.hotcrp.com/api/paper/1/comment";
  const start = command.slice(0, 60);
  const decide = (lines: readonly string[]) =>
    withTranscript(lines, command)?.hookSpecificOutput.permissionDecision ??
    "runs";
  const yes = question("q1", `Run ${start} against HOTCRP.COM?`, "Yes, run it");
  expect(decide(yes)).toBe("runs");
  // Used up by the run, or by any earlier command that names a portal.
  expect(decide([...yes, ...bash("b1", command)])).toBe("deny");
  expect(decide([...yes, ...bash("b1", "grep -rn hotcrp.com src/")])).toBe(
    "deny",
  );
  // The host alone, or the start alone, is not enough; nor is a No.
  expect(decide(question("q1", "Run it against hotcrp.com?", "Yes"))).toBe(
    "deny",
  );
  expect(
    decide(question("q1", `Run ${start.slice(0, 30)} on hotcrp.com?`, "Yes")),
  ).toBe("deny");
  expect(decide(question("q1", `Run ${start} on hotcrp.com?`, "No"))).toBe(
    "deny",
  );
  // A broken transcript line that names a portal counts as a run of one.
  expect(
    decide([...yes, `{"type":"tool_use"${bash("b1", command)[0] ?? ""}`]),
  ).toBe("deny");
});

test("a paperlint send that also names a portal needs both yeses: the PDF's sha256, and the host with the start", () => {
  const command = `${SEND} && curl https://venue.hotcrp.com/api/paper/1`;
  const start = command.slice(0, 60);
  const decide = (lines: readonly string[]) =>
    withTranscript(lines, command)?.hookSpecificOutput
      .permissionDecisionReason ?? "runs";
  const sha = question("q1", asks(SHA), "Yes");
  const host = question("q2", `${start} on hotcrp.com`, "Yes");
  expect(decide([...sha, ...host])).toBe("runs");
  const reason = decide(sha).split("\n");
  expect(reason[0]).toBe(HEAD);
  expect(reason.slice(-4)).toStrictEqual([
    "portal host: hotcrp.com",
    `command start: ${start}`,
    ...ASK_PORTAL.split("\n"),
  ]);
  expect(decide(host).split("\n")[0]).toBe(HEAD);
});
