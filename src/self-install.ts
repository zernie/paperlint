/**
 * `npx paperlint init` adds paperlint to the project it runs in, so the install is one command
 * (docs/prior-art/one-command-install.md, after `npm init @eslint/config`).
 *
 * ── THE DECISIONS ─────────────────────────────────────────────────────────────
 *   already installed   the project's copy resolves by name: nothing is added. At another version
 *                       than the running one it is SAID and kept — never up- or downgraded silently.
 *   what is added       `paperlint@<the running version>`, saved exact, so the command that ran and
 *                       the package it added cannot drift.
 *   which manager       the project's lockfile decides (`src/adapters/package-manager/`).
 *   no package.json     a minimal one is written first (private, the folder's name), and said.
 *   asking              a human is asked, Yes preselected; No stops init with the command to run by
 *                       hand. Without a human it is added unasked, the command printed: that is what
 *                       running init asked for.
 */
import { basename } from "node:path";
import { z } from "zod";
import { joinPath, type AbsolutePath } from "./domain/paths.ts";
import type { Files } from "./ports/files.ts";
import type { ProjectInstall } from "./ports/project-install.ts";
import type { Answer, Prompts } from "./ports/prompts.ts";

/** One copy of paperlint: where it is, and its version. */
export interface Copy {
  readonly dir: string;
  readonly version: string;
}

export interface SelfInstallDeps {
  /** The copy this command runs from. */
  readonly running: Copy;
  /** The project's own copy, as it resolves by name from the project, or null. */
  readonly installed: (root: AbsolutePath) => Copy | null;
  readonly files: Files;
  readonly install: ProjectInstall;
  /** What is added: `paperlint@<running version>` unless the CLI was told otherwise. */
  readonly spec: string;
}

export type SelfInstall =
  | { readonly kind: "present" }
  | {
      readonly kind: "other-version";
      readonly installed: string;
      readonly running: string;
      readonly command: string;
    }
  | {
      readonly kind: "added";
      readonly command: string;
      readonly manifest: string | null;
    }
  | { readonly kind: "declined"; readonly command: string }
  | {
      readonly kind: "failed";
      readonly command: string;
      readonly reason: string;
      readonly manifest: string | null;
    }
  | { readonly kind: "cancelled" };

/** The name a new package.json gets: the folder's, as npm accepts a name. */
export const manifestName = (root: string): string =>
  basename(root)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+/, "") || "papers";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Writes a minimal package.json when there is none; the name it was given, or null when one was there. */
function ensureManifest(root: AbsolutePath, files: Files): string | null {
  const path = joinPath(root, "package.json");
  if (files.readBytes(path) !== null) return null;
  const name = manifestName(root);
  files.writeAtomic(
    path,
    encode(`${JSON.stringify({ name, private: true }, null, 2)}\n`),
  );
  return name;
}

/** Asks whether to add it; a prompt that fails is the default, Yes. */
async function confirmed(
  prompts: Prompts,
  version: string,
): Promise<Answer<boolean>> {
  try {
    return await prompts.confirm({
      message: `Add paperlint ${version} to this project's devDependencies?`,
      initial: true,
    });
  } catch {
    return { kind: "answer", value: true };
  }
}

/** How init asks, and where it prints. */
export interface Asking {
  readonly prompts?: Prompts | undefined;
  readonly interactive: boolean;
  readonly log: (line: string) => void;
}

/** The project's copy against the running one; null when the project has none. */
const alreadyThere = (
  here: Copy | null,
  running: Copy,
  command: string,
): SelfInstall | null => {
  if (here === null) return null;
  return here.dir === running.dir || here.version === running.version
    ? { kind: "present" }
    : {
        kind: "other-version",
        installed: here.version,
        running: running.version,
        command,
      };
};

/** Whether a human said No, cancelled, or (or nobody was asked) it goes ahead: null. */
async function refused(
  deps: SelfInstallDeps,
  { prompts, interactive }: Asking,
  command: string,
): Promise<SelfInstall | null> {
  if (!interactive || !prompts) return null;
  const answer = await confirmed(prompts, deps.running.version);
  if (answer.kind === "cancel") return { kind: "cancelled" };
  return answer.value ? null : { kind: "declined", command };
}

export async function installSelf(
  root: AbsolutePath,
  deps: SelfInstallDeps,
  asking: Asking,
): Promise<SelfInstall> {
  const command = deps.install.command(root, deps.spec);
  const shown = command.join(" ");
  const stop =
    alreadyThere(deps.installed(root), deps.running, shown) ??
    (await refused(deps, asking, shown));
  if (stop !== null) return stop;
  const manifest = ensureManifest(root, deps.files);
  asking.log(`  → ${shown}`);
  const ran = deps.install.run(root, command);
  return ran.ok
    ? { kind: "added", command: shown, manifest }
    : { kind: "failed", command: shown, reason: ran.reason, manifest };
}

const SELF_HEADER = `paperlint in this project`;

/**
 * Step 0 of `paperlint init`, run by the CLI before init itself: paperlint added to the project.
 * Null to go on to init; otherwise the exit code to stop with (No: 0, a failed install: 2, Ctrl+C:
 * `cancelledCode`). The header is printed with the first line, so a project that has paperlint
 * already sees nothing.
 */
export async function selfInstallStep(
  root: AbsolutePath,
  deps: SelfInstallDeps,
  asking: Asking,
  cancelled: { readonly code: number; readonly line: string },
): Promise<number | null> {
  const say = (line: string): void => {
    asking.log([``, SELF_HEADER, line].join("\n"));
  };
  const r = await installSelf(root, deps, { ...asking, log: say });
  if (r.kind === "cancelled") {
    asking.log(cancelled.line);
    return cancelled.code;
  }
  const [first, ...rest] = reportSelfInstall(r);
  const announced = r.kind === "added" || r.kind === "failed";
  if (first !== undefined)
    [announced ? first : [``, SELF_HEADER, first].join("\n"), ...rest].forEach(
      (line) => {
        asking.log(line);
      },
    );
  if (r.kind === "declined") return 0;
  return r.kind === "failed" ? 2 : null;
}

const manifestLine = (name: string | null): readonly string[] =>
  name === null
    ? []
    : [
        `  ✓ wrote package.json ({ "name": "${name}", "private": true }) — there was none`,
      ];

/** The section's lines, written after the command ran; empty when paperlint was already there. */
export function reportSelfInstall(r: SelfInstall): readonly string[] {
  if (r.kind === "present" || r.kind === "cancelled") return [];
  if (r.kind === "other-version")
    return [
      `  ⚠ paperlint ${r.installed} is installed in this project, and this command is ${r.running}: kept ${r.installed}, nothing up- or downgraded`,
      `      to move the project to ${r.running}: ${r.command}`,
    ];
  if (r.kind === "declined")
    return [
      `  · not added — run it yourself, then \`npx paperlint init\` again: ${r.command}`,
    ];
  if (r.kind === "failed")
    return [
      ...manifestLine(r.manifest),
      `  ✗ ${r.command} failed (${r.reason}) — nothing else was done. Run it yourself, then \`npx paperlint init\` again`,
    ];
  return [
    ...manifestLine(r.manifest),
    `  ✓ added paperlint to devDependencies`,
  ];
}

/** The version a package.json names, or null. */
export const versionOf = (bytes: Uint8Array | null): string | null => {
  if (bytes === null) return null;
  const parsed = z
    .object({ version: z.string() })
    .safeParse(JSON.parse(new TextDecoder().decode(bytes)));
  return parsed.success ? parsed.data.version : null;
};
