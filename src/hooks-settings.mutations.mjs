/**
 * Battery for `hooks-settings.ts`.
 *
 * Every case reintroduces a way the hooks end up wired wrong while every report stays green:
 * twice (a guard that runs two times says nothing about it), rewritten on every run (a committed
 * file that churns for nothing), or reported as fine when doctor was asked about the wrong thing.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "hooks-settings.ts");
const HARNESS = join(HERE, "hooks-settings.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "every spelling of the bin counts as ours",
        harness: HARNESS,
        // The spelling truth table is the first owner: `npx paperlint hook …` must read as NOT ours,
        // and that row is where it goes red.
        expect: '→ {"name":"paper-edit-guard","ours":false,"legacy":true}',
        disables:
          "the duplicate guard for every bin spelling but ours. A hook wired by hand as " +
          "`npx paperlint hook …` or through an absolute rpp.mjs path reads as ours, init merges its own " +
          "copy beside it, and the hook runs twice per event",
        edits: [
          [SRC, "        ours: t === MANAGED_BY,", "        ours: true,"],
        ],
      },
      {
        name: "another spelling no longer stops the write",
        harness: HARNESS,
        expect: "a hook wired by hand under another spelling",
        disables:
          "the refusal itself: the foreign command is found and then written over anyway",
        edits: [[SRC, "  if (found.length > 0) {", "  if (false) {"]],
      },
      {
        name: "the settings file is rewritten even when nothing changed",
        harness: HARNESS,
        // The fresh project's second run is the first place a rewrite shows: `written` twice.
        expect: "a second run changes NOTHING",
        disables:
          "idempotency as the user sees it. Every init would reformat a committed file the user " +
          "wrote, and the diff would say nothing happened while showing that everything did",
        edits: [
          [
            SRC,
            "  if (JSON.stringify(next) === JSON.stringify(read.settings))",
            "  if (false)",
          ],
        ],
      },
      {
        name: "the project-dir prefix is not stripped",
        harness: HARNESS,
        expect: "hookRun(",
        disables:
          "recognising the spelling init itself writes. `${CLAUDE_PROJECT_DIR}/node_modules/…` " +
          "stops matching, so a second init sees a foreign hook where its own stands",
        edits: [
          [
            SRC,
            '  return unquoted.replace(/^\\$\\{?CLAUDE_PROJECT_DIR\\}?[/\\\\]/, "");',
            "  return unquoted;",
          ],
        ],
      },
      {
        name: "doctor stops counting duplicates",
        harness: HARNESS,
        expect: "the same hook under two spellings",
        disables:
          "the only report of a guard that runs twice. Claude Code dedupes only identical " +
          "handlers, so two spellings both run and nothing else would say so",
        edits: [
          [
            SRC,
            "  const twice = wiring.names.filter((n) => total(n) > 1);",
            "  const twice = wiring.names.filter((n) => total(n) > 2);",
          ],
        ],
      },
      {
        name: "doctor offers `paperlint init` even where init refuses to write",
        harness: HARNESS,
        expect: "partly wired BY HAND",
        disables:
          "a remedy that works. The reader runs init, init writes nothing, and doctor says the " +
          "same thing again — a loop with no exit",
        edits: [[SRC, "  const remedy = handWired", "  const remedy = false"]],
      },
      {
        name: "a disabled plugin counts as enabled",
        harness: HARNESS,
        expect: "a disabled entry does not count",
        disables:
          "the plugin warning's precision. A project that already switched the plugin off would " +
          "be told to uninstall it",
        edits: [
          [
            SRC,
            '      ([id, on]) => on === true && id.split("@")[0] === LEGACY_PACKAGE_NAME,',
            '      ([id]) => id.split("@")[0] === LEGACY_PACKAGE_NAME,',
          ],
        ],
      },
    ],
  }),
);
