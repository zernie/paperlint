/**
 * Makes the shipped skills visible to Claude Code: one RELATIVE symlink per skill,
 * `<project>/.claude/skills/<name> -> <the installed package>/skills/<name>`.
 *
 * 🔴 WHY THIS EXISTS. The README used to say the skills "sit in `node_modules/…/skills/` and Claude
 * Code reads them from there". It does not: Claude Code discovers project skills in
 * `.claude/skills/<name>/SKILL.md` (plus user and plugin skills), never inside `node_modules`. So a
 * consumer who followed the install to the letter had no `/paper-pipeline` at all (Codex review on
 * #45). A plugin could not carry them either — it gets no `node_modules`, and 23 of 24 skills run
 * scripts (`docs/install.md`, "Why it is shaped this way"). The one consumer where the skills
 * DID work had made these links by hand; this module makes the same links, so the layout is the
 * proven one rather than a new one.
 *
 * The links are what make the project-root-relative script paths inside the skills
 * (`.claude/skills/paper-pipeline/scripts/x.mjs`) resolve in a consumer at all.
 *
 * ── THE THREE RULES ─────────────────────────────────────────────────────────
 *   what to link      every subdirectory holding a SKILL.md under the package's
 *                     `SHIPPED_SKILLS_DIR` (consumer.mjs). No list, no count.
 *   where it points   the package as it RESOLVES BY NAME from the project, spelled through the
 *                     project's own `node_modules/paperlint` when that path leads to
 *                     the same place. Under pnpm the resolved path is the version-stamped
 *                     `.pnpm/…` store directory; a link spelled that way dangles after the next
 *                     upgrade, a link through `node_modules/paperlint` does not.
 *   what it touches   only what is missing. An entry that already leads to the shipped skill is
 *                     left alone; ANY other entry of the same name — a directory, a file, a link
 *                     elsewhere, a dangling link — is someone else's, and is reported, not replaced.
 */
/* eslint-disable boundaries/dependencies -- legacy I/O, moves behind a port in #76 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
} from "node:fs";
/* eslint-enable boundaries/dependencies */
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  installedSkills,
  PACKAGE_NAME,
  SHIPPED_SKILLS_DIR,
} from "../skills/paper-pipeline/scripts/consumer.mjs";

export { PACKAGE_NAME };
/** Where Claude Code looks for project skills, relative to the project root. */
export const SKILLS_HOME = join(".claude", "skills");

export type Located =
  | { readonly dir: string; readonly spelled: string }
  | { readonly error: string };

/**
 * The installed package, asked of Node from the PROJECT, not from wherever this code runs. A copy
 * run out of the npx cache is not the project's install, and a link into a cache is a link that
 * disappears with it — so "does not resolve from here" is an answer, not something to paper over.
 *
 * @returns `dir` — the real directory; `spelled` — the same directory as the project names it.
 */
export function locatePackage(project: string): Located {
  let manifest: string;
  try {
    const req = createRequire(
      pathToFileURL(join(project, "__paperlint_locate__.js")).href,
    );
    manifest = req.resolve(`${PACKAGE_NAME}/package.json`);
  } catch (e) {
    return {
      error: `${(e as NodeJS.ErrnoException).code ?? "error"}: ${(e as Error).message.split("\n")[0]}`,
    };
  }
  const dir = realpathSync(dirname(manifest));
  // Node's own walk, without its realpath step: the first `node_modules/<name>` up the tree that
  // leads to the package that resolved.
  for (let d = realpathSync(project); ; d = dirname(d)) {
    const candidate = join(d, "node_modules", PACKAGE_NAME);
    try {
      if (realpathSync(candidate) === dir) return { dir, spelled: candidate };
    } catch {
      // not here — keep walking
    }
    if (dirname(d) === d) break;
  }
  return { dir, spelled: dir };
}

/** The skills the package ships: every skill under its `SHIPPED_SKILLS_DIR`. */
export function shippedSkills(
  pkgDir: string,
):
  | { readonly skillsDir: string; readonly names: readonly string[] }
  | { readonly error: string } {
  const skillsDir = join(pkgDir, SHIPPED_SKILLS_DIR);
  // A missing directory is an error, never an empty list: zero skills linked must not read as a
  // clean run.
  if (!existsSync(skillsDir))
    return { error: `the package's skills directory is missing: ${skillsDir}` };
  // The same function every reader of an installed skills directory calls (paperlint#62): the writer
  // and the readers of this fact share one definition of "a skill is here", links included.
  try {
    return { skillsDir, names: installedSkills(skillsDir) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export type LinkStatus = "created" | "present" | "missing" | "foreign";

export interface SkillLink {
  readonly name: string;
  readonly status: LinkStatus;
  /** For `foreign`: what is there instead, in words. */
  readonly reason?: string;
}

export type LinkReport =
  | {
      readonly ok: true;
      readonly home: string;
      /** The link target of the first skill, e.g. `../../node_modules/paperlint/skills/x`. */
      readonly example: string | null;
      readonly links: readonly SkillLink[];
    }
  | { readonly ok: false; readonly error: string };

/** What occupies `entry`, judged against the directory it should lead to. */
function inspect(
  entry: string,
  want: string,
): { status: "present" | "missing" | "foreign"; reason?: string } {
  let st;
  try {
    st = lstatSync(entry);
  } catch {
    return { status: "missing" };
  }
  try {
    if (realpathSync(entry) === want) return { status: "present" };
  } catch {
    return st.isSymbolicLink()
      ? {
          status: "foreign",
          reason: `a dangling link to ${readlinkSync(entry)}`,
        }
      : { status: "foreign", reason: "an entry that cannot be resolved" };
  }
  if (st.isSymbolicLink())
    return { status: "foreign", reason: `a link to ${readlinkSync(entry)}` };
  return {
    status: "foreign",
    reason: st.isDirectory() ? "a directory" : "a file",
  };
}

/** One skill: inspect its entry and, when writing, create the link. */
function linkOne(
  name: string,
  {
    entry,
    target,
    want,
    write,
  }: { entry: string; target: string; want: string; write: boolean },
): SkillLink {
  const seen = inspect(entry, want);
  if (!write || seen.status !== "missing")
    return seen.reason
      ? { name, status: seen.status, reason: seen.reason }
      : { name, status: seen.status };
  try {
    symlinkSync(target, entry, "dir");
    return { name, status: "created" };
  } catch (e) {
    return {
      name,
      status: "foreign",
      reason: `could not create the link: ${(e as Error).message}`,
    };
  }
}

/**
 * Link every shipped skill into `<project>/.claude/skills/`, or — with `write: false` — only
 * report which ones are missing (that is what `paperlint doctor` asks).
 */
export function linkSkills(
  project: string,
  {
    write = true,
    locate = locatePackage,
  }: { write?: boolean; locate?: (p: string) => Located } = {},
): LinkReport {
  const pkg = locate(project);
  if ("error" in pkg)
    return {
      ok: false,
      error: `${PACKAGE_NAME} does not resolve from ${project} (${pkg.error})`,
    };
  const shipped = shippedSkills(pkg.dir);
  if ("error" in shipped) return { ok: false, error: shipped.error };
  // The same directory, as the project spells it: the real skills dir re-rooted on `spelled`.
  const spelledSkills = join(pkg.spelled, relative(pkg.dir, shipped.skillsDir));

  const home = join(project, SKILLS_HOME);
  if (write && shipped.names.length > 0) {
    try {
      mkdirSync(home, { recursive: true });
    } catch (e) {
      return {
        ok: false,
        error: `cannot create ${home}: ${(e as Error).message}`,
      };
    }
  }
  // A relative target resolves against the directory that PHYSICALLY holds the link, so it is
  // computed from the real one — `.claude` may itself be a symlink.
  const physicalHome = existsSync(home) ? realpathSync(home) : resolve(home);

  let example: string | null = null;
  const links = shipped.names.map((name): SkillLink => {
    const target = relative(physicalHome, join(spelledSkills, name));
    example ??= target;
    return linkOne(name, {
      entry: join(home, name),
      target,
      want: realpathSync(join(shipped.skillsDir, name)),
      write,
    });
  });
  return { ok: true, home, example, links };
}
