/**
 * `src/banal.ts` — finding banal, running it on rpp's XML, and installing the pinned copy.
 *
 * 🔴 NO BYTE OF banal IS FETCHED FROM HotCRP HERE. The installer downloads a stand-in Perl script
 * from a `file://` URL with the real `curl` and checks its sha256, so what runs is rpp's own
 * download, hash, install and probe logic. The real banal from the real pin is exercised by
 * `test/e2e/banal.mjs`, after `rpp toolchain` in CI.
 *
 * perl itself IS real: every run here that should reach banal starts `perl`, and the "no perl"
 * cases take it away by giving the child an empty PATH.
 */
import assert from "node:assert/strict";
// eslint-disable-next-line no-restricted-imports -- temporary: this test is split into core and adapter tests when banal moves behind ports (#76)
import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from "node:child_process";
import { createHash } from "node:crypto";
// eslint-disable-next-line no-restricted-imports -- temporary: this test is split into core and adapter tests when banal moves behind ports (#76)
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
// eslint-disable-next-line no-restricted-imports -- temporary: this test is split into core and adapter tests when banal moves behind ports (#76)
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import * as B from "./banal.ts";

let n = 0;
const check = (label: string, cond: unknown, detail = "") => {
  assert.ok(cond, detail ? `${label} — ${detail}` : label);
  n++;
};

const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-banal-h-")));
const emptyPath = join(work, "empty-bin");
mkdirSync(emptyPath);
/** `spawnSync` in the shape `Run` names — the seam this file tests through. */
const spawnUtf8: B.Run = (cmd, args, opts) =>
  spawnSync(cmd, [...args], {
    ...opts,
    encoding: "utf8",
  } as SpawnSyncOptionsWithStringEncoding);
const sha = (p: string) =>
  createHash("sha256").update(readFileSync(p)).digest("hex");
const script = (name: string, body: string) => {
  const p = join(work, name);
  writeFileSync(p, body);
  return p;
};
// A banal stand-in that measures the probe the way banal does: one page, a body size.
const GOOD =
  'print qq({"bodyfontsize": 10.3, "columns": 1, "pages": [{}]}\\n);\n';

try {
  // ── where ─────────────────────────────────────────────────────────────────────────────
  check(
    "banalHome: $RPP_BANAL_DIR, else $XDG_CACHE_HOME/rpp/banal, else ~/.cache/rpp/banal",
    B.banalHome({ RPP_BANAL_DIR: "/x" }, "/h") === "/x" &&
      B.banalHome({ XDG_CACHE_HOME: "/c" }, "/h") === "/c/rpp/banal" &&
      B.banalHome({}, "/h") === "/h/.cache/rpp/banal",
  );
  check(
    "installedBanal: one directory per HotCRP commit",
    B.installedBanal({}, "/h") ===
      `/h/.cache/rpp/banal/${B.BANAL_PIN.commit.slice(0, 12)}/banal`,
  );
  {
    const project = join(work, "project");
    const home = join(work, "home");
    const cached = B.installedBanal({}, home);
    mkdirSync(dirname(cached), { recursive: true });
    writeFileSync(cached, GOOD);
    check(
      "findBanal: rpp's own copy when nothing else is named",
      B.findBanal({}, project, home)?.from === "rpp toolchain",
    );
    mkdirSync(join(project, "vendor"), { recursive: true });
    writeFileSync(join(project, "vendor", "banal"), GOOD);
    // Guards: a project that vendors banal keeps using its own copy.
    check(
      "findBanal: a project's vendor/banal before rpp's copy",
      B.findBanal({}, project, home)?.from === "vendor/banal",
    );
    const own = script("own-banal", GOOD);
    check(
      "findBanal: $BANAL before both",
      B.findBanal({ BANAL: own }, project, home)?.path === own,
    );
    // Guards: an explicit choice that is wrong is an error, not a silent fall-back to another banal.
    check(
      "🔴 findBanal: $BANAL naming a missing file finds NOTHING, and the message names $BANAL",
      B.findBanal({ BANAL: join(work, "nope") }, project, home) === null &&
        B.missingBanal({ BANAL: join(work, "nope") }).includes("$BANAL names"),
    );
    check(
      "missingBanal: with nothing named, the message carries the fix",
      B.missingBanal({}, home).includes("`npx rpp toolchain` installs it"),
    );
  }

  // ── the -v stub ───────────────────────────────────────────────────────────────────────
  {
    const dir = join(work, "it's a dir");
    mkdirSync(dir);
    const stub = join(dir, "pdftohtml");
    writeFileSync(stub, B.PDFTOHTML_STUB, { mode: 0o755 });
    // banal runs `$PDFTOHTML -v 2>&1 |` through the shell, unquoted — so the quoted path must
    // survive a space and a quote.
    const v = spawnSync("/bin/sh", ["-c", `${B.shellQuote(stub)} -v 2>&1`], {
      encoding: "utf8",
    });
    // Guards: the dialect answer, through the same shell banal uses, from a path with a space and
    // a quote in it.
    check(
      "🔴 the stub answers `-v` with the dialect rpp writes, through the shell, from an awkward path",
      v.status === 0 && v.stdout.trim() === "pdftohtml version 24.02.0",
      JSON.stringify(v.stdout),
    );
    const convert = spawnSync(stub, ["-xml", "paper.pdf", "out"], {
      encoding: "utf8",
    });
    check(
      "the stub refuses to convert a PDF, loudly",
      convert.status === 1 && convert.stderr.includes("only answers -v"),
    );
  }

  // ── running it ────────────────────────────────────────────────────────────────────────
  const r = (over: Partial<SpawnSyncReturns<string>>) =>
    ({
      pid: 0,
      output: [],
      signal: null,
      status: 0,
      stdout: "",
      stderr: "",
      error: undefined,
      ...over,
    }) as SpawnSyncReturns<string>;
  const why = (o: B.BanalOutput): string => (o.ok ? "" : o.why);
  const json = (o: B.BanalOutput): Record<string, unknown> =>
    o.ok ? o.json : {};
  const enoent = Object.assign(new Error("spawnSync perl ENOENT"), {
    code: "ENOENT",
  });
  // Guards: perl missing is its own diagnosis, naming the fix — not "banal failed: ENOENT".
  check(
    "🔴 parseBanalOutput: perl missing is named, with how to install it",
    why(B.parseBanalOutput(r({ error: enoent, status: null }))) ===
      B.PERL_MISSING,
  );
  check(
    "parseBanalOutput: a nonzero exit names the exit and banal's first line",
    why(
      B.parseBanalOutput(r({ status: 1, stderr: "\nx.xml: Error: bad\nmore" })),
    ) === "banal failed (exit 1): x.xml: Error: bad",
  );
  check(
    "parseBanalOutput: output that is not JSON is not a measurement",
    /no JSON/.test(why(B.parseBanalOutput(r({ stdout: "Usage: banal" })))),
  );
  // Guards: banal's own failure object ({"error": true, "pages": []}) exits 0 — it must not read as
  // a measurement of zero pages.
  check(
    '🔴 parseBanalOutput: banal\'s `"error": true` with exit 0 is a failure, not zero pages',
    B.parseBanalOutput(r({ stdout: '{"error": true, "pages": []}' })).ok ===
      false,
  );
  check(
    "parseBanalOutput: a JSON object is the measurement",
    json(B.parseBanalOutput(r({ stdout: '{"columns": 2}' })))["columns"] === 2,
  );
  {
    const saw = join(work, "saw.txt");
    const recorder = script(
      "recorder.pl",
      `open(my $o, ">", "${saw}"); print $o $ARGV[-1]; close $o;\n${GOOD}`,
    );
    const before = readdirSync(tmpdir()).filter((d) =>
      d.startsWith("rpp-banal-"),
    ).length;
    const out = B.measureLayout(recorder, [B.PROBE_PAGE], {
      run: spawnUtf8,
      // eslint-disable-next-line no-restricted-globals -- temporary: this test is split into core and adapter tests when banal moves behind ports (#76)
      env: process.env,
    });
    const xml = readFileSync(saw, "utf8");
    check(
      "measureLayout: perl runs banal on an .xml file and its JSON comes back",
      out.ok && out.json["bodyfontsize"] === 10.3 && xml.endsWith("paper.xml"),
      JSON.stringify(out),
    );
    // Guards: cleanup — a paper's text must not pile up in the temp directory, one copy per build.
    check(
      "measureLayout: the XML and the stub are removed afterwards",
      !existsSync(xml) &&
        readdirSync(tmpdir()).filter((d) => d.startsWith("rpp-banal-"))
          .length <= before,
    );
    const noPerl = B.measureLayout(recorder, [B.PROBE_PAGE], {
      run: spawnUtf8,
      env: { PATH: emptyPath },
    });
    check(
      "🔴 measureLayout with no perl on PATH: the perl message",
      !noPerl.ok && noPerl.why === B.PERL_MISSING,
      JSON.stringify(noPerl),
    );
  }

  // ── installing it ─────────────────────────────────────────────────────────────────────
  const good = script("served-banal", GOOD);
  const SOURCE = { url: pathToFileURL(good).href, sha256: sha(good) };
  const calls: string[] = [];
  const run: B.Run = (cmd, args, opts) => {
    calls.push(cmd);
    return spawnUtf8(cmd, args, opts);
  };
  const io = (dir: string, over: Partial<B.BanalIO> = {}): B.BanalIO => ({
    run,
    // eslint-disable-next-line no-restricted-globals -- temporary: this test is split into core and adapter tests when banal moves behind ports (#76)
    env: { ...process.env, RPP_BANAL_DIR: dir },
    log: () => {},
    source: SOURCE,
    ...over,
  });
  {
    const dir = join(work, "i1");
    const first = B.ensureBanal(io(dir));
    const dest = B.installedBanal({ RPP_BANAL_DIR: dir });
    check(
      "ensureBanal: downloads, verifies and probes — fresh",
      first.ok &&
        first.fresh &&
        first.path === dest &&
        sha(dest) === SOURCE.sha256,
      JSON.stringify(first),
    );
    calls.length = 0;
    const second = B.ensureBanal(io(dir));
    // Guards: idempotence — an installed, matching banal is not downloaded again.
    check(
      "ensureBanal: a second run downloads nothing",
      second.ok && !second.fresh && !calls.includes("curl"),
      JSON.stringify(calls),
    );
    check(
      "checkBanal: installed and running is null",
      B.checkBanal(io(dir)) === null,
    );
    writeFileSync(dest, 'print "tampered";\n');
    // Guards: the pin is checked on every run — a changed file is replaced, not trusted.
    check(
      "🔴 checkBanal: a file with other bytes is not the pinned one",
      /not the pinned one/.test(B.checkBanal(io(dir)) ?? ""),
    );
    const repaired = B.ensureBanal(io(dir));
    check(
      "ensureBanal: other bytes on disk are replaced by the pinned ones",
      repaired.ok && repaired.fresh && sha(dest) === SOURCE.sha256,
    );
  }
  {
    const dir = join(work, "i2");
    const bad = B.ensureBanal(
      io(dir, { source: { ...SOURCE, sha256: "0".repeat(64) } }),
    );
    const dest = B.installedBanal({ RPP_BANAL_DIR: dir });
    // Guards: the sha256 pin — a changed upstream file (or a proxy's error page) is never installed.
    check(
      "🔴 ensureBanal: a download with another sha256 is refused, and nothing is left on disk",
      !bad.ok &&
        (bad.lines[0] ?? "").includes("does not have the pinned sha256") &&
        bad.lines.some((l) => l.includes(SOURCE.sha256)) &&
        !existsSync(dest) &&
        !existsSync(`${dest}.part`),
      JSON.stringify(bad),
    );
  }
  {
    const dir = join(work, "i3");
    const gone = B.ensureBanal(
      io(dir, {
        source: {
          url: pathToFileURL(join(work, "nope")).href,
          sha256: SOURCE.sha256,
        },
      }),
    );
    check(
      "ensureBanal: a failed download names the URL",
      !gone.ok &&
        (gone.lines[0] ?? "").startsWith(
          "could not download banal from file://",
        ),
      JSON.stringify(gone),
    );
  }
  {
    const dir = join(work, "i4");
    const junk = script("junk-banal", 'print "not json";\n');
    const r4 = B.ensureBanal(
      io(dir, { source: { url: pathToFileURL(junk).href, sha256: sha(junk) } }),
    );
    // Guards: acceptance by a run, not by the download — a file with the right hash that does not
    // measure a page fails the install.
    check(
      "🔴 ensureBanal: a banal that downloads fine but measures nothing fails, saying so",
      !r4.ok &&
        (r4.lines[0] ?? "").includes("does not run") &&
        (r4.lines[0] ?? "").includes("no JSON"),
      JSON.stringify(r4),
    );
  }
  {
    const dir = join(work, "i5");
    calls.length = 0;
    const r5 = B.ensureBanal(
      io(dir, { env: { PATH: emptyPath, RPP_BANAL_DIR: dir } }),
    );
    // Guards: perl first — no download when the program that would run it is missing.
    check(
      "🔴 ensureBanal without perl: the perl message, and nothing downloaded",
      !r5.ok && r5.lines[0] === B.PERL_MISSING && !calls.includes("curl"),
      JSON.stringify(r5),
    );
    check(
      "checkBanal without perl: the perl message",
      B.checkBanal(
        io(dir, { env: { PATH: emptyPath, RPP_BANAL_DIR: dir } }),
      ) === B.PERL_MISSING,
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(
  `✓ ${String(n)} assertions passed — banal: found in order, run on XML with the -v stub, installed by sha256 and a probe`,
);
