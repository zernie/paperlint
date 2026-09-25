/**
 * `adapters/banal/index.ts` — banal as the two ports the app sees. What `run.test.ts` checks in
 * banal's own terms is checked here as the domain receives it: a `Geometry` whose provenance names
 * banal and the rule that found it, a reason that is one line of text, a `Ready` that says what was
 * verified. In-memory ports throughout; the real banal is `test/e2e/banal.mjs`.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { whyNoGeometry } from "../../domain/geometry.ts";
import type { AbsolutePath } from "../../domain/paths.ts";
import type { ProcessExit } from "../../ports/process.ts";
import { sha256Hex } from "../../domain/sha256.ts";
import {
  exitedWith,
  fixedDownload,
  memoryFiles,
  memoryPorts,
  scriptedProcess,
} from "../memory/index.ts";
import type { Ready } from "../../ports/tool-installer.ts";
import { banalInstaller, banalMeasurer, parseBanalSettings } from "./index.ts";

const dirs = { home: "/h", tmp: "/t", cwd: "/r" };
const project = "/r" as AbsolutePath;
const MEASURED =
  '{"papersize":[792,612],"columns":2,"bodyfontsize":9,"pages":[{},{"type":"bib","reffontsize":7}]}';

/** banal's measurer over in-memory ports: `/own/banal` on "disk", banal answering `exit`. */
function measurer(env: Record<string, string>, exit?: ProcessExit) {
  const run = scriptedProcess(() => exit ?? exitedWith(MEASURED));
  const io = memoryPorts({ run, files: memoryFiles({ "/own/banal": "" }) });
  return { run, m: banalMeasurer(io, parseBanalSettings(env, dirs), project) };
}

test("no banal anywhere: unmeasured, and the reason says banal was not found", () => {
  const g = measurer({}).m.measure([]);
  assert.match(
    g.kind === "unmeasured" ? whyNoGeometry(g) : "",
    /^banal not found: /,
  );
});

test("with $BANAL: banal gets the .xml and a quoted $PDFTOHTML, and the geometry is the domain's", () => {
  const { m, run } = measurer({ BANAL: "/own/banal" });
  const g = m.measure([]);
  assert.equal(g.kind, "measured");
  assert.deepEqual(g.kind === "measured" && g.by, {
    tool: "banal",
    path: "/own/banal",
    how: "$BANAL",
  });
  assert.deepEqual(
    g.kind === "measured" && [g.geometry.columns, g.geometry.bodyPages],
    [2, 1],
  );
  const c = run.calls[0];
  // Guards: the poppler-free path — banal is handed rpp's XML, never the PDF.
  assert.match(c?.args.at(-1) ?? "", /\.xml$/);
  assert.match(c?.env["PDFTOHTML"] ?? "", /^'.*pdftohtml'$/);
});

test("a failing banal: unmeasured, and the reason names exit, message and source", () => {
  const { m } = measurer(
    { BANAL: "/own/banal" },
    { kind: "exited", status: 3, stdout: "", stderr: "boom\n" },
  );
  const g = m.measure([]);
  // Guards: a banal that runs and fails is not reported as "not found".
  assert.match(
    g.kind === "unmeasured" ? whyNoGeometry(g) : "",
    /^banal failed \(exit 3\): boom \(banal from \$BANAL: \/own\/banal\)$/,
  );
});

// ── the installer ───────────────────────────────────────────────────────────────────────
const BODY = "print qq(...);\n";
/** What banal prints for the one-page probe — what acceptance requires. */
const PROBE = '{"bodyfontsize": 10.3, "columns": 1, "pages": [{}]}';
const source = {
  url: "https://example.test/banal",
  sha256: sha256Hex(new TextEncoder().encode(BODY)),
};

test("installer: ensure reports the download, and Ready says where and what was verified", () => {
  const io = memoryPorts({
    run: scriptedProcess((c) =>
      c.args[0] === "-e" ? exitedWith("") : exitedWith(PROBE),
    ),
    download: fixedDownload(BODY),
  });
  const i = banalInstaller(io, parseBanalSettings({}, dirs), source);
  assert.match(i.label, /^banal \d/);
  const told: string[] = [];
  const r = i.ensure((l) => told.push(l));
  assert.ok(r.ok);
  assert.equal(r.value.fresh, true);
  assert.match(r.value.where, /\/banal$/);
  assert.equal(
    r.value.verified,
    "sha256 verified, and it measured a probe page",
  );
  assert.equal(told.length, 1);
  assert.equal(i.check().ok, true);
});

test("installer: a failure is lines of text, the first saying what happened", () => {
  const io = memoryPorts({
    run: scriptedProcess(() => ({ kind: "not-found", file: "perl" })),
  });
  const r = banalInstaller(io, parseBanalSettings({}, dirs), source).check();
  assert.ok(!r.ok);
  assert.match(r.error[0], /perl/);
});

test("a Ready cannot be written by hand — only an installer mints one", () => {
  // @ts-expect-error — the brand: a literal is not a Ready (tsc -p tsconfig.test.json checks this line).
  const forged: Ready = { where: "/x", fresh: true, verified: "trust me" };
  assert.equal(forged.where, "/x");
});
