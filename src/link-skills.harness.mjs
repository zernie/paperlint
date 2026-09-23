/**
 * Both halves for `link-skills.ts` — the symlinks that make the shipped skills visible to Claude
 * Code at `.claude/skills/<name>`.
 *
 * 🔴 WHY THE PACKAGE IS BUILT ON DISK HERE, NOT FAKED. What is under test is a property of a tree:
 * whether Node resolves the package from the project, which spelling of it the link uses, and
 * whether `SKILL.md` is reachable THROUGH the link. A stubbed locator would test the stub. So each
 * case lays out a real `node_modules` — the npm shape and the pnpm shape, where
 * `node_modules/research-paper-pipeline` is itself a symlink into a version-stamped store
 * directory — and asks the filesystem.
 *
 * The fixture package declares its skills in `./ships/`, NOT in `./skills/`, on purpose: a linker
 * that read `skills/` from memory instead of the manifest would pass against the real package and
 * be caught only here.
 *
 * Run:    node src/link-skills.harness.mjs
 * Killed by: src/link-skills.mutations.mjs
 */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { linkSkills, locatePackage, shippedSkills } = await import(join(HERE, "link-skills.ts"));

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, label);
};

const SKILLS = ["alpha", "beta", "gamma"];
const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-link-skills-")));

/** A package as a manager would unpack it: manifest, plugin declaration, skills, one non-skill. */
function writePackage(dir) {
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "research-paper-pipeline", version: "1.0.0" }));
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ skills: "./ships/" }));
  for (const s of SKILLS) {
    mkdirSync(join(dir, "ships", s, "scripts"), { recursive: true });
    writeFileSync(join(dir, "ships", s, "SKILL.md"), `---\nname: ${s}\n---\n`);
    writeFileSync(join(dir, "ships", s, "scripts", "run.mjs"), "");
  }
  // A directory without SKILL.md and a loose file: neither is a skill.
  mkdirSync(join(dir, "ships", "shared"), { recursive: true });
  writeFileSync(join(dir, "ships", "README.md"), "# skills\n");
}

/** A consumer project with the package installed the npm way or the pnpm way. */
function consumer(name, manager = "npm") {
  const dir = join(work, name);
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "c", version: "1.0.0" }));
  if (manager === "npm") writePackage(join(dir, "node_modules", "research-paper-pipeline"));
  else if (manager === "pnpm") {
    const store = join("node_modules", ".pnpm", "research-paper-pipeline@1.0.0", "node_modules", "research-paper-pipeline");
    writePackage(join(dir, store));
    symlinkSync(join(".pnpm", "research-paper-pipeline@1.0.0", "node_modules", "research-paper-pipeline"), join(dir, "node_modules", "research-paper-pipeline"), "dir");
  }
  return dir;
}

const home = (dir) => join(dir, ".claude", "skills");
const status = (report, name) => report.links.find((l) => l.name === name);

try {
  // ── I. A FRESH npm CONSUMER: EVERY DECLARED SKILL IS LINKED, AND ONLY SKILLS ───────────
  {
    const dir = consumer("npm");
    const r = linkSkills(dir);
    check(
      "🔴 it links every skill the package DECLARES (plugin.json → ./ships/), not a remembered skills/",
      r.ok === true && SKILLS.every((s) => status(r, s)?.status === "created"),
    );
    check(
      "and nothing that is not a skill — a directory without SKILL.md is not one",
      r.links.length === SKILLS.length && !existsSync(join(home(dir), "shared")),
    );
    check(
      "🔴 SKILL.md is reachable THROUGH the link, where Claude Code looks",
      SKILLS.every((s) => existsSync(join(home(dir), s, "SKILL.md"))),
    );
    check(
      "and a project-root-relative script path resolves from the project root",
      existsSync(join(dir, ".claude", "skills", "beta", "scripts", "run.mjs")),
    );
    const target = readlinkSync(join(home(dir), "alpha"));
    check(
      "🔴 the link is RELATIVE — an absolute one breaks the moment the checkout moves",
      !isAbsolute(target) && target === join("..", "..", "node_modules", "research-paper-pipeline", "ships", "alpha"),
    );
  }

  // ── II. A SECOND RUN CHANGES NOTHING ──────────────────────────────────────────────────
  {
    const dir = join(work, "npm");
    const before = SKILLS.map((s) => readlinkSync(join(home(dir), s)));
    const r = linkSkills(dir);
    check(
      "🔴 a second run reports every link as ALREADY present, not as a clash",
      r.ok && SKILLS.every((s) => status(r, s)?.status === "present"),
    );
    check(
      "and leaves the links byte for byte as they were",
      SKILLS.every((s, i) => readlinkSync(join(home(dir), s)) === before[i]),
    );
  }

  // ── III. A NAME THAT IS ALREADY TAKEN IS SOMEONE ELSE'S ───────────────────────────────
  {
    const dir = consumer("foreign");
    mkdirSync(join(home(dir), "alpha"), { recursive: true });
    writeFileSync(join(home(dir), "alpha", "SKILL.md"), "mine\n");
    mkdirSync(join(dir, "elsewhere"), { recursive: true });
    symlinkSync(join("..", "..", "elsewhere"), join(home(dir), "beta"), "dir");
    symlinkSync(join("..", "..", "gone"), join(home(dir), "gamma"), "dir");
    const r = linkSkills(dir);
    check(
      "🔴 a foreign DIRECTORY is left untouched, content and all",
      readFileSync(join(home(dir), "alpha", "SKILL.md"), "utf8") === "mine\n",
    );
    check(
      "a link that points ELSEWHERE is left pointing there",
      readlinkSync(join(home(dir), "beta")) === join("..", "..", "elsewhere"),
    );
    check(
      "a DANGLING link is not silently replaced either — it may be the consumer's",
      readlinkSync(join(home(dir), "gamma")) === join("..", "..", "gone"),
    );
    check(
      "and each one is reported by name, with WHAT is there",
      status(r, "alpha")?.status === "foreign" &&
        status(r, "alpha")?.reason === "a directory" &&
        /^a link to /.test(status(r, "beta")?.reason ?? "") &&
        /^a dangling link to /.test(status(r, "gamma")?.reason ?? ""),
    );
  }

  // ── IV. pnpm: THE LINK GOES THROUGH THE PROJECT'S OWN SPELLING ─────────────────────────
  {
    const dir = consumer("pnpm", "pnpm");
    const located = locatePackage(dir);
    check(
      "Node resolves the package to the version-stamped store directory",
      !("error" in located) && located.dir.includes(join(".pnpm", "research-paper-pipeline@1.0.0")),
    );
    const r = linkSkills(dir);
    check(
      "🔴 under pnpm the link goes through node_modules/research-paper-pipeline, not the .pnpm store — that one dangles on the next upgrade",
      r.ok && readlinkSync(join(home(dir), "alpha")) === join("..", "..", "node_modules", "research-paper-pipeline", "ships", "alpha"),
    );
    check(
      "and SKILL.md is reachable through both hops",
      SKILLS.every((s) => existsSync(join(home(dir), s, "SKILL.md"))),
    );
  }

  // ── V. NOT INSTALLED IN THIS PROJECT — NOTHING IS LINKED, AND IT SAYS WHY ──────────────
  {
    const dir = consumer("bare", "none");
    const r = linkSkills(dir);
    check(
      "a project that does not have the package gets an error, not links into somebody's cache",
      r.ok === false && /does not resolve from/.test(r.error),
    );
    check("and nothing is created", !existsSync(join(dir, ".claude")));
  }

  // ── VI. doctor's READ WRITES NOTHING ───────────────────────────────────────────────────
  {
    const dir = consumer("readonly");
    const r = linkSkills(dir, { write: false });
    check(
      "🔴 write:false reports every skill as missing and creates nothing — doctor only looks",
      r.ok && SKILLS.every((s) => status(r, s)?.status === "missing") && !existsSync(home(dir)),
    );
  }

  // ── VII. A PACKAGE THAT STOPPED DECLARING ITS SKILLS IS AN ERROR, NOT A DEFAULT ────────
  {
    const pkg = join(work, "undeclared");
    writePackage(pkg);
    writeFileSync(join(pkg, ".claude-plugin", "plugin.json"), "{}");
    const s = shippedSkills(pkg);
    check("no \"skills\" in plugin.json — an error that names the file", "error" in s && /declares no "skills"/.test(s.error));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`✓ ${n} assertions passed — link-skills: the skills are where Claude Code looks`);
