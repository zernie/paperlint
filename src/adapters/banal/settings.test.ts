import assert from "node:assert/strict";
import { test } from "vitest";
import { parseBanalSettings } from "./settings.ts";

const dirs = { home: "/h", tmp: "/t", cwd: "/w" };

test("cacheDir: $PAPERLINT_BANAL_DIR, else $XDG_CACHE_HOME/paperlint/banal, else ~/.cache/paperlint/banal", () => {
  assert.equal(
    parseBanalSettings({ PAPERLINT_BANAL_DIR: "/x" }, dirs).cacheDir,
    "/x",
  );
  assert.equal(
    parseBanalSettings({ XDG_CACHE_HOME: "/c" }, dirs).cacheDir,
    "/c/paperlint/banal",
  );
  assert.equal(
    parseBanalSettings({}, dirs).cacheDir,
    "/h/.cache/paperlint/banal",
  );
});

test("an empty variable is unset, and a relative one is relative to the cwd the root read", () => {
  const s = parseBanalSettings(
    { BANAL: "b/banal", PAPERLINT_BANAL_DIR: "" },
    dirs,
  );
  assert.equal(s.explicit, "/w/b/banal");
  assert.equal(s.cacheDir, "/h/.cache/paperlint/banal");
  assert.equal(parseBanalSettings({}, dirs).explicit, null);
});

test("processEnv drops undefined values: a child's environment is strings only", () => {
  assert.deepEqual(
    parseBanalSettings({ A: "1", B: undefined }, dirs).processEnv,
    { A: "1" },
  );
});
