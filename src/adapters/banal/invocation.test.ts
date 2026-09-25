import assert from "node:assert/strict";
import { test } from "vitest";
import type { AbsolutePath } from "../../domain/ports.ts";
import {
  banalCommand,
  shQuote,
  stageBanalInput,
  type StagedInput,
} from "./invocation.ts";
import type { LocatedBanal } from "./locate.ts";
import { XML_DIALECT } from "./xml.ts";

test("the staging holds BOTH files: the XML and the -v stub answering the dialect rpp writes", () => {
  const [xml, stub] = stageBanalInput([]).files;
  assert.equal(xml.name, "paper.xml");
  assert.match(xml.content, /^<\?xml/);
  assert.equal(stub.mode, "exec");
  // Guards: the version the stub answers — below 0.85 banal moves every font size.
  assert.ok(stub.content.includes(`pdftohtml version ${XML_DIALECT.version}`));
});

test("banalCommand: perl runs banal on the staged .xml, with $PDFTOHTML quoted", () => {
  const banal = {
    path: "/b/banal" as AbsolutePath,
    provenance: { kind: "cache" },
  } as LocatedBanal;
  const staged = { xml: "/s/paper.xml", stub: "/s d/pdftohtml" } as StagedInput;
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
