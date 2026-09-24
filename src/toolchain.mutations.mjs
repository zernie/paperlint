/**
 * Battery for `toolchain.ts` — the TeX Live installer.
 *
 * Each case breaks one line and names the harness row that must go red. The harness runs its
 * tables in order, so a case dies at its own assertion, not at a later one that happens to depend
 * on it.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "toolchain.ts");
const HARNESS = join(HERE, "toolchain.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "any download counts as the archive",
        harness: HARNESS,
        expect: "download: falls through a missing mirror and a non-archive",
        disables:
          "the archive check: a mirror's error page would be unpacked as install-tl",
        edits: [
          [
            SRC,
            '    if (io.run("tar", ["tzf", dest], quiet(io)).status === 0) return mirror;',
            "    return mirror;",
          ],
        ],
      },
      {
        name: "curl without a time limit",
        harness: HARNESS,
        expect: "download: every curl carries its own time limit",
        disables:
          "the per-download bond: a hung mirror would hold the job until the job's own timeout",
        edits: [
          [
            SRC,
            '        "--max-time",\n        String(DOWNLOAD_SECONDS),\n',
            "",
          ],
        ],
      },
      {
        name: "an unknown package name is not reported",
        harness: HARNESS,
        expect: "🔴 an unknown package name fails and is NAMED",
        disables:
          "the diagnosis: an invented package name would read as a missing file, not as a wrong name",
        edits: [[SRC, "    if (unknown.length)", "    if (false)"]],
      },
      {
        name: "the result is not verified",
        harness: HARNESS,
        expect: "🔴 tlmgr 'installs' it but the proof file is absent",
        disables:
          "acceptance by result: tlmgr's exit code would stand for the files, which is how an apt step once 'installed' nothing",
        edits: [[SRC, "  if (!noGaps(added.value.gaps))", "  if (false)"]],
      },
      {
        name: "a complete tree is reinstalled",
        harness: HARNESS,
        expect: "second run: exit 0 and says there is nothing to do",
        disables:
          "idempotence: the second run must not touch the network or say it did work",
        edits: [[SRC, "  if (tree && complete(tree)) {", "  if (false) {"]],
      },
      {
        name: "a stale mirror reads as a new release",
        harness: HARNESS,
        expect:
          "releaseGap: a STALE mirror (repository older than the tree) is not a new release",
        disables:
          "the direction of the year check: an outdated mirror would trigger a whole new install",
        edits: [
          [
            SRC,
            "  return local && remote && Number(remote) > Number(local)",
            "  return local && remote && remote !== local",
          ],
        ],
      },
      {
        name: "the newest tree is used even when incomplete",
        harness: HARNESS,
        expect: "usableTree: the newest COMPLETE tree, not simply the newest",
        disables:
          "the complete-tree preference: an interrupted new-year install would be built with",
        edits: [
          [
            SRC,
            "  return trees.find(complete) ?? trees[0] ?? null;",
            "  return trees[0] ?? null;",
          ],
        ],
      },
      {
        name: "tlmgr's release refusal is not recognised",
        harness: HARNESS,
        expect: "🔴 years: a new package on a 2027 mirror",
        disables:
          "the recovery: a new TeX Live year would fail every newly declared package, loudly and forever",
        edits: [[SRC, "    if (newer) return { ok: false, newer };", ""]],
      },
      {
        name: "the old tree is not named",
        harness: HARNESS,
        expect: "years: the old tree is left in place",
        disables:
          "the notice: a superseded 300 MB tree would sit in the cache with nothing saying so",
        edits: [
          [
            SRC,
            "  if (used !== tree.value) o.log(leftInPlace(tree.value));",
            "",
          ],
        ],
      },
      {
        name: "the installer's year is not compared with the refused tree",
        harness: HARNESS,
        expect: "🔴 years: mirrors that disagree about the release fail",
        disables:
          "the guard: install-tl for the SAME year would run over the tree that is already there",
        edits: [
          [
            SRC,
            "    if (newerThan && Number(year) <= Number(newerThan))",
            "    if (false)",
          ],
        ],
      },
    ],
  }),
);
