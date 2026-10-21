/**
 * The `submission-confirm` hook — no send to a venue's portal without the person's own yes to it.
 * PreToolUse on `Bash` (`plugin/hooks/hooks.json`): a command that sends a submission — `paperlint
 * submission new|update` with `--save` or `--submit` — runs only when the person has said yes, in an
 * `AskUserQuestion` asked since the last send, to a question naming the sha256 of the PDF it sends.
 * Without that yes the command is refused (`"permissionDecision": "deny"`), and the reason tells the
 * agent exactly what to ask. Anything else: no output.
 *
 * ── WHY A QUESTION, NOT CLAUDE CODE'S PERMISSION PROMPT ──────────────────────────
 * It used to answer `ask` (paperlint#283). The Claude mobile app's permission card shows only the
 * command line, not the hook's reason, so the person approved a shell line without seeing which
 * paper or PDF it sends (paperlint#291). `AskUserQuestion` shows the whole question on every
 * client, and a yes to a question that names the sha256 is a yes to those bytes: a stale build or a
 * wrong PDF has another sha, so its yes does not count.
 *
 * ── WHERE THE YES IS READ ─────────────────────────────────────────────────────────
 * The session's transcript (`transcript_path` in the hook's input, one JSON entry per line). A
 * question is the assistant's `tool_use` named `AskUserQuestion`; its answer is the user entry that
 * carries the matching `tool_result`, whose `toolUseResult.answers` maps each question's text to the
 * option chosen. An answer is a yes when its first word is "yes". Every earlier `Bash` call that is a
 * send — refused or not, but not this one (`tool_use_id`) — uses up the questions before it, so one
 * yes lets one send through. When several questions name the same sha, the latest decides.
 *
 * ── WHAT IT SEES, AND WHAT IT IS NOT ──────────────────────────────────────────────
 * A send is judged on the command as the shell reads it (`shellLeaves`: each simple command across
 * `&&`, `;`, `|`, words unquoted, the commands inside a `bash -c "…"` string too), never on the raw
 * text: `submission`, `new|update` and `--save|--submit` in one command's words. A command that
 * names a portal's host in any word (a HotCRP-hosted site, or a host a venue preset declares),
 * whatever program it runs, is refused outright: it would send around paperlint's venue check, and
 * there is no PDF to name. NOT SEEN: an upload from a script file that names the host only inside
 * the file, or words built at run time (`$(…)`).
 *
 * The agent writes the question, so a deliberately misleading question still passes. The hook
 * catches an agent that sends without asking, or asks about other bytes; it is not a security
 * boundary against an agent that deliberately disguises a send.
 *
 * ── IT FAILS CLOSED ───────────────────────────────────────────────────────────────
 * A send whose PDF cannot be told for certain, a PDF that is not there, no transcript, a payload
 * that is not JSON, a crash: refused, with what went wrong. A transcript line that is not JSON is
 * not a reason to refuse every send for the rest of the session — real transcripts have them (an
 * entry cut short and run into the next, measured in a live one) — so it counts as a send when its
 * text may hold one, and a yes before it no longer counts. Only lines that may hold a question, an
 * answer or a send are parsed, and the shell parser runs only on commands that say `submission`:
 * a transcript of hundreds of megabytes is read in seconds.
 *
 * ── WHY IN-PROCESS, NOT A VIGILES PROGRAM ────────────────────────────────────────
 * It reads the build's facts with this package's own parser and hashes the PDF; a shipped vigiles
 * hook may import nothing but `vigiles/hook` (`src/folder-layout-hook.ts` says the rest). So
 * `paperlint hook submission-confirm` runs it in-process (`runHook`, src/cli.ts).
 */
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { callerPath } from "./caller-path.ts";
import { bodyEnd } from "./domain/body-pages.ts";
import { fieldOf, isRecord } from "./domain/record.ts";
import { sha256Hex } from "./domain/sha256.ts";
import { messageOf } from "./domain/text.ts";
import { factsPath, parseFactsText, type ReadFacts } from "./facts-file.ts";
import type { Files } from "./ports/files.ts";
import { paperPreset, type PresetDeps } from "./presets.ts";
import { paperPdf } from "./submission.ts";

/** One simple command of a command line, as a shell parser reads it (vigiles' `leafCommandsNormalized`). */
interface ShellLeaf {
  /** The program's basename: `/usr/bin/curl` → `curl`. */
  readonly head: string;
  /** The words after the program, quotes removed. */
  readonly args: readonly string[];
  /** Whether any of the flags `names` is on it (`--save`, `--save=x`). */
  hasFlag(...names: readonly string[]): boolean;
  /** The directory a wrapper (`env -C`, `sudo -D`) runs it in; null for none. */
  readonly chdir: string | null;
}

/** What the hook reads: files, the shipped presets, and the portal hosts the project's venues declare. */
export type ConfirmDeps = PresetDeps & {
  /** The hosts of every venue portal paperlint knows of from `cwd`: shipped and the project's own. */
  readonly portalHosts: (cwd: string) => readonly string[];
  /** Every simple command of a command line, across `&&`, `;`, `|`; none when it does not parse. */
  readonly shellLeaves: (command: string) => readonly ShellLeaf[];
  /**
   * The words after `submission`, read by the command's own argument parser: the paper and the
   * `--pdf` the send names (null for the defaults), or null when they do not parse cleanly.
   */
  readonly readSend: (words: readonly string[]) => Send | null;
};

/** What Claude Code reads from a PreToolUse hook's stdout to refuse the command; the agent sees the reason. */
export interface DenyOutput {
  readonly hookSpecificOutput: {
    readonly hookEventName: "PreToolUse";
    readonly permissionDecision: "deny";
    readonly permissionDecisionReason: string;
  };
}

const deny = (reason: string): DenyOutput => ({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: reason,
  },
});

/** The domain of HotCRP's hosted sites; a self-hosted portal is known by the host its preset declares. */
const HOTCRP_HOSTED = "hotcrp.com";

/**
 * Every simple command the shell would run: the command line's own, and those inside a string
 * argument (`bash -c "…"`), parsed the same way.
 */
function allLeaves(
  command: string,
  parse: ConfirmDeps["shellLeaves"],
): readonly ShellLeaf[] {
  const top = parse(command);
  return [
    ...top,
    ...top.flatMap((l) =>
      l.args.filter((a) => /\s/u.test(a)).flatMap((a) => allLeaves(a, parse)),
    ),
  ];
}

/** A `paperlint submission new|update` with `--save` or `--submit`, in the words of one command. */
function isSend(l: ShellLeaf): boolean {
  const at = l.args.indexOf("submission");
  return (
    at >= 0 &&
    l.args.slice(at + 1).some((w) => w === "new" || w === "update") &&
    l.hasFlag("save", "submit")
  );
}

/** One `paperlint submission new|update` send: the paper folder and `--pdf` it names; null for the default. */
export interface Send {
  readonly paper: string | null;
  readonly pdf: string | null;
}

/** Programs that change the directory the rest of the command line runs in. */
const MOVES: ReadonlySet<string> = new Set(["cd", "pushd", "popd"]);

/**
 * Every send among the simple commands of a command line: its paper and PDF as the command's own
 * argument parser reads them, or null where they cannot be told for certain — the words do not
 * parse, or something before it may have changed the directory.
 */
function sendsIn(
  leaves: readonly ShellLeaf[],
  readSend: ConfirmDeps["readSend"],
): readonly (Send | null)[] {
  return leaves.flatMap((l, n) => {
    const at = l.args.findIndex(
      (x, i) =>
        x === "submission" && /^(?:new|update)$/u.test(l.args[i + 1] ?? ""),
    );
    if (at < 0 || !l.hasFlag("save", "submit")) return [];
    const moved = leaves
      .slice(0, n + 1)
      .some((x) => MOVES.has(x.head) || x.chdir !== null);
    return [moved ? null : readSend(l.args.slice(at + 1))];
  });
}

/**
 * What the commands send: a submission through paperlint, anything that names a venue's portal — a
 * HotCRP-hosted site, or a host a venue preset declares (`hosts`, read only when a word has a dot),
 * whatever program it runs, as a plain case-insensitive substring of a word — or nothing. Judged on
 * the shell's words only, never on the raw text.
 */
export function sendKind(
  leaves: readonly ShellLeaf[],
  hosts: () => readonly string[],
): "paperlint" | "direct" | null {
  if (leaves.some(isSend)) return "paperlint";
  const words = leaves
    .flatMap((l) => [l.head, ...l.args])
    .map((w) => w.toLowerCase())
    .filter((w) => w.includes("."));
  if (words.length === 0) return null;
  const known = [HOTCRP_HOSTED, ...hosts()]
    .map((h) => h.toLowerCase())
    .filter((h) => h !== "");
  return words.some((w) => known.some((h) => w.includes(h))) ? "direct" : null;
}

/** The body pages the build counted: up to the references or appendix, or banal's count. */
function bodyPages(f: ReadFacts): string {
  const end = bodyEnd(f.text.pages, {
    bib: f.text.bibAnchorPage,
    appendix: f.text.appendixAnchorPage,
  });
  if (end.kind === "found")
    return `body pages: ${String(end.bodyPages)} (up to the ${end.by} on page ${String(end.page)})`;
  return f.geometry === null
    ? "body pages: not counted (the build found no references heading and measured no geometry)"
    : `body pages: ${String(f.geometry.body_pages)} (as banal counts them)`;
}

/** What the build's facts say about the PDF to be sent, in lines. */
function factsLines(
  paperDir: string,
  sha: string | null,
  files: Files,
): readonly string[] {
  const bytes = files.readBytes(callerPath(factsPath(paperDir)));
  if (bytes === null)
    return [
      "no build facts (_build/paper.facts.json): the paper was not built, so the venue check did not see this PDF",
    ];
  const f = parseFactsText(new TextDecoder().decode(bytes));
  if (!f.ok)
    return [
      `could not read the build facts (_build/paper.facts.json): ${f.error.kind === "schema" ? `schema ${f.error.got}` : f.error.why}`,
    ];
  const stale =
    sha !== f.value.sha
      ? [
          "!! THE LAST BUILD IS NOT OF THIS PDF — the check did not see it. Rebuild (`paperlint build`) and run the dry run again.",
        ]
      : [];
  return [...stale, bodyPages(f.value)];
}

/** One send, described: the sha256 of the PDF it uploads (null when not found), and the lines for the person. */
interface Described {
  readonly sha: string | null;
  readonly lines: readonly string[];
}

/** One send, described: the paper, the PDF as the command resolves it, what the build saw. */
function describe(send: Send, cwd: string, deps: PresetDeps): Described {
  const paperDir = resolve(cwd, send.paper ?? ".");
  const p = paperPreset(paperDir, deps);
  const own = paperPdf(
    paperDir,
    p.kind === "settings-problem" ? null : p.settings,
  );
  const pdf = send.pdf === null ? own : resolve(cwd, send.pdf);
  const bytes = deps.files.readBytes(callerPath(pdf));
  const sha = bytes === null ? null : sha256Hex(bytes);
  return {
    sha: sha === null ? null : sha.slice(0, SHA_SHOWN),
    lines: [
      `paper folder: ${send.paper ?? `${basename(paperDir)} (the current folder)`}`,
      `PDF: ${send.pdf ?? join(send.paper ?? ".", relative(paperDir, own))}${sha === null ? " — NOT FOUND" : `, sha256 ${sha.slice(0, SHA_SHOWN)}`}`,
      ...factsLines(paperDir, sha, deps.files),
    ],
  };
}

/** How much of the sha256 the reason shows, and the question must contain. */
const SHA_SHOWN = 12;

/** A send whose PDF cannot be told for certain. */
const UNRESOLVED =
  "could not resolve which PDF this send uploads — check the dry run";

const NOT_SENT = "Not run: this sends the paper to the venue's portal";

/** What to ask, once every send's PDF is known. */
const HOW_TO_ASK = [
  "Ask the person with AskUserQuestion first, then run this command again. In the question, give:",
  "- the paper folder, the PDF and its sha256 as written above (the sha256 must be in the question text),",
  "- what the lines above say about the build (the body pages, or that it is stale or missing),",
  "- the dry run's venue check, quoted word for word (its `venue rules at their default options` line and every error under it).",
  'Options: "Yes, send it" and "No". One yes lets one send through.',
].join("\n");

/** Each send's block: alone, or numbered when the command has several. */
function blocks(described: readonly Described[]): readonly string[] {
  return described.length === 1
    ? described.flatMap((d) => d.lines)
    : described.flatMap((d, n) => [
        `send ${String(n + 1)} of ${String(described.length)}:`,
        ...d.lines,
      ]);
}

/** One question the person answered: its text, and the option they chose. */
interface Answer {
  readonly question: string;
  readonly answer: string;
}

/** The questions asked and answered since the last send, while reading the transcript. */
interface Since {
  readonly asked: ReadonlySet<string>;
  readonly answers: readonly Answer[];
}

/** A transcript line that may hold a question, an answer or a send; no other line is parsed. */
const MAY_MATTER = /"tool_use"|"toolUseResult"/u;

/** What tells an earlier send in the transcript: not this call's own `tool_use_id`, and a send by its words. */
interface EarlierSend {
  readonly current: string | null;
  readonly sends: (command: string) => boolean;
}

/** Nothing asked or answered: the start, and the state right after a send. */
const CLEARED: Since = { asked: new Set(), answers: [] };

/** A transcript line that is not JSON. */
const BROKEN = Symbol("broken");

/**
 * Whether text may hold a send: the word `submission` once quotes and backslashes are gone — the
 * shell's (\`submis"sion"\`) or JSON's. Cheap, so the shell parser runs only where it may matter.
 */
const mayHoldSend = (text: string): boolean =>
  text.replace(/["'\\]/gu, "").includes("submission");

/**
 * The person's answers to `AskUserQuestion` since the last send in the transcript, oldest first.
 * A line that may matter and is not JSON (real transcripts have them: an entry cut short, run into
 * the next) counts as a send when it may hold one, so a yes before it is used up — never wrongly
 * kept; otherwise it is skipped, and a yes lost in it only means asking again.
 */
export function answersSinceLastSend(
  transcript: string,
  earlier: EarlierSend,
): readonly Answer[] {
  return transcript.split("\n").reduce((since: Since, line): Since => {
    if (!MAY_MATTER.test(line)) return since;
    const entry = parsedLine(line);
    if (entry === BROKEN) return mayHoldSend(line) ? CLEARED : since;
    const content = fieldOf(fieldOf(entry, "message"), "content");
    return (Array.isArray(content) ? content : []).reduce(
      (s: Since, block: unknown): Since =>
        fieldOf(block, "type") === "tool_result"
          ? toolResult(s, block, entry)
          : toolUse(s, block, earlier),
      since,
    );
  }, CLEARED).answers;
}

/** One transcript line, parsed; BROKEN when it is not JSON. */
function parsedLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return BROKEN;
  }
}

/** A block the assistant wrote: a question is noted; an earlier send clears what was asked before it. */
function toolUse(s: Since, block: unknown, earlier: EarlierSend): Since {
  const id = fieldOf(block, "id");
  if (fieldOf(block, "type") !== "tool_use" || typeof id !== "string") return s;
  const name = fieldOf(block, "name");
  if (name === "AskUserQuestion")
    return { ...s, asked: new Set([...s.asked, id]) };
  const command = fieldOf(fieldOf(block, "input"), "command");
  const send =
    name === "Bash" &&
    id !== earlier.current &&
    typeof command === "string" &&
    mayHoldSend(command) &&
    earlier.sends(command);
  return send ? CLEARED : s;
}

/** The person's reply to a question asked since the last send: its answers, kept in order. */
function toolResult(s: Since, block: unknown, entry: unknown): Since {
  const id = fieldOf(block, "tool_use_id");
  if (typeof id !== "string" || !s.asked.has(id)) return s;
  const answers = fieldOf(fieldOf(entry, "toolUseResult"), "answers");
  const given = Object.entries(isRecord(answers) ? answers : {}).flatMap(
    ([question, answer]): readonly Answer[] =>
      typeof answer === "string" ? [{ question, answer }] : [],
  );
  return { ...s, answers: [...s.answers, ...given] };
}

/** Whether the latest question naming `sha` was answered yes. */
const saidYes = (answers: readonly Answer[], sha: string): boolean =>
  /^yes\b/iu.test(
    answers.findLast((a) => a.question.includes(sha))?.answer.trim() ?? "",
  );

/** Every send in the command, described; an unresolved one has no sha. */
function describedSends(
  command: string,
  cwd: string,
  deps: ConfirmDeps,
): readonly Described[] {
  const sends = /[`$]/u.test(command)
    ? []
    : sendsIn(deps.shellLeaves(command), deps.readSend);
  return (sends.length === 0 ? [null] : sends).map((x): Described =>
    x === null ? { sha: null, lines: [UNRESOLVED] } : describe(x, cwd, deps),
  );
}

/** The refusal of a send whose PDF is not known or not there: there is no sha256 to ask about. */
const noPdf = (described: readonly Described[]): string =>
  [
    `${NOT_SENT}, and paperlint cannot find the PDF it uploads, so there is no sha256 to ask the person about.`,
    ...blocks(described),
    "Name the paper folder and the PDF plainly (no cd, no $…), build the PDF, run the dry run, and ask then.",
  ].join("\n");

/**
 * A `paperlint submission` send: let through (null) when every send in the command has its yes in
 * the transcript, else refused with what to ask. Words the shell would expand (`$…`, backticks) are
 * not guessed at: such a send is unresolved, and refused.
 */
function paperlintSend(
  command: string,
  cwd: string,
  payload: unknown,
  deps: ConfirmDeps,
): DenyOutput | null {
  const described = describedSends(command, cwd, deps);
  const shas = described.flatMap((d) => (d.sha === null ? [] : [d.sha]));
  if (shas.length < described.length) return deny(noPdf(described));
  const read = transcriptOf(payload, deps.files);
  if (typeof read !== "string")
    return deny(
      `${NOT_SENT}, and ${read.failed}, so paperlint cannot see the person's yes.`,
    );
  const answers = answersSinceLastSend(read, {
    current: stringField(payload, "tool_use_id"),
    sends: (c) => allLeaves(c, deps.shellLeaves).some(isSend),
  });
  if (shas.every((sha) => saidYes(answers, sha))) return null;
  return deny(
    [
      `${NOT_SENT}, and the person has not said yes to it since the last send.`,
      ...blocks(described),
      HOW_TO_ASK,
    ].join("\n"),
  );
}

/** A string field of the payload; null for none. */
function stringField(payload: unknown, key: string): string | null {
  const v = fieldOf(payload, key);
  return typeof v === "string" ? v : null;
}

/** The session's transcript as text, or why it could not be read. */
function transcriptOf(
  payload: unknown,
  files: Files,
): string | { readonly failed: string } {
  const path = stringField(payload, "transcript_path");
  if (path === null || !isAbsolute(path))
    return { failed: "the hook was given no transcript_path" };
  const bytes = files.readBytes(callerPath(path));
  return bytes === null
    ? { failed: `the transcript ${path} could not be read` }
    : new TextDecoder().decode(bytes);
}

/** The refusal when the hook's input cannot be read at all: it cannot tell, so it does not let it run. */
export const UNREADABLE_INPUT: DenyOutput = deny(
  "Not run: paperlint could not read this command, so it cannot tell whether it sends a paper to a venue's portal.",
);

const DIRECT =
  "Not run: this command names a venue's submission portal, so it may send to it around paperlint's venue check and without the person's yes to a named PDF. Send with `paperlint submission new|update --save`, after asking the person; or the person runs this command themselves, in their own terminal.";

/** The payload, parsed; null when it is not JSON. */
function parsed(stdin: string): unknown {
  try {
    return JSON.parse(stdin);
  } catch {
    return null;
  }
}

/**
 * The hook on one payload, as Claude Code sends it on stdin: a refusal, or null to let the command
 * run (it sends nothing, or every send in it has the person's yes). Never throws: what it cannot
 * read, it refuses.
 */
export function submissionConfirm(
  stdin: string,
  deps: ConfirmDeps,
): DenyOutput | null {
  const payload = parsed(stdin);
  if (payload === null) return UNREADABLE_INPUT;
  const raw = fieldOf(fieldOf(payload, "tool_input"), "command");
  const command = typeof raw === "string" ? raw : "";
  const given = fieldOf(payload, "cwd");
  const cwd =
    typeof given === "string" && isAbsolute(given) ? given : resolve(".");
  const kind = kindOf(command, cwd, deps);
  if (kind === null) return null;
  if (kind !== "paperlint" && kind !== "direct") return deny(kind.failed);
  if (kind === "direct") return deny(DIRECT);
  try {
    return paperlintSend(command, cwd, payload, deps);
  } catch (e) {
    return deny(
      `${NOT_SENT}, and paperlint could not check it: ${messageOf(e)}.`,
    );
  }
}

/** What the command sends, or — when reading it failed — the reason to refuse it. */
function kindOf(
  command: string,
  cwd: string,
  deps: ConfirmDeps,
): ReturnType<typeof sendKind> | { readonly failed: string } {
  try {
    return sendKind(allLeaves(command, deps.shellLeaves), () =>
      deps.portalHosts(cwd),
    );
  } catch (e) {
    return {
      failed: `Not run: paperlint could not tell what this command sends (${messageOf(e)}).`,
    };
  }
}
