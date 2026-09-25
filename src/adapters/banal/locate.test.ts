import assert from "node:assert/strict";
import { test } from "vitest";
import type { AbsolutePath } from "../../domain/paths.ts";
import { err } from "../../domain/result.ts";
import { installedBanal, lookupOrder, pickBanal } from "./locate.ts";
import { BANAL_PIN } from "./pin.ts";
import { parseBanalSettings } from "./settings.ts";

const dirs = { home: "/h", tmp: "/t", cwd: "/w" };
const project = "/p" as AbsolutePath;
const cache = `/h/.cache/rpp/banal/${BANAL_PIN.commit.slice(0, 12)}/banal`;
const on =
  (...files: string[]) =>
  (p: string) =>
    files.includes(p);
const pick = (env: Record<string, string>, isFile: (p: string) => boolean) =>
  pickBanal(lookupOrder(parseBanalSettings(env, dirs), project), isFile);
const kind = (r: ReturnType<typeof pick>) =>
  r.ok ? r.value.provenance.kind : r.error.kind;

test("installedBanal: one directory per HotCRP commit", () => {
  assert.equal(installedBanal(parseBanalSettings({}, dirs)), cache);
});

test("rpp's own copy when nothing else is named", () => {
  assert.equal(kind(pick({}, on(cache))), "cache");
});

test("a project's vendor/banal before rpp's copy", () => {
  // Guards: a project that vendors banal keeps using its own copy.
  assert.equal(kind(pick({}, on(cache, "/p/vendor/banal"))), "vendor");
});

test("$BANAL before both", () => {
  const r = pick({ BANAL: "/own" }, on("/own", cache, "/p/vendor/banal"));
  assert.equal(r.ok && r.value.path, "/own");
});

test("🔴 $BANAL naming a missing file finds NOTHING — no fallback to another banal", () => {
  // Guards: an explicit choice that is wrong is an error, not a silent fall-back.
  assert.deepEqual(
    pick({ BANAL: "/nope" }, on(cache, "/p/vendor/banal")),
    err({ kind: "explicit-not-found", path: "/nope" }),
  );
});

test("nothing anywhere: not installed, naming where rpp's copy would be", () => {
  assert.deepEqual(
    pick({}, on()),
    err({ kind: "not-installed", installed: cache }),
  );
});
