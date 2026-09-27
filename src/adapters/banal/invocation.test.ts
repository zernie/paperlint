import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll as after, test } from "vitest";
import { nodeAdapters } from "../node/index.ts";
import { absolutePath } from "../../domain/paths.ts";
import type { Scratch } from "../../ports/workspace.ts";
import {
  banalCommand,
  parseShQuoted,
  shQuote,
  stage,
  stageBanalInput,
} from "./invocation.ts";
import { XML_DIALECT } from "./xml.ts";

test("the staging holds BOTH files: the XML and the -v stub answering the dialect paperlint writes", () => {
  const [xml, stub] = stageBanalInput([]).files;
  assert.equal(xml.name, "paper.xml");
  assert.match(xml.content, /^<\?xml/);
  assert.equal(stub.mode, "exec");
  // Guards: the version the stub answers — below 0.85 banal moves every font size.
  assert.ok(stub.content.includes(`pdftohtml version ${XML_DIALECT.version}`));
});

test("banalCommand: perl runs banal on the staged .xml, with $PDFTOHTML quoted", () => {
  // A scratch that places the two files in different directories, one with a space.
  const scratch: Scratch = {
    dir: absolutePath("/s"),
    write: (name) =>
      absolutePath(name === "paper.xml" ? "/s/paper.xml" : "/s d/pdftohtml"),
  };
  const staged = stage(scratch, stageBanalInput([]));
  const banal = { path: absolutePath("/b/banal") };
  const c = banalCommand(banal, staged, { PATH: "/bin" });
  assert.deepEqual(
    [c.file, ...c.args],
    ["perl", "/b/banal", "-no-time", "-json", "/s/paper.xml"],
  );
  // Guards: banal interpolates $PDFTOHTML into /bin/sh unquoted; a space in $TMPDIR must survive.
  assert.deepEqual(c.env, { PATH: "/bin", PDFTOHTML: "'/s d/pdftohtml'" });
});

test("shQuote survives a single quote", () => {
  assert.equal(shQuote("it's"), `'it'"'"'s'`);
});

test("parseShQuoted refuses a word the shell would split or expand", () => {
  assert.equal(parseShQuoted(`'a b'`), `'a b'`);
  assert.throws(() => parseShQuoted("a b"), /not one single-quoted shell word/);
  assert.throws(
    () => parseShQuoted(`'a'b'`),
    /not one single-quoted shell word/,
  );
});

const root = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-stage-test-")));
after(() => {
  rmSync(root, { recursive: true, force: true });
});

test("🔴 stage: on a real scratch directory the stub answers `-v` through the shell, from a path with a space and a quote", () => {
  const awkward = join(root, "it's a dir");
  mkdirSync(awkward);
  const { workspace } = nodeAdapters({ tmpDir: awkward });
  workspace.within("paperlint-banal-", (s) => {
    const staged = stage(s, stageBanalInput([]));
    assert.ok(existsSync(staged.xml));
    // Guards: banal runs `$PDFTOHTML -v 2>&1 |` through /bin/sh, unquoted.
    const v = spawnSync("/bin/sh", ["-c", `${shQuote(staged.stub)} -v 2>&1`], {
      encoding: "utf8",
    });
    assert.equal(v.stdout.trim(), "pdftohtml version 24.02.0");
    const convert = spawnSync(staged.stub, ["-xml", "paper.pdf", "out"], {
      encoding: "utf8",
    });
    assert.equal(convert.status, 1);
    assert.match(convert.stderr, /only answers -v/);
  });
});
