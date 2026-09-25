/**
 * Battery for `link-skills.ts`.
 *
 * Every case below reintroduces a way the skills stop being where Claude Code looks — or, worse,
 * a way the linker destroys something the consumer made. Both fail silently in real life: a
 * missing skill is simply absent from the listing, and a replaced directory is simply gone.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "link-skills.ts");
const HARNESS = join(HERE, "link-skills.harness.mjs");
const CONSUMER = join(
  ROOT,
  "skills",
  "paper-pipeline",
  "scripts",
  "consumer.mjs",
);

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        // The definition lives in the port since rpp#62 (`installedSkills` in consumer.mjs), so
        // the defect is planted THERE and must still die in THIS harness — the evidence that the
        // linker reads it through the shared function rather than through a copy of its own.
        name: "any directory counts as a skill",
        harness: HARNESS,
        expect: "a directory without SKILL.md is not one",
        disables:
          "the definition of a skill. A helper directory beside the skills gets a link, and Claude " +
          "Code lists an entry with no SKILL.md behind it",
        edits: [
          [
            CONSUMER,
            '    if (st.isDirectory() && existsSync(join(entry, "SKILL.md")))\n      names.push(name);',
            "    if (st.isDirectory())\n      names.push(name);",
          ],
        ],
      },
      {
        name: "the link is written absolute",
        harness: HARNESS,
        expect: "the link is RELATIVE",
        disables:
          "portability of the checkout. An absolute link works on the machine that ran init and " +
          "dangles in every other clone, container and CI runner",
        edits: [
          [
            SRC,
            '      symlinkSync(target, entry, "dir");',
            '      symlinkSync(resolve(physicalHome, target), entry, "dir");',
          ],
        ],
      },
      {
        name: "an existing correct link is not recognised",
        harness: HARNESS,
        expect: "a second run reports every link as ALREADY present",
        disables:
          "idempotency. Every re-run of init would report its own links as someone else's " +
          "and tell the consumer to move them",
        edits: [
          [
            SRC,
            '    if (realpathSync(entry) === want) return { status: "present" };',
            '    if (realpathSync(entry) === "") return { status: "present" };',
          ],
        ],
      },
      {
        name: "a foreign entry is replaced instead of reported",
        harness: HARNESS,
        expect: "a foreign DIRECTORY is left untouched",
        disables:
          "the one promise that makes init safe to run on a real project: a consumer's own skill " +
          "of the same name, or a link they aimed elsewhere, is deleted without a word",
        edits: [
          [
            SRC,
            '  symlinkSync,\n} from "node:fs";',
            '  symlinkSync,\n  rmSync,\n} from "node:fs";',
          ],
          [
            SRC,
            '    if (seen.status !== "missing" || !write)',
            '    if (seen.status === "present" || !write)',
          ],
          [
            SRC,
            '      symlinkSync(target, entry, "dir");',
            '      rmSync(entry, { recursive: true, force: true });\n      symlinkSync(target, entry, "dir");',
          ],
        ],
      },
      {
        name: "the resolved store path is linked instead of the project's own spelling",
        harness: HARNESS,
        expect:
          "under pnpm the link goes through node_modules/research-paper-pipeline",
        disables:
          "the link surviving an upgrade under pnpm. The store directory carries the version in " +
          "its name; the next install removes it and every skill link dangles until init is re-run",
        edits: [
          [
            SRC,
            "      if (realpathSync(candidate) === dir) return { dir, spelled: candidate };",
            '      if (realpathSync(candidate) === "") return { dir, spelled: candidate };',
          ],
        ],
      },
      {
        name: "doctor's read-only call writes links",
        harness: HARNESS,
        expect:
          "write:false reports every skill as missing and creates nothing",
        disables:
          "the difference between looking and changing. `rpp doctor` would quietly repair the " +
          "state it is supposed to report, so the report can never show the gap",
        edits: [
          [
            SRC,
            '    if (seen.status !== "missing" || !write)',
            '    if (seen.status !== "missing")',
          ],
          [
            SRC,
            "  if (write && shipped.names.length > 0) {",
            "  if (shipped.names.length > 0) {",
          ],
        ],
      },
    ],
  }),
);
