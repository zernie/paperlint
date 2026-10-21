/**
 * The `submission-confirm` hook — no send to a venue's portal without the person's own yes.
 * PreToolUse on `Bash` (`plugin/hooks/hooks.json`): a command that sends a submission — `paperlint
 * submission new|update` with `--save` or `--submit`, or a request straight at a HotCRP site — gets
 * `"permissionDecision": "ask"`, and Claude Code puts the question to the person, with the reason
 * below, in its permission prompt. Anything else: no output.
 *
 * ── WHY "ask", AND WHY NOTHING TURNS IT OFF ──────────────────────────────────────
 * The hooks reference (code.claude.com/docs/en/hooks): "`ask` prompts the user to confirm"; "A
 * hook's `ask` also forces a permission prompt in auto mode"; the reason is "shown to the user in
 * the permission prompt"; and decisions combine deny > defer > ask > allow, so an `allow` rule in
 * the settings does not outvote it. An agent cannot answer the prompt, and no flag or variable of
 * this package skips it — that is the point: the send is the person's decision, taken on the dry
 * run's venue check (paperlint#264). The hook never denies (the person may send over a limit) and
 * never allows (that would skip the person).
 *
 * ── WHAT IT SEES, AND WHAT IT IS NOT ──────────────────────────────────────────────
 * A send is judged on the command as the shell reads it (`shellLeaves`: each simple command across
 * `&&`, `;`, `|`, words unquoted, the commands inside a `bash -c "…"` string too), never on the raw
 * text: `submission`, `new|update` and `--save|--submit` in one command's words, or a portal's host
 * in any word (a HotCRP-hosted site, or a host a venue preset declares), whatever program it runs.
 * A false ask costs one click; a missed send cannot be taken back. NOT SEEN: an upload from a script
 * file that names the host only inside the file, or words built at run time (`$(…)`).
 *
 * The hook catches an agent that runs a send without asking; it is not a security boundary against
 * an agent that deliberately disguises a send.
 *
 * The reason is built from the same parse and the CLI's own argument parser (`readSend`), one block
 * per send; a send whose PDF cannot be told for certain is still asked about, and says so.
 *
 * ── IT FAILS TOWARD THE QUESTION ─────────────────────────────────────────────────
 * The reason is built from files (the PDF, the build's facts); whatever goes wrong there, the ask
 * still goes out, saying what could not be read. A payload that is not JSON is asked about.
 *
 * ── WHY IN-PROCESS, NOT A VIGILES PROGRAM ────────────────────────────────────────
 * It reads the build's facts with this package's own parser and hashes the PDF; a shipped vigiles
 * hook may import nothing but `vigiles/hook` (`src/folder-layout-hook.ts` says the rest). So
 * `paperlint hook submission-confirm` runs it in-process (`runHook`, src/cli.ts).
 */
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { callerPath } from "./caller-path.ts";
import { bodyEnd } from "./domain/body-pages.ts";
import { fieldOf } from "./domain/record.ts";
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

/** What Claude Code reads from a PreToolUse hook's stdout to ask the person first, with the reason. */
export interface AskOutput {
  readonly hookSpecificOutput: {
    readonly hookEventName: "PreToolUse";
    readonly permissionDecision: "ask";
    readonly permissionDecisionReason: string;
  };
}

const ask = (reason: string): AskOutput => ({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: reason,
  },
});

const LAST = "Allow only if you have read the dry run's venue check.";

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

/** One send, described: the paper, the PDF as the command resolves it, what the build saw. */
function sendLines(
  send: Send,
  cwd: string,
  deps: PresetDeps,
): readonly string[] {
  const paperDir = resolve(cwd, send.paper ?? ".");
  const p = paperPreset(paperDir, deps);
  const own = paperPdf(
    paperDir,
    p.kind === "settings-problem" ? null : p.settings,
  );
  const pdf = send.pdf === null ? own : resolve(cwd, send.pdf);
  const bytes = deps.files.readBytes(callerPath(pdf));
  const sha = bytes === null ? null : sha256Hex(bytes);
  return [
    `paper folder: ${send.paper ?? `${basename(paperDir)} (the current folder)`}`,
    `PDF: ${send.pdf ?? join(send.paper ?? ".", relative(paperDir, own))}${sha === null ? " — NOT FOUND" : `, sha256 ${sha.slice(0, 12)}`}`,
    ...factsLines(paperDir, sha, deps.files),
  ];
}

/** A send whose PDF cannot be told for certain. */
const UNRESOLVED =
  "could not resolve which PDF this send uploads — check the dry run";

/**
 * Why the person is asked, for `paperlint submission` sends: each send's paper, PDF and build — every
 * send in the command, one block each. Words the shell would expand (`$…`, backticks) are not
 * guessed at: such a command is described as unresolved.
 */
export function paperlintReason(
  command: string,
  leaves: readonly ShellLeaf[],
  cwd: string,
  deps: ConfirmDeps,
): string {
  const sends = /[`$]/u.test(command) ? [] : sendsIn(leaves, deps.readSend);
  const one = (x: Send | null): readonly string[] =>
    x === null ? [UNRESOLVED] : sendLines(x, cwd, deps);
  const blocks =
    sends.length === 0
      ? [UNRESOLVED]
      : sends.length === 1
        ? sends.flatMap(one)
        : sends.flatMap((x, n) => [
            `send ${String(n + 1)} of ${String(sends.length)}:`,
            ...one(x),
          ]);
  return [SENDS, ...blocks, LAST].join("\n");
}

/** The ask when the hook's input cannot be read at all: it cannot tell, so the person decides. */
export const UNREADABLE_INPUT: AskOutput = ask(
  `paperlint could not read this command, so it cannot tell whether it sends a paper to a venue's portal. ${LAST}`,
);

const SENDS =
  "This sends the paper to the venue's portal (paperlint submission with --save or --submit).";

const DIRECT = `This command names a venue's submission portal, so it may send to it outside paperlint and its venue check. ${LAST}`;

/** The payload, parsed; null when it is not JSON. */
function parsed(stdin: string): unknown {
  try {
    return JSON.parse(stdin);
  } catch {
    return null;
  }
}

/**
 * The hook on one payload, as Claude Code sends it on stdin: the ask, or null for a command that
 * sends nothing. Never throws: what it cannot read, it asks about.
 */
export function submissionConfirm(
  stdin: string,
  deps: ConfirmDeps,
): AskOutput | null {
  const payload = parsed(stdin);
  if (payload === null) return UNREADABLE_INPUT;
  const raw = fieldOf(fieldOf(payload, "tool_input"), "command");
  const command = typeof raw === "string" ? raw : "";
  const given = fieldOf(payload, "cwd");
  const cwd =
    typeof given === "string" && isAbsolute(given) ? given : resolve(".");
  const kind = kindOf(command, cwd, deps);
  if (kind === null) return null;
  if (kind !== "paperlint" && kind !== "direct") return ask(kind.failed);
  if (kind === "direct") return ask(DIRECT);
  try {
    return ask(paperlintReason(command, deps.shellLeaves(command), cwd, deps));
  } catch (e) {
    return ask(
      `${SENDS} paperlint could not say what will be sent: ${messageOf(e)}. ${LAST}`,
    );
  }
}

/** What the command sends, or — when reading it failed — the reason to ask anyway. */
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
      failed: `paperlint could not tell what this command sends (${messageOf(e)}). ${LAST}`,
    };
  }
}
