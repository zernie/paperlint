/**
 * `src/banal.ts` — the app layer, on in-memory adapters: which `Command` it builds, what it stages,
 * what it downloads and writes, and what it concludes. No perl, no disk, no network: the adapters
 * record, and each assertion reads the record. Real perl and the real banal are `test/e2e/banal.mjs`;
 * the adapters' own behaviour is `src/adapters/node/*.test.ts`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exitedWith,
  fixedDownload,
  memoryFiles,
  memoryIo,
  memoryWorkspace,
  scriptedProcess,
} from "./adapters/memory/index.ts";
import { checkBanal, ensureBanal, measureGeometry } from "./banal.ts";
import { sha256Hex } from "./core/banal/install.ts";
import { installedBanal } from "./core/banal/locate.ts";
import { parseBanalSettings } from "./core/banal/settings.ts";
import type { AbsolutePath, Command, ProcessExit } from "./core/ports.ts";

const s = parseBanalSettings(
  { BANAL: "/own/banal", PATH: "/bin" },
  { home: "/h", tmp: "/t", cwd: "/w" },
);
const noExplicit = parseBanalSettings(
  { PATH: "/bin" },
  { home: "/h", tmp: "/t", cwd: "/w" },
);
const project = "/p" as AbsolutePath;
/** What banal prints for the one-page probe. */
const MEASURED = '{"bodyfontsize": 10.3, "columns": 1, "pages": [{}]}';
const banalAnswers = (e: ProcessExit) =>
  scriptedProcess((c: Command) => (c.args[0] === "-e" ? exitedWith("") : e));

test("measureGeometry: perl runs the found banal on the staged XML, and the geometry comes back", () => {
  const run = banalAnswers(exitedWith(MEASURED));
  const workspace = memoryWorkspace();
  const io = memoryIo({
    run,
    workspace,
    files: memoryFiles({ "/own/banal": "" }),
  });
  const g = measureGeometry(io, s, project, []);
  assert.equal(g.source, "banal");
  assert.equal(g.source === "banal" && g.geometry.body_pt, 10.3);
  const [c] = run.calls;
  assert.equal(c?.file, "perl");
  assert.equal(c?.args.at(-1), "/scratch/paper.xml");
  // Guards: both files staged, once, and the scratch scope ended normally (cleanup ran).
  assert.equal(workspace.staged.length, 1);
  assert.deepEqual(workspace.ended, ["returned"]);
});

test("measureGeometry: no banal anywhere is `banal-missing`, and nothing runs", () => {
  const run = banalAnswers(exitedWith(MEASURED));
  const g = measureGeometry(memoryIo({ run }), noExplicit, project, []);
  assert.equal(g.source === "none" && g.why.kind, "banal-missing");
  assert.equal(run.calls.length, 0);
});

test("🔴 measureGeometry: perl not found is `perl-missing`, naming the banal that was tried", () => {
  const io = memoryIo({
    run: scriptedProcess(() => ({ kind: "not-found", file: "perl" })),
    files: memoryFiles({ "/own/banal": "" }),
  });
  const g = measureGeometry(io, s, project, []);
  assert.equal(g.source === "none" && g.why.kind, "perl-missing");
  assert.equal(g.source === "none" && g.tried?.path, "/own/banal");
});

test("measureGeometry: banal exiting 3 is `process-failed`", () => {
  const io = memoryIo({
    run: banalAnswers({
      kind: "exited",
      status: 3,
      stdout: "",
      stderr: "boom",
    }),
    files: memoryFiles({ "/own/banal": "" }),
  });
  const g = measureGeometry(io, s, project, []);
  assert.equal(g.source === "none" && g.why.kind, "process-failed");
});

// ── installing ──────────────────────────────────────────────────────────────────────────
const BODY = "print qq(...);\n";
const source = {
  url: "https://example.test/banal",
  sha256: sha256Hex(new TextEncoder().encode(BODY)),
};
const dest = installedBanal(noExplicit);

test("ensureBanal: downloads, verifies, writes and probes — fresh; a second run downloads nothing", () => {
  const files = memoryFiles();
  const download = fixedDownload(BODY);
  const io = memoryIo({
    run: banalAnswers(exitedWith(MEASURED)),
    files,
    download,
  });
  const first = ensureBanal(io, noExplicit, { source });
  assert.deepEqual(first, { ok: true, value: { path: dest, fresh: true } });
  assert.ok(files.map.has(dest));
  // Guards: idempotence — an installed, matching banal is not downloaded again.
  const second = ensureBanal(io, noExplicit, { source });
  assert.equal(second.ok && second.value.fresh, false);
  assert.equal(download.urls.length, 1);
});

test("🔴 ensureBanal: bytes with another sha256 are refused, and nothing is written", () => {
  const files = memoryFiles();
  const io = memoryIo({
    run: banalAnswers(exitedWith(MEASURED)),
    files,
    download: fixedDownload("something else"),
  });
  const r = ensureBanal(io, noExplicit, { source });
  // Guards: the sha256 pin — a changed upstream file (or a proxy's error page) is never installed.
  assert.equal(!r.ok && r.error.kind, "sha-mismatch");
  assert.equal(files.map.size, 0);
});

test("ensureBanal: a failed download names the URL", () => {
  const io = memoryIo({
    run: banalAnswers(exitedWith(MEASURED)),
    download: fixedDownload({ detail: "curl exited 22" }),
  });
  const r = ensureBanal(io, noExplicit, { source });
  assert.deepEqual(!r.ok && r.error, {
    kind: "download-failed",
    url: source.url,
    detail: "curl exited 22",
  });
});

test("🔴 ensureBanal: a banal that downloads fine but measures nothing fails, saying why", () => {
  const io = memoryIo({
    run: banalAnswers(exitedWith("not json")),
    download: fixedDownload(BODY),
  });
  const r = ensureBanal(io, noExplicit, { source });
  // Guards: acceptance by a run, not by the download.
  assert.equal(!r.ok && r.error.kind, "does-not-run");
  assert.equal(
    !r.ok && r.error.kind === "does-not-run" && r.error.why.kind,
    "no-json",
  );
});

test("🔴 ensureBanal and checkBanal without perl: `perl-missing`, and nothing downloaded", () => {
  const download = fixedDownload(BODY);
  const io = memoryIo({
    run: scriptedProcess(() => ({ kind: "not-found", file: "perl" })),
    download,
  });
  const r = ensureBanal(io, noExplicit, { source });
  // Guards: perl first — no download when the program that would run it is missing.
  assert.equal(!r.ok && r.error.kind, "perl-missing");
  assert.equal(download.urls.length, 0);
  const c = checkBanal(io, noExplicit, source);
  assert.equal(!c.ok && c.error.kind, "perl-missing");
});

test("checkBanal: absent, other bytes, pinned-and-running", () => {
  const run = banalAnswers(exitedWith(MEASURED));
  const absent = checkBanal(memoryIo({ run }), noExplicit, source);
  assert.equal(!absent.ok && absent.error.kind, "banal-missing");
  // Guards: the pin is checked on every run — a changed file is reported, not trusted.
  const tampered = checkBanal(
    memoryIo({ run, files: memoryFiles({ [dest]: "tampered" }) }),
    noExplicit,
    source,
  );
  assert.equal(!tampered.ok && tampered.error.kind, "not-pinned");
  const good = checkBanal(
    memoryIo({ run, files: memoryFiles({ [dest]: BODY }) }),
    noExplicit,
    source,
  );
  assert.equal(good.ok, true);
});
