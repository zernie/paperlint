/**
 * The notice an upgrade owes a project whose hooks are only partly wired: a wired PostToolUse hook
 * that acts on a paper file says so once per installed version, as `additionalContext`, and
 * `paperlint lint` says it on stderr every run. Both halves: it speaks for a missing hook and a new
 * version, and it stays quiet for a fully wired project, the same version again, a settings file it
 * cannot read, a file outside every paper and a PreToolUse hook — and never changes what the hook
 * itself said or its exit code.
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { z } from "zod";
import { useTempDir, writeTree } from "../test/support.ts";
import { run, runHook, spawnHook } from "./cli.ts";
import {
  NOTICE_STATE,
  lintLine,
  mergeNotice,
  noticeText,
} from "./hooks-notice.ts";
import { WIRING_FILE } from "./hooks-settings.ts";

const root = useTempDir("hooks-notice-");

const sentence = (n: number): string =>
  `${Array.from({ length: n - 1 }, () => "word").join(" ")} end.`;

const Entry = z.looseObject({
  hooks: z.array(z.looseObject({ command: z.string() })),
});
const Wiring = z.object({ hooks: z.record(z.string(), z.array(Entry)) });

/** The shipped wiring without the hooks whose command names one of `without`. */
const wiringWithout = (without: readonly string[]): string => {
  const named = (command: string) =>
    without.some((n) => command.endsWith(`hook ${n}`));
  const shipped = Wiring.parse(JSON.parse(readFileSync(WIRING_FILE, "utf8")));
  const kept = Object.entries(shipped.hooks).map(
    ([event, entries]): [string, unknown[]] => [
      event,
      entries
        .map((e) => ({ ...e, hooks: e.hooks.filter((h) => !named(h.command)) }))
        .filter((e) => e.hooks.length > 0),
    ],
  );
  return JSON.stringify({ hooks: Object.fromEntries(kept) });
};

/** A project with a paper whose edit is clean (or not) and the settings file given. */
function project(name: string, settings: string | null, long = false): string {
  const dir = join(root, name);
  writeTree(dir, {
    "package.json": "{}\n",
    "papers/p/PIPELINE-STATUS.md": "# status\n",
    "papers/p/paperlint.json": JSON.stringify({
      extends: null,
      rules: { "tex/max-sentence-words": "error" },
    }),
    "papers/p/paper.tex": `\\documentclass{article}\n\\begin{document}\nShort one.\n\n${long ? sentence(64) : "Fine."}\n\\end{document}\n`,
    "notes.txt": "x\n",
    ...(settings === null ? {} : { ".claude/settings.json": settings }),
  });
  return dir;
}

/** `paperlint hook <name>` in-process on an Edit of `file`. */
// eslint-disable-next-line max-params -- a test helper: the hook, the project, the edit and the version
async function hook(
  name: string,
  dir: string,
  file: string,
  newString: string,
  version = "9.9.9",
) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runHook(name, {
    stdin: () =>
      JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: file, new_string: newString },
      }),
    out: (t) => {
      out.push(t);
    },
    err: (m: string) => {
      err.push(m);
    },
    projectDir: dir,
    version,
  });
  return { code, out: out.join(""), err };
}

const Notice = z.object({
  hookSpecificOutput: z.object({
    hookEventName: z.literal("PostToolUse"),
    additionalContext: z.string(),
  }),
});

test("noticeText names the version and the hooks, as an instruction; mergeNotice keeps what the hook said", () => {
  const text = noticeText("9.9.9", ["lint-edited"], false);
  assert.match(text, /paperlint 9\.9\.9/);
  assert.match(text, /lint-edited/);
  assert.match(text, /Run `npx paperlint init` now/);
  assert.match(noticeText("9.9.9", ["lint-edited"], true), /by hand/);
  const merged = mergeNotice(
    JSON.stringify({ decision: "block", reason: "r" }),
    "N",
  );
  assert.deepEqual(JSON.parse(merged ?? ""), {
    decision: "block",
    reason: "r",
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: "N",
    },
  });
  assert.equal(mergeNotice("not json", "N"), null);
  assert.equal(mergeNotice("[1]", "N"), null);
});

test("a wired hook on a paper file: missing hook → one notice, the same version again → silent, a new version → one more", async () => {
  const dir = project("partly", wiringWithout(["lint-edited"]));
  const file = join(dir, "papers/p/paper.tex");
  const first = await hook("lint-edited", dir, file, "Fine.");
  assert.equal(first.code, 0);
  assert.deepEqual(first.err, []);
  const { additionalContext } = Notice.parse(
    JSON.parse(first.out),
  ).hookSpecificOutput;
  assert.match(additionalContext, /paperlint 9\.9\.9/);
  assert.match(additionalContext, /lint-edited/);
  assert.match(additionalContext, /npx paperlint init/);
  assert.deepEqual(await hook("lint-edited", dir, file, "Fine."), {
    code: 0,
    out: "",
    err: [],
  });
  const next = await hook("lint-edited", dir, file, "Fine.", "9.9.10");
  assert.match(
    Notice.parse(JSON.parse(next.out)).hookSpecificOutput.additionalContext,
    /paperlint 9\.9\.10/,
  );
});

test("the notice rides on what the hook said: a block stays a block, and the exit stays 0", async () => {
  const dir = project("block", wiringWithout(["paper-status-gates"]), true);
  const said = await hook(
    "lint-edited",
    dir,
    join(dir, "papers/p/paper.tex"),
    sentence(64),
  );
  assert.equal(said.code, 0);
  const parsed = z
    .object({ decision: z.literal("block"), reason: z.string() })
    .loose()
    .parse(JSON.parse(said.out));
  assert.match(parsed.reason, /tex\/max-sentence-words/);
  assert.match(
    Notice.parse(parsed).hookSpecificOutput.additionalContext,
    /paper-status-gates/,
  );
});

test("silent: fully wired, nothing wired, settings that do not parse, a file outside every paper, a PreToolUse hook", async () => {
  const quiet = { code: 0, out: "", err: [] };
  const wired = project("wired", wiringWithout([]));
  assert.deepEqual(
    await hook(
      "lint-edited",
      wired,
      join(wired, "papers/p/paper.tex"),
      "Fine.",
    ),
    quiet,
  );
  const none = project("none", null);
  assert.deepEqual(
    await hook("lint-edited", none, join(none, "papers/p/paper.tex"), "Fine."),
    quiet,
  );
  const broken = project("broken", "{ not json", true);
  const blocked = await hook(
    "lint-edited",
    broken,
    join(broken, "papers/p/paper.tex"),
    sentence(64),
  );
  assert.equal(blocked.code, 0);
  assert.deepEqual(blocked.err, []);
  assert.equal(
    "hookSpecificOutput" in
      z.record(z.string(), z.unknown()).parse(JSON.parse(blocked.out)),
    false,
  );
  const partly = project("outside", wiringWithout(["lint-edited"]));
  assert.deepEqual(
    await hook("lint-edited", partly, join(partly, "notes.txt"), "x"),
    quiet,
  );
  const layout = await hook(
    "paper-folder-layout",
    partly,
    join(partly, "papers/p/paper.tex"),
    "Fine.",
  );
  assert.deepEqual(layout, quiet);
  // The outside edit did not spend the notice: the paper edit after it still gets one.
  const after = await hook(
    "lint-edited",
    partly,
    join(partly, "papers/p/paper.tex"),
    "Fine.",
  );
  assert.match(after.out, /lint-edited/);
});

test("paperlint lint: one stderr line naming the missing hooks when partly wired, the exit code unchanged, nothing when wired or not wired at all", async () => {
  const lint = async (dir: string) => {
    const err: string[] = [];
    const code = await run(["lint"], {
      log: () => undefined,
      err: (...a: unknown[]) => err.push(a.join(" ")),
      cwd: dir,
    });
    return { code, err: err.filter((l) => /not wired|unwired/.test(l)) };
  };
  const partly = await lint(
    project("lint-partly", wiringWithout(["lint-edited"])),
  );
  assert.equal(partly.err.length, 1);
  assert.match(
    partly.err[0] ?? "",
    /hook lint-edited is not wired — run `npx paperlint init`/,
  );
  const wired = await lint(project("lint-wired", wiringWithout([])));
  const none = await lint(project("lint-none", null));
  assert.deepEqual([wired.err, none.err], [[], []]);
  assert.equal(partly.code, wired.code);
});

test("a spawned PostToolUse hook: its stdout is captured and merged, its payload fed on stdin; outside a paper it is fed and left alone; a failing hook's output is passed through", () => {
  const dir = project("spawned", wiringWithout(["lint-edited"]));
  const payload = (file: string) =>
    JSON.stringify({ tool_input: { file_path: file } });
  const spawn = (file: string, status = 0, stdout = "") => {
    const seen: unknown[] = [];
    const out: string[] = [];
    const code = runHook("paper-skills-nudge", {
      stdin: () => payload(file),
      out: (t) => {
        out.push(t);
      },
      projectDir: dir,
      version: "9.9.9",
      run: (_f, _a, o) => {
        seen.push(o);
        return { status, stdout };
      },
    });
    return { code, seen, out: out.join("") };
  };
  const nudge = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: "nudge",
    },
  });
  const outside = spawn(join(dir, "notes.txt"), 0, "");
  assert.deepEqual(outside.seen, [
    {
      stdio: ["pipe", "inherit", "inherit"],
      input: payload(join(dir, "notes.txt")),
      encoding: "utf8",
    },
  ]);
  assert.equal(outside.out, "");
  const failed = spawn(
    join(dir, "papers/p/paper.tex"),
    2,
    "stdout of a refusal",
  );
  assert.deepEqual([failed.code, failed.out], [2, "stdout of a refusal"]);
  const merged = spawn(join(dir, "papers/p/paper.tex"), 0, nudge);
  const context = Notice.parse(JSON.parse(merged.out)).hookSpecificOutput
    .additionalContext;
  assert.match(context, /^nudge\n\n⚠ paperlint 9\.9\.9 .*lint-edited/s);
  assert.equal(merged.code, 0);
});

test("the notice machinery never fails a hook: an unwritable state file is one stderr line, no notice, the hook's own output intact", async () => {
  const dir = project("state-blocked", wiringWithout(["lint-edited"]));
  // `node_modules/.cache` as a FILE: the state cannot be written under it.
  writeTree(dir, { "node_modules/.cache": "x" });
  const r = await hook(
    "lint-edited",
    dir,
    join(dir, "papers/p/paper.tex"),
    "Fine.",
  );
  assert.equal(r.code, 0);
  assert.equal(r.err.length, 1);
  assert.match(
    r.err[0] ?? "",
    /^paperlint: the unwired-hooks notice was not recorded: /,
  );
  assert.equal(r.out, "");
});

test("lintLine says hook or hooks, is or are", () => {
  assert.match(
    lintLine("1.2.3", ["a"]),
    /^paperlint 1\.2\.3: hook a is not wired/,
  );
  assert.match(lintLine("1.2.3", ["a", "b"]), /hooks a, b are not wired/);
});

test("the check that cannot run, and a payload that cannot be read, leave the hook alone", async () => {
  const dir = project("unreadable", wiringWithout(["lint-edited"]));
  // `.claude/settings.json` as a DIRECTORY: reading it throws EISDIR.
  const dirSettings = project("settings-dir", null);
  mkdirSync(join(dirSettings, ".claude", "settings.json"), { recursive: true });
  const file = join(dirSettings, "papers/p/paper.tex");
  const broken = await hook("lint-edited", dirSettings, file, "Fine.");
  assert.equal(broken.code, 0);
  assert.equal(broken.out, "");
  assert.match(
    broken.err[0] ?? "",
    /^paperlint: the unwired-hooks check did not run: /,
  );
  // Garbage on stdin: not about a paper, so the hook runs untouched and says its own one line.
  const said: string[] = [];
  const garbled = await runHook("lint-edited", {
    stdin: () => "{ not json",
    out: () => undefined,
    err: (m: string) => void said.push(m),
    projectDir: dir,
    version: "9.9.9",
  });
  assert.equal(garbled, 0);
  assert.match(
    said.join("\n"),
    /^paperlint: the lint-edited hook did not run: /,
  );
  // A stdin that throws: the hook meets the same failure itself.
  const thrown: string[] = [];
  const unread = await runHook("lint-edited", {
    stdin: () => {
      throw new Error("EAGAIN");
    },
    out: () => undefined,
    err: (m: string) => void thrown.push(m),
    projectDir: dir,
    version: "9.9.9",
  });
  assert.equal(unread, 0);
  assert.match(thrown.join("\n"), /did not run: EAGAIN/);
});

test("spawnHook: the real spawner, once with the terminal's streams and once piped with an input", () => {
  const print = ["-e", "process.stdin.pipe(process.stdout)"];
  assert.deepEqual(
    spawnHook(process.execPath, ["-e", "0"], { stdio: "inherit" }),
    { status: 0, stdout: null },
  );
  assert.deepEqual(
    spawnHook(process.execPath, print, {
      stdio: ["pipe", "pipe", "inherit"],
      input: "payload",
      encoding: "utf8",
    }),
    { status: 0, stdout: "payload" },
  );
});

test("a state file that is garbage, or not an object, counts as not told: the notice speaks and rewrites it", async () => {
  const state = (dir: string) => join(dir, NOTICE_STATE);
  const told = (dir: string) =>
    z
      .object({ version: z.string() })
      .parse(JSON.parse(readFileSync(state(dir), "utf8"))).version;
  const cases = [
    ["state-garbage", "{ not json"],
    ["state-array", "[1]"],
    ["state-empty", ""],
  ] as const;
  for (const [name, content] of cases) {
    const dir = project(name, wiringWithout(["lint-edited"]));
    writeTree(dir, { [NOTICE_STATE]: content });
    const file = join(dir, "papers/p/paper.tex");
    const first = await hook("lint-edited", dir, file, "Fine.");
    assert.match(first.out, /paperlint 9\.9\.9/, name);
    assert.equal(told(dir), "9.9.9", name);
    assert.equal((await hook("lint-edited", dir, file, "Fine.")).out, "", name);
  }
});

test("paperlint lint: a settings file it cannot read is no second finding — the report and the exit code are the lint's own", async () => {
  const dir = project("lint-unreadable", null);
  // `.claude/settings.json` as a DIRECTORY: reading it throws EISDIR.
  mkdirSync(join(dir, ".claude", "settings.json"), { recursive: true });
  const err: string[] = [];
  const code = await run(["lint"], {
    log: () => undefined,
    err: (...a: unknown[]) => void err.push(a.join(" ")),
    cwd: dir,
  });
  const clean = await run(["lint"], {
    log: () => undefined,
    err: () => undefined,
    cwd: project("lint-unreadable-control", null),
  });
  assert.equal(code, clean);
  assert.deepEqual(
    err.filter((l) => /wired/.test(l)),
    [],
  );
});
