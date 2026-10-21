/**
 * The `submission-confirm` hook — no send to a venue's portal without the person's own yes to it.
 * PreToolUse on `Bash` (`plugin/hooks/hooks.json`): a command that sends a submission — `paperlint
 * submission new|update` with `--save` or `--submit` — runs only when the person has said yes, in an
 * `AskUserQuestion` asked since the last send, to a question naming the paper folder (its full path)
 * and the sha256 of the PDF it sends.
 * A command that names a portal's host runs only after a yes to a question naming that host and the
 * command's first 60 characters. Without the yes the command is refused (`"permissionDecision":
 * "deny"`), and the reason tells the agent exactly what to ask. Anything else: no output.
 *
 * ── WHY A QUESTION, NOT CLAUDE CODE'S PERMISSION PROMPT ──────────────────────────
 * It used to answer `ask` (paperlint#283). The Claude mobile app's permission card shows only the
 * command line, not the hook's reason, so the person approved a shell line without seeing which
 * paper or PDF it sends (paperlint#291). `AskUserQuestion` shows the whole question on every
 * client, and a yes to a question that names the folder and the sha256 is a yes to those bytes in that
 * folder: a stale build or a wrong PDF has another sha, and identical bytes in another folder (the
 * same manuscript for another venue) have another path, so their yes does not count.
 *
 * ── WHERE THE YES IS READ ─────────────────────────────────────────────────────────
 * The session's transcript (`transcript_path` in the hook's input, one JSON entry per line). A
 * question is the assistant's `tool_use` named `AskUserQuestion`; its answer is the user entry that
 * carries the matching `tool_result`, whose `toolUseResult.answers` maps each question's text to the
 * option chosen. An answer is a yes when its first word is "yes". Every earlier `Bash` call that
 * sends or names a portal — refused or not, but not this one (`tool_use_id`) — uses up the questions
 * before it, so one yes lets one command through. Within one command each send takes an answer of
 * its own: a yes that names two shas, or the same PDF sent twice, covers one send. When several
 * questions name the same thing, the latest decides.
 *
 * ── WHAT IT SEES, AND WHAT IT IS NOT ──────────────────────────────────────────────
 * A send is judged on the command as the shell reads it (`shellLeaves`: each simple command across
 * `&&`, `;`, `|`, words unquoted, the commands inside a `bash -c "…"` string too), never on the raw
 * text: `submission`, `new|update` and `--save|--submit` in one command's words; or a portal's host
 * in any word (a HotCRP-hosted site, or a host a venue preset declares), whatever program it runs —
 * such a command may send around paperlint's venue check, and has no PDF to name, so the question
 * names the host and the command instead. When the presets cannot be read, only HotCRP-hosted sites
 * and paperlint sends are recognised, and a refusal says so: one bad preset does not stop the shell.
 * NOT SEEN: an upload from a script file that names the host only inside the file, or words built
 * at run time (`$(…)`).
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
 * answer or a send are parsed, and the shell parser runs only on commands that say `submission` or
 * a portal's host:
 * a transcript of hundreds of megabytes is read in seconds.
 *
 * ── WHY IN-PROCESS, NOT A VIGILES PROGRAM ────────────────────────────────────────
 * It reads the build's facts with this package's own parser and hashes the PDF; a shipped vigiles
 * hook may import nothing but `vigiles/hook` (`src/folder-layout-hook.ts` says the rest). So
 * `paperlint hook submission-confirm` runs it in-process (`runHook`, src/cli.ts).
 */
import { isAbsolute, join, relative, resolve } from "node:path";
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

/** The words of the commands that may name a host: those with a dot, lowercased. */
const dottedWords = (leaves: readonly ShellLeaf[]): readonly string[] =>
  leaves
    .flatMap((l) => [l.head, ...l.args])
    .map((w) => w.toLowerCase())
    .filter((w) => w.includes("."));

/** The portal hosts known: HotCRP's hosted sites always, then those `hosts` names; lowercased. */
const knownHosts = (hosts: readonly string[]): readonly string[] =>
  [HOTCRP_HOSTED, ...hosts].map((h) => h.toLowerCase()).filter((h) => h !== "");

/**
 * The portal host a command names — a HotCRP-hosted site, or a host a venue preset declares
 * (`hosts`), whatever program it runs, as a plain case-insensitive substring of a word — or null.
 * Judged on the shell's words only, never on the raw text.
 */
function portalHost(
  leaves: readonly ShellLeaf[],
  hosts: readonly string[],
): string | null {
  const words = dottedWords(leaves);
  return (
    knownHosts(hosts).find((h) => words.some((w) => w.includes(h))) ?? null
  );
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

/** What a yes to one send must name: the paper folder as the hook resolves it, and the PDF's sha256 prefix. */
interface Named {
  readonly folder: string;
  readonly sha: string;
}

/** One send, described: what a yes must name (null when the PDF is not found), and the lines for the person. */
interface Described {
  readonly named: Named | null;
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
    named:
      sha === null ? null : { folder: paperDir, sha: sha.slice(0, SHA_SHOWN) },
    lines: [
      `paper folder: ${paperDir}`,
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
const NAMES_PORTAL = "Not run: this command names a venue's submission portal";

/** What to ask, once every send's PDF is known. */
const HOW_TO_ASK = [
  "Ask the person with AskUserQuestion first, then run this command again. In the question, give:",
  "- the paper folder (the full path, as written above), the PDF and its sha256 as written above (the folder path and the sha256 must both be in the question text),",
  "- what the lines above say about the build (the body pages, or that it is stale or missing),",
  "- the dry run's venue check, quoted word for word (its `venue rules at their default options` line and every error under it).",
  'Options: "Yes, send it" and "No". One yes lets one send through: ask one question per send, each naming its own folder and sha256.',
].join("\n");

/** How much of a command naming a portal the question must quote. */
const COMMAND_SHOWN = 60;

/** What to ask before a command that names a portal. */
const HOW_TO_ASK_PORTAL = [
  "It may send to the portal around paperlint's venue check. Ask the person with AskUserQuestion first, then run this command again: the question must contain the portal host and the command start above, exactly as written, and say what the command does.",
  'Options: "Yes, run it" and "No". One yes lets one command through. To send a paper, use `paperlint submission new|update --save` instead.',
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

/** What tells an earlier send in the transcript. */
interface EarlierSend {
  /** This call's own `tool_use_id`: no earlier send. */
  readonly current: string | null;
  /** Whether text may hold a send — cheap, so the shell parser runs only where it may matter. */
  readonly mayHold: (text: string) => boolean;
  /** Whether a command sends: a paperlint send, or a portal named. */
  readonly sends: (command: string) => boolean;
}

/** Nothing asked or answered: the start, and the state right after a send. */
const CLEARED: Since = { asked: new Set(), answers: [] };

/** A transcript line that is not JSON. */
const BROKEN = Symbol("broken");

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
    if (entry === BROKEN) return earlier.mayHold(line) ? CLEARED : since;
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
    earlier.mayHold(command) &&
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

/** Whether an answer is a yes: its first word, in any case. */
const isYes = (a: Answer): boolean => /^yes\b/iu.test(a.answer.trim());

/** Whether `text` contains every one of `keys`, in any case. */
const hasAll = (text: string, keys: readonly string[]): boolean =>
  keys.every((k) => text.toLowerCase().includes(k.toLowerCase()));

/** `text` as a literal inside a regular expression. */
const literal = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/**
 * Whether a question names the folder `folder` and not a longer path that starts with it
 * (`/w/paper` is not `/w/paper2` or `/w/paper.old`), nor one it ends: the whole path, case-sensitive.
 */
const namesFolder = (question: string, folder: string): boolean =>
  new RegExp(`(?<![\\w.-])${literal(folder)}(?![\\w.-])`, "u").test(question);

/** Whether the latest question containing every one of `keys` (any case) was answered yes. */
const saidYes = (
  answers: readonly Answer[],
  keys: readonly string[],
): boolean => {
  const latest = answers.findLast((a) => hasAll(a.question, keys));
  return latest !== undefined && isYes(latest);
};

/**
 * Whether every send has a yes of its own. A send takes the latest answer not yet taken whose
 * question names its folder and its sha256; that answer must be a yes and is then used up, so one
 * yes lets one send through — a question naming two shas, or the same PDF sent twice, covers one.
 * (A yes that two sends could share is given to the first; the second is refused and the person
 * is asked again: it fails closed.)
 */
function eachSendHasItsYes(
  answers: readonly Answer[],
  sends: readonly Named[],
): boolean {
  const used = sends.reduce((taken: ReadonlySet<number> | null, s) => {
    if (taken === null) return null;
    const at = answers.findLastIndex(
      (a, n) =>
        !taken.has(n) &&
        hasAll(a.question, [s.sha]) &&
        namesFolder(a.question, s.folder),
    );
    const found = answers[at];
    return found !== undefined && isYes(found) ? new Set([...taken, at]) : null;
  }, new Set<number>());
  return used !== null;
}

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
    x === null ? { named: null, lines: [UNRESOLVED] } : describe(x, cwd, deps),
  );
}

/** The refusal of a send whose PDF is not known or not there: there is no sha256 to ask about. */
const noPdf = (described: readonly Described[]): readonly string[] => [
  `${NOT_SENT}, and paperlint cannot find the PDF it uploads, so there is no sha256 to ask the person about.`,
  ...blocks(described),
  "Name the paper folder and the PDF plainly (no cd, no $…), build the PDF, run the dry run, and ask then.",
];

/** The portal hosts the venue presets declare, or — when they cannot be read — none, and why. */
interface Hosts {
  readonly hosts: readonly string[];
  readonly failed: string | null;
}

/** The presets' hosts; when they cannot be read, none, and why. */
function readHosts(cwd: string, deps: ConfirmDeps): Hosts {
  try {
    return { hosts: deps.portalHosts(cwd), failed: null };
  } catch (e) {
    return { hosts: [], failed: messageOf(e) };
  }
}

/** What one command is: whether it sends through paperlint, the portal host it names, the hosts known. */
interface Command {
  readonly text: string;
  readonly cwd: string;
  readonly paperlint: boolean;
  readonly host: string | null;
  readonly hosts: Hosts;
}

/** The line a refusal ends with when the presets could not be read; none when they could. */
const fallbackLines = (h: Hosts): readonly string[] =>
  h.failed === null
    ? []
    : [
        `The venue presets could not be read (${h.failed}), so only HotCRP-hosted sites and paperlint sends are recognised until they are fixed.`,
      ];

/**
 * A command that sends: let through (null) when the person said yes to it since the last send —
 * each paperlint send by its paper folder and its PDF's sha256, a yes of its own for each, a portal
 * named by its host and the command's start —
 * else the lines of the refusal, with what to ask.
 */
function decide(
  c: Command,
  payload: unknown,
  deps: ConfirmDeps,
): readonly string[] | null {
  const described = c.paperlint ? describedSends(c.text, c.cwd, deps) : [];
  const named = described.flatMap((d) => (d.named === null ? [] : [d.named]));
  if (named.length < described.length) return noPdf(described);
  const base = c.paperlint ? NOT_SENT : NAMES_PORTAL;
  const read = transcriptOf(payload, deps.files);
  if (typeof read !== "string")
    return [
      `${base}, and ${read.failed}, so paperlint cannot see the person's yes.`,
    ];
  const start = c.text.trim().slice(0, COMMAND_SHOWN);
  const answers = answersSinceLastSend(read, earlierSend(c, payload, deps));
  if (
    eachSendHasItsYes(answers, named) &&
    (c.host === null || saidYes(answers, [c.host, start]))
  )
    return null;
  return [
    `${base}, and the person has not said yes to it since the last send.`,
    ...blocks(described),
    ...(c.paperlint ? [HOW_TO_ASK] : []),
    ...portalLines(c.host, start),
  ];
}

/** What a refusal says about a portal the command names: the host, the start, what to ask; none for none. */
const portalLines = (host: string | null, start: string): readonly string[] =>
  host === null
    ? []
    : [`portal host: ${host}`, `command start: ${start}`, HOW_TO_ASK_PORTAL];

/** How an earlier send is told in the transcript: by the same matching as this command. */
function earlierSend(
  c: Command,
  payload: unknown,
  deps: ConfirmDeps,
): EarlierSend {
  const known = knownHosts(c.hosts.hosts);
  return {
    current: stringField(payload, "tool_use_id"),
    mayHold: (text) => {
      const plain = text.replace(/["'\\]/gu, "").toLowerCase();
      return (
        plain.includes("submission") || known.some((h) => plain.includes(h))
      );
    },
    sends: (command) => {
      const leaves = allLeaves(command, deps.shellLeaves);
      return leaves.some(isSend) || portalHost(leaves, known) !== null;
    },
  };
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

/** The payload, parsed; null when it is not JSON. */
function parsed(stdin: string): unknown {
  try {
    return JSON.parse(stdin);
  } catch {
    return null;
  }
}

/** One command, judged: null to let it run, or the refusal. */
function judge(
  text: string,
  cwd: string,
  payload: unknown,
  deps: ConfirmDeps,
): DenyOutput | null {
  const leaves = allLeaves(text, deps.shellLeaves);
  const paperlint = leaves.some(isSend);
  // The presets are read only for a command that may send: anything else pays nothing.
  if (!paperlint && dottedWords(leaves).length === 0) return null;
  const hosts = readHosts(cwd, deps);
  const host = portalHost(leaves, hosts.hosts);
  if (!paperlint && host === null) return null;
  const lines = decide({ text, cwd, paperlint, host, hosts }, payload, deps);
  return lines === null
    ? null
    : deny([...lines, ...fallbackLines(hosts)].join("\n"));
}

/**
 * The hook on one payload, as Claude Code sends it on stdin: a refusal, or null to let the command
 * run (it sends nothing, or every send in it has the person's yes). Never throws: a crash refuses.
 */
export function submissionConfirm(
  stdin: string,
  deps: ConfirmDeps,
): DenyOutput | null {
  const payload = parsed(stdin);
  if (payload === null) return UNREADABLE_INPUT;
  const raw = fieldOf(fieldOf(payload, "tool_input"), "command");
  const text = typeof raw === "string" ? raw : "";
  const given = fieldOf(payload, "cwd");
  const cwd =
    typeof given === "string" && isAbsolute(given) ? given : resolve(".");
  try {
    return judge(text, cwd, payload, deps);
  } catch (e) {
    return deny(
      `Not run: paperlint could not check whether this command sends a paper: ${messageOf(e)}.`,
    );
  }
}
