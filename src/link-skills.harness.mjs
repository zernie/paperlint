/**
 * Both halves for `link-skills.ts` — the symlinks that make the shipped skills visible to Claude
 * Code at `.claude/skills/<name>`.
 *
 * 🔴 WHY THE PACKAGE IS BUILT ON DISK HERE, NOT FAKED. What is under test is a property of a tree:
 * whether Node resolves the package from the project, which spelling of it the link uses, and
 * whether `SKILL.md` is reachable THROUGH the link. A stubbed locator would test the stub. So each
 * case lays out a real `node_modules` — the npm shape and the pnpm shape, where
 * `node_modules/<package>` is itself a symlink into a version-stamped store
 * directory — and asks the filesystem.
 *
 * The fixture package keeps its skills where the real one does, under `SHIPPED_SKILLS_DIR` from
 * consumer.mjs — the same constant the linker and the install e2e read.
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
const { linkSkills, locatePackage, shippedSkills } = await import(
  join(HERE, "link-skills.ts")
);
const {
  SHIPPED_SKILLS_DIR: SHIPS,
  PACKAGE_NAME: PKG,
  LEGACY_PACKAGE_NAME,
} = await import(
  join(HERE, "..", "skills", "paper-pipeline", "scripts", "consumer.mjs")
);

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, label);
};

const SKILLS = ["alpha", "beta", "gamma"];
const work = realpathSync(
  mkdtempSync(join(tmpdir(), "paperlint-link-skills-")),
);

/** A package as a manager would unpack it: manifest, skills, one non-skill. */
function writePackage(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: PKG, version: "1.0.0" }),
  );
  for (const s of SKILLS) {
    mkdirSync(join(dir, SHIPS, s, "scripts"), { recursive: true });
    writeFileSync(join(dir, SHIPS, s, "SKILL.md"), `---\nname: ${s}\n---\n`);
    writeFileSync(join(dir, SHIPS, s, "scripts", "run.mjs"), "");
  }
  // A directory without SKILL.md and a loose file: neither is a skill.
  mkdirSync(join(dir, SHIPS, "shared"), { recursive: true });
  writeFileSync(join(dir, SHIPS, "README.md"), "# skills\n");
}

/** A consumer project with the package installed the npm way or the pnpm way. */
function consumer(name, manager = "npm") {
  const dir = join(work, name);
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "c", version: "1.0.0" }),
  );
  if (manager === "npm") writePackage(join(dir, "node_modules", PKG));
  else if (manager === "pnpm") {
    const store = join(
      "node_modules",
      ".pnpm",
      `${PKG}@1.0.0`,
      "node_modules",
      PKG,
    );
    writePackage(join(dir, store));
    symlinkSync(
      join(".pnpm", `${PKG}@1.0.0`, "node_modules", PKG),
      join(dir, "node_modules", PKG),
      "dir",
    );
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
      "🔴 it links every skill the package ships",
      r.ok === true && SKILLS.every((s) => status(r, s)?.status === "created"),
    );
    check(
      "and nothing that is not a skill — a directory without SKILL.md is not one",
      r.links.length === SKILLS.length &&
        !existsSync(join(home(dir), "shared")),
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
      !isAbsolute(target) &&
        target === join("..", "..", "node_modules", PKG, SHIPS, "alpha"),
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
      !("error" in located) &&
        located.dir.includes(join(".pnpm", `${PKG}@1.0.0`)),
    );
    const r = linkSkills(dir);
    check(
      "🔴 under pnpm the link goes through node_modules/<package>, not the .pnpm store — that one dangles on the next upgrade",
      r.ok &&
        readlinkSync(join(home(dir), "alpha")) ===
          join("..", "..", "node_modules", PKG, SHIPS, "alpha"),
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
      r.ok &&
        SKILLS.every((s) => status(r, s)?.status === "missing") &&
        !existsSync(home(dir)),
    );
  }

  // ── VI-bis. LINKS LEFT BY AN INSTALL UNDER THE OLD NAME ARE REPLACED, NOT SKIPPED ─────
  // After `npm rm research-paper-pipeline && npm i -D paperlint` every old link dangles. They are
  // ours, spelled the way an older `init` wrote them, so the next `init` replaces them.
  {
    const dir = consumer("renamed");
    mkdirSync(home(dir), { recursive: true });
    const old = join(
      "..",
      "..",
      "node_modules",
      LEGACY_PACKAGE_NAME,
      SHIPS,
      "alpha",
    );
    symlinkSync(old, join(home(dir), "alpha"), "dir");
    const seen = linkSkills(dir, { write: false });
    check(
      "doctor's read names a link into the old package name, with the command that fixes it",
      status(seen, "alpha")?.status === "foreign" &&
        /old name — `npx paperlint init` replaces it/.test(
          status(seen, "alpha")?.reason ?? "",
        ),
    );
    const r = linkSkills(dir);
    check(
      "🔴 init REPLACES it: status `replaced`, and SKILL.md is reachable through the new link",
      status(r, "alpha")?.status === "replaced" &&
        existsSync(join(home(dir), "alpha", "SKILL.md")) &&
        readlinkSync(join(home(dir), "alpha")).includes(
          join("node_modules", PKG),
        ),
    );
  }

  // ── VII. A PACKAGE WITHOUT ITS SKILLS DIRECTORY IS AN ERROR, NOT ZERO SKILLS ─────────
  {
    const pkg = join(work, "no-skills");
    writePackage(pkg);
    rmSync(join(pkg, SHIPS), { recursive: true, force: true });
    const s = shippedSkills(pkg);
    check(
      "no skills directory — an error that names it, not an empty list",
      "error" in s && s.error.includes(join(pkg, SHIPS)),
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(
  `✓ ${n} assertions passed — link-skills: the skills are where Claude Code looks`,
);
