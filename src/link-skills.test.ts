/**
 * link-skills.ts edges the harness does not reach: a resolver error without a code, a package that
 * resolved outside every `node_modules` up the tree, a skills directory that is missing or holds a
 * dangling link, a skills home that cannot be made, an entry that is a plain file, and — through
 * the injected fs — an entry that cannot be resolved and a link that cannot be created.
 */
import assert from "node:assert/strict";
import {
  lstatSync,
  mkdirSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { useTempDir, writeTree } from "../test/support.ts";
import { linkSkills, locatePackage, type LinkFs } from "./link-skills.ts";

const root = useTempDir("paperlint-link-skills-");
const realFs: LinkFs = { lstatSync, realpathSync, readlinkSync, symlinkSync };

/** A package directory shipping skills `names` under `skills/`. */
function pkg(name: string, names: string[]): string {
  const dir = join(root, name, "pkg");
  mkdirSync(join(dir, "skills"), { recursive: true });
  writeTree(
    dir,
    Object.fromEntries(names.map((n) => [`skills/${n}/SKILL.md`, "# s\n"])),
  );
  return dir;
}
const at = (dir: string) => () => ({ dir, spelled: dir });

test("locatePackage: a resolver error without a code; a package found outside every node_modules", () => {
  assert.deepEqual(
    locatePackage(root, {
      resolveManifest: () => {
        throw new Error("odd\nsecond line");
      },
    }),
    { error: "error: odd" },
  );
  const elsewhere = pkg("elsewhere", []);
  assert.deepEqual(
    locatePackage(root, {
      resolveManifest: () => join(elsewhere, "package.json"),
    }),
    { dir: elsewhere, spelled: elsewhere },
  );
});

test("a package without a skills directory, or one holding a dangling link, is not linked", () => {
  const bare = join(root, "bare");
  mkdirSync(bare, { recursive: true });
  const missing = linkSkills(join(root, "p1"), { locate: at(bare) });
  assert.deepEqual(missing, {
    ok: false,
    error: `the package's skills directory is missing: ${join(bare, "skills")}`,
  });
  const dangling = pkg("dangling", ["a"]);
  symlinkSync(join(root, "gone"), join(dangling, "skills", "b"));
  const r = linkSkills(join(root, "p2"), { locate: at(dangling) });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /^1 skill link\(s\) in .* lead nowhere:/);
});

test("a skills home that cannot be made is named", () => {
  const project = writeTree(join(root, "p3"), {
    ".claude": "a file, not a directory",
  });
  const r = linkSkills(project, { locate: at(pkg("home", ["a"])) });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /^cannot create .*\.claude\/skills: /);
});

test("entries that are someone else's: a plain file, one that cannot be resolved, a link that cannot be made", () => {
  const shipped = pkg("entries", ["file", "unresolved", "refused"]);
  const project = writeTree(join(root, "p4"), { ".claude/skills/file": "x" });
  mkdirSync(join(project, ".claude", "skills", "unresolved"));
  const fs: LinkFs = {
    ...realFs,
    realpathSync: (p) => {
      if (p.endsWith("unresolved")) throw new Error("ELOOP");
      return realpathSync(p);
    },
    symlinkSync: () => {
      throw new Error("EEXIST: raced");
    },
  };
  const r = linkSkills(project, { locate: at(shipped), fs });
  assert.deepEqual(r.ok ? r.links : [], [
    { name: "file", status: "foreign", reason: "a file" },
    {
      name: "refused",
      status: "foreign",
      reason: "could not create the link: EEXIST: raced",
    },
    {
      name: "unresolved",
      status: "foreign",
      reason: "an entry that cannot be resolved",
    },
  ]);
});
