/**
 * The in-process hook table may only shrink. It is a workaround for zernie/vigiles#472 (a hook
 * program cannot use its own package's code); the way out is zernie/paperlint#650, not one more
 * entry. A hook that needs this package's code waits for vigiles#472 instead.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { IN_PROCESS_HOOK_NAMES } from "./cli.ts";

/** The entries that existed when the table was frozen (2026-11-23). Remove a name; never add one. */
const FROZEN = ["lint-edited", "paper-folder-layout", "submission-confirm"];

test("no hook is added to IN_PROCESS_HOOKS: fix zernie/vigiles#472 and extract (#650) instead", () => {
  assert.deepEqual(
    IN_PROCESS_HOOK_NAMES.filter((name) => !FROZEN.includes(name)),
    [],
  );
});
