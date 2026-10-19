/**
 * The one reader of what lies inside a study's folder (`src/study-folder.ts`), over a disk held in
 * memory whose listing marks chosen paths as symbolic links: a file is read, a missing path is absent,
 * and a path that passes through a link — at the file or at any directory above it — is `linked`,
 * naming the link, with nothing read.
 */
import { expect, it } from "vitest";
import { memoryFiles, memoryListEntries } from "./adapters/memory/index.ts";
import { folderRefusalText, studyFolder } from "./study-folder.ts";

const PAPER = "/work/papers/example";
const FOLDER = `${PAPER}/repro/P1-S01-outcome`;
const TREE = {
  [`${FOLDER}/plan.json`]: "{}",
  [`${FOLDER}/sub/plan.json`]: "{ }",
  [`${FOLDER}/sub/deeper/out.tsv`]: "x\n",
  [`${FOLDER}/other/note.md`]: "n\n",
  [`${PAPER}/repro/P1-S01-linked/plan.json`]: "{}",
};

/** The reader over `TREE`, `links` being absolute paths the listing reports as links; plus every path the disk was asked for. */
const reader = (links: readonly string[]) => {
  const files = memoryFiles(TREE);
  const asked: string[] = [];
  return {
    asked,
    sf: studyFolder(PAPER, {
      files: {
        ...files,
        readBytes: (p) => {
          asked.push(p);
          return files.readBytes(p);
        },
        isFile: (p) => {
          asked.push(p);
          return files.isFile(p);
        },
      },
      entries: (dir) =>
        memoryListEntries(files)(dir).map((e) =>
          links.includes(`${dir}/${e.name}`)
            ? { ...e, kind: "symlink" as const }
            : e,
        ),
    }),
  };
};

it("reads a file inside the folder; a path that is nothing, a directory, or under a file is absent", () => {
  const { sf } = reader([]);
  // Guards: the plain cases, so that `linked` below is the link's doing and not a broken reader.
  expect([
    sf.read("P1-S01-outcome", "plan.json"),
    sf.read("P1-S01-outcome", "./sub/plan.json"),
    sf.read("P1-S01-outcome", "nope.json"),
    sf.read("P1-S01-outcome", "sub"),
    sf.read("P1-S01-outcome", "plan.json/x"),
    sf.read("P1-S01-outcome", "sub/missing/plan.json"),
  ]).toEqual([
    { kind: "text", text: "{}" },
    { kind: "text", text: "{ }" },
    { kind: "absent" },
    { kind: "absent" },
    { kind: "absent" },
    { kind: "absent" },
  ]);
});

it("a link at the file, or at any directory above it, is `linked` and names the link; nothing is read", () => {
  const { sf, asked } = reader([
    `${FOLDER}/plan.json`,
    `${FOLDER}/sub`,
    `${FOLDER}/other/note.md`,
  ]);
  // Guards: the file behind a link is never asked for, wherever on the path the link stands; the
  // link is named relative to the folder, as far down as the walk got.
  expect([
    sf.read("P1-S01-outcome", "plan.json"),
    sf.read("P1-S01-outcome", "sub/plan.json"),
    sf.read("P1-S01-outcome", "sub/deeper/out.tsv"),
    sf.read("P1-S01-outcome", "other/note.md"),
  ]).toEqual([
    { kind: "linked", link: "plan.json" },
    { kind: "linked", link: "sub" },
    { kind: "linked", link: "sub" },
    { kind: "linked", link: "other/note.md" },
  ]);
  expect(asked).toEqual([]);
});

it("`locate` says what is there without reading it", () => {
  const { sf, asked } = reader([`${FOLDER}/sub`]);
  // Guards: the answer for a result file's existence needs no read of its bytes.
  expect([
    sf.locate("P1-S01-outcome", "plan.json"),
    sf.locate("P1-S01-outcome", "sub/deeper/out.tsv"),
    sf.locate("P1-S01-outcome", "nope"),
  ]).toEqual([
    { kind: "file" },
    { kind: "linked", link: "sub" },
    { kind: "absent" },
  ]);
  expect(asked).toEqual([]);
});

it("reads nothing outside the folder: a NUL, a path up and out, a folder name that is not one folder, a folder that is a link", () => {
  const { sf, asked } = reader([`${PAPER}/repro/P1-S01-outcome`]);
  const open = reader([]).sf;
  // Guards: the reader itself holds the containment the callers rely on — the folder that is a link
  // reads as absent (not `linked`), as the registry rule's page says.
  expect([
    open.read("P1-S01-outcome", "a\0b"),
    open.read("P1-S01-outcome", "../x/plan.json"),
    open.read("../x", "plan.json"),
    open.read("a/b", "plan.json"),
    sf.read("P1-S01-outcome", "plan.json"),
  ]).toEqual(Array(5).fill({ kind: "absent" }));
  expect(asked).toEqual([]);
});

it("a file that vanishes between the walk and the read is absent", () => {
  const files = memoryFiles(TREE);
  const sf = studyFolder(PAPER, {
    files: { ...files, isFile: () => false },
    entries: memoryListEntries(files),
  });
  // Guards: the reader never throws on a race; it says there is nothing.
  expect(sf.read("P1-S01-outcome", "plan.json")).toEqual({ kind: "absent" });
});

it("a link is named as far down as the walk got, even when its name repeats above it", () => {
  const files = memoryFiles({ [`${FOLDER}/a/a/x.txt`]: "x\n" });
  const sf = studyFolder(PAPER, {
    files,
    entries: (dir) =>
      memoryListEntries(files)(dir).map((e) =>
        `${dir}/${e.name}` === `${FOLDER}/a/a`
          ? { ...e, kind: "symlink" as const }
          : e,
      ),
  });
  // Guards: the second `a` is the link, not the first.
  expect(sf.read("P1-S01-outcome", "a/a/x.txt")).toEqual({
    kind: "linked",
    link: "a/a",
  });
});

it("a row's folder may be entered unless it is no one folder inside repro/ or is a link", () => {
  const { sf } = reader([`${PAPER}/repro/P1-S01-linked`]);
  // Guards: the one place the folder check lives; each refusal is its own reason.
  expect([
    sf.refusal("P1-S01-outcome"),
    sf.refusal("../x"),
    sf.refusal("a/b"),
    sf.refusal("P1-S01-linked"),
  ]).toEqual([null, "not-a-folder", "not-a-folder", "symbolic-link"]);
  expect([
    folderRefusalText("not-a-folder", "p"),
    folderRefusalText("symbolic-link", "p"),
  ]).toEqual([
    {
      reason: "is not one folder inside p/repro/",
      fix: "Give the row its own folder's name",
    },
    {
      reason: "is a symbolic link",
      fix: "Give the row a real folder inside p/repro/",
    },
  ]);
});

it("a path in the paper is a file, a directory, nothing, or a link on the way — the first one, from the paper's root", () => {
  const { sf, asked } = reader([`${FOLDER}/sub`, `${FOLDER}/plan.json`]);
  const at = (p: string) => sf.entryAt(p);
  // Guards: the decision file is judged by every component of its path, not by its last one.
  expect([
    at("repro/P1-S01-outcome/other/note.md"),
    at("repro/P1-S01-outcome/other"),
    at("repro/P1-S01-outcome/nope.md"),
    at("repro/P1-S01-outcome/sub/plan.json"),
    at("repro/P1-S01-outcome/plan.json"),
    at("../outside.md"),
    at("a\0b"),
  ]).toEqual([
    { kind: "file" },
    { kind: "dir" },
    { kind: "absent" },
    { kind: "linked", link: "repro/P1-S01-outcome/sub" },
    { kind: "linked", link: "repro/P1-S01-outcome/plan.json" },
    { kind: "absent" },
    { kind: "absent" },
  ]);
  expect(asked).toEqual([]);
});
