import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { absolutePath } from "./domain/paths.ts";
import type { ProjectInstall } from "./ports/project-install.ts";
import {
  installSelf,
  manifestName,
  reportSelfInstall,
  selfInstallStep,
  versionOf,
  type Copy,
  type SelfInstallDeps,
} from "./self-install.ts";
import { scriptedPrompts, type Reply } from "../test/support.ts";

const ROOT = absolutePath("/work/My Papers");
const MANIFEST = "/work/My Papers/package.json";
const RUNNING: Copy = { dir: "/npx/paperlint", version: "2.0.0" };

/** An installer that records what it ran, and exits as told. */
const recording = (ok = true) => {
  const ran: (readonly string[])[] = [];
  const install: ProjectInstall = {
    command: (_root, spec) => [
      "npm",
      "install",
      "--save-dev",
      "--save-exact",
      spec,
    ],
    run: (_root, argv) => (
      ran.push(argv),
      ok ? { ok: true } : { ok: false, reason: "exited 1" }
    ),
  };
  return { ran, install };
};

const setup = ({
  installed = null,
  manifest = '{"name":"x"}\n',
  ok = true,
}: {
  installed?: Copy | null;
  manifest?: string | null;
  ok?: boolean;
} = {}) => {
  const files = memoryFiles(manifest === null ? {} : { [MANIFEST]: manifest });
  const { ran, install } = recording(ok);
  const deps: SelfInstallDeps = {
    running: RUNNING,
    installed: () => installed,
    files,
    install,
    spec: "paperlint@2.0.0",
  };
  const said: string[] = [];
  const go = (opts: { interactive: boolean; reply?: Reply }) => {
    const prompts = scriptedPrompts(() => opts.reply);
    return installSelf(ROOT, deps, {
      prompts,
      interactive: opts.interactive,
      log: (l) => said.push(l),
    }).then((r) => ({ r, asked: prompts.asked }));
  };
  /** The whole step as the CLI runs it: its exit code (null: go on to init) and every line printed. */
  const step = async (opts: { interactive: boolean; reply?: Reply }) => {
    const out: string[] = [];
    const code = await selfInstallStep(
      ROOT,
      deps,
      {
        prompts: scriptedPrompts(() => opts.reply),
        interactive: opts.interactive,
        log: (l) => out.push(l),
      },
      { code: 130, line: "CANCELLED" },
    );
    return { code, out };
  };
  return { files, ran, said, go, step };
};

const COMMAND = "npm install --save-dev --save-exact paperlint@2.0.0";

describe("installSelf — paperlint added to the project it runs in", () => {
  it("the project's own copy: nothing asked, nothing run", async () => {
    const s = setup({ installed: RUNNING });
    const { r, asked } = await s.go({ interactive: true });
    expect([r, asked, s.ran]).toEqual([{ kind: "present" }, [], []]);
    expect(reportSelfInstall(r)).toEqual([]);
  });

  it("another copy at the same version counts as present", async () => {
    const s = setup({ installed: { dir: "/elsewhere", version: "2.0.0" } });
    expect((await s.go({ interactive: false })).r).toEqual({ kind: "present" });
  });

  it("🔴 another version installed: said, kept, never up- or downgraded", async () => {
    const s = setup({ installed: { dir: "/proj/nm", version: "1.4.0" } });
    const { r } = await s.go({ interactive: true, reply: true });
    expect([r, s.ran]).toEqual([
      {
        kind: "other-version",
        installed: "1.4.0",
        running: "2.0.0",
        command: COMMAND,
      },
      [],
    ]);
    expect(reportSelfInstall(r)).toEqual([
      "  ⚠ paperlint 1.4.0 is installed in this project, and this command is 2.0.0: kept 1.4.0, nothing up- or downgraded",
      `      to move the project to 2.0.0: ${COMMAND}`,
    ]);
  });

  it("no terminal: added without asking, the command printed before it runs", async () => {
    const s = setup();
    const { r, asked } = await s.go({ interactive: false });
    expect([r, asked, s.said, s.ran.map((a) => a.join(" "))]).toEqual([
      { kind: "added", command: COMMAND, manifest: null },
      [],
      [`  → ${COMMAND}`],
      [COMMAND],
    ]);
    expect(reportSelfInstall(r)).toEqual([
      "  ✓ added paperlint to devDependencies",
    ]);
  });

  it("no package.json: a minimal one is written first, and said", async () => {
    const s = setup({ manifest: null });
    const { r } = await s.go({ interactive: false });
    expect(new TextDecoder().decode(s.files.map.get(MANIFEST))).toBe(
      '{\n  "name": "my-papers",\n  "private": true\n}\n',
    );
    expect(reportSelfInstall(r)).toEqual([
      '  ✓ wrote package.json ({ "name": "my-papers", "private": true }) — there was none',
      "  ✓ added paperlint to devDependencies",
    ]);
  });
});

describe("installSelf — a human at a terminal, and failures", () => {
  it("a human: asked with Yes preselected; Enter adds it", async () => {
    const s = setup();
    const { r, asked } = await s.go({ interactive: true });
    expect([r.kind, asked]).toEqual([
      "added",
      ["Add paperlint 2.0.0 to this project's devDependencies?"],
    ]);
  });

  it("a human says No: nothing written or run, and the command to run by hand", async () => {
    const s = setup({ manifest: null });
    const { r } = await s.go({ interactive: true, reply: false });
    expect([r, s.ran, s.files.map.size]).toEqual([
      { kind: "declined", command: COMMAND },
      [],
      0,
    ]);
    expect(reportSelfInstall(r)).toEqual([
      `  · not added — run it yourself, then \`npx paperlint init\` again: ${COMMAND}`,
    ]);
  });

  it("Ctrl+C: cancelled, nothing run", async () => {
    const s = setup();
    const { r } = await s.go({ interactive: true, reply: "cancel" });
    expect([r, s.ran, reportSelfInstall(r)]).toEqual([
      { kind: "cancelled" },
      [],
      [],
    ]);
  });

  it("a question that failed takes its default, Yes", async () => {
    const s = setup();
    const { r } = await s.go({
      interactive: true,
      reply: new Error("stream ended"),
    });
    expect(r.kind).toBe("added");
  });

  it("the package manager failed: said, with what to run by hand", async () => {
    const s = setup({ ok: false, manifest: null });
    const { r } = await s.go({ interactive: false });
    expect(reportSelfInstall(r)).toEqual([
      '  ✓ wrote package.json ({ "name": "my-papers", "private": true }) — there was none',
      `  ✗ ${COMMAND} failed (exited 1) — nothing else was done. Run it yourself, then \`npx paperlint init\` again`,
    ]);
  });
});

describe("selfInstallStep — step 0 of init, as the CLI runs it", () => {
  it("present: silent, and init goes on", async () => {
    expect(
      await setup({ installed: RUNNING }).step({ interactive: false }),
    ).toEqual({
      code: null,
      out: [],
    });
  });

  it("added without a terminal: the header with the command, then what happened; init goes on", async () => {
    expect(await setup().step({ interactive: false })).toEqual({
      code: null,
      out: [
        `\npaperlint in this project\n  → ${COMMAND}`,
        "  ✓ added paperlint to devDependencies",
      ],
    });
  });

  it("a human says No: the header and the command to run by hand; init stops, exit 0", async () => {
    expect(await setup().step({ interactive: true, reply: false })).toEqual({
      code: 0,
      out: [
        `\npaperlint in this project\n  · not added — run it yourself, then \`npx paperlint init\` again: ${COMMAND}`,
      ],
    });
  });

  it("the install failed: init stops, exit 2", async () => {
    expect((await setup({ ok: false }).step({ interactive: false })).code).toBe(
      2,
    );
  });

  it("Ctrl+C: the cancel line and its code", async () => {
    expect(await setup().step({ interactive: true, reply: "cancel" })).toEqual({
      code: 130,
      out: ["CANCELLED"],
    });
  });

  it("another version: said under the header, and init goes on with it", async () => {
    const r = await setup({ installed: { dir: "/p", version: "1.4.0" } }).step({
      interactive: false,
    });
    expect([
      r.code,
      r.out.length,
      r.out[0]?.startsWith("\npaperlint in this project\n  ⚠ paperlint 1.4.0"),
    ]).toEqual([null, 2, true]);
  });
});

describe("manifestName and versionOf", () => {
  it("a folder's name, as npm accepts one; nothing usable is `papers`", () => {
    expect([
      manifestName("/a/My Papers!"),
      manifestName("/a/.hidden"),
      manifestName("/a/..."),
    ]).toEqual(["my-papers-", "hidden", "papers"]);
  });

  it("the version a package.json names, or null", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect([
      versionOf(null),
      versionOf(enc('{"name":"x"}')),
      versionOf(enc('{"version":"1.2.3"}')),
    ]).toEqual([null, null, "1.2.3"]);
  });
});
