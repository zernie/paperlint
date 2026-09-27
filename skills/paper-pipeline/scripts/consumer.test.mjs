/**
 * consumer.mjs carriers the harness does not reach: isMain without a real entry point, a dangling
 * skill link, the ledger that must exist, the declared time zone, and the contact address.
 */
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, test } from "vitest";
import { useTempDir, writeTree } from "../../../test/support.ts";
import {
  consumerContactEmail,
  consumerTimezone,
  installedSkills,
  isMain,
} from "./consumer.mjs";

const root = useTempDir("consumer-");
const argv1 = process.argv[1];
afterEach(() => {
  process.argv[1] = argv1;
});
/** A consumer root whose paperlint.json holds `settings`. */
const consumer = (name, settings) =>
  writeTree(join(root, name), {
    "paperlint.json": JSON.stringify(settings),
  });
const at = (dir) => ({ env: {}, cwd: dir });

test("isMain: no entry point is never main; an entry that is not on disk is compared as written", () => {
  process.argv[1] = undefined;
  assert.equal(isMain("file:///x.mjs"), false);
  process.argv[1] = "/no/such/entry.mjs";
  assert.equal(isMain("file:///no/such/entry.mjs"), true);
  assert.equal(isMain("file:///other.mjs"), false);
});

test("installedSkills: a link that leads nowhere is refused by name, with the errno", () => {
  const dir = join(root, "skills");
  mkdirSync(join(dir, "ok"), { recursive: true });
  writeFileSync(join(dir, "ok", "SKILL.md"), "# ok\n");
  symlinkSync(join(root, "gone"), join(dir, "dead"));
  assert.throws(() => installedSkills(dir), {
    code: "DANGLING_SKILL_LINK",
    dangling: [{ name: "dead", target: join(root, "gone"), cause: "ENOENT" }],
  });
});

test("installedSkills: an entry gone between the listing and the stat is refused as '(not a link)'; an error without a code says 'error'", () => {
  const fake = (statError) => ({
    readdirSync: () => ["gone"],
    statSync: () => {
      throw statError;
    },
    existsSync: () => false,
    readlinkSync: () => {
      throw Object.assign(new Error("EINVAL"), { code: "EINVAL" });
    },
  });
  assert.throws(
    () =>
      installedSkills(
        "/s",
        fake(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
      ),
    { dangling: [{ name: "gone", target: "(not a link)", cause: "ENOENT" }] },
  );
  assert.throws(() => installedSkills("/s", fake(new Error("odd"))), {
    dangling: [{ name: "gone", target: "(not a link)", cause: "error" }],
  });
});

test("consumerTimezone: UTC by default, the declared zone, and loud refusals of null and a typo", () => {
  assert.equal(consumerTimezone(at(join(root, "nothing-declared"))), "UTC");
  assert.equal(
    consumerTimezone(at(consumer("tz", { timezone: "Europe/Berlin" }))),
    "Europe/Berlin",
  );
  assert.throws(
    () => consumerTimezone(at(consumer("tz-null", { timezone: null }))),
    new TypeError(
      'paperlint: "timezone" must be a non-empty IANA zone string, got null',
    ),
  );
  assert.throws(
    () =>
      consumerTimezone(at(consumer("tz-typo", { timezone: "Europe/Berlinn" }))),
    {
      name: "RangeError",
      message:
        /^paperlint: "timezone" is "Europe\/Berlinn", which is not an IANA time zone/,
    },
  );
});

test("consumerContactEmail: absent or null is the public pool; a non-address is refused", () => {
  assert.equal(
    consumerContactEmail(at(consumer("mail-null", { contactEmail: null }))),
    null,
  );
  assert.equal(
    consumerContactEmail(
      at(consumer("mail", { contactEmail: "me@example.org" })),
    ),
    "me@example.org",
  );
  assert.throws(
    () =>
      consumerContactEmail(at(consumer("mail-bad", { contactEmail: "me" }))),
    new TypeError(
      'paperlint: "contactEmail" must be an email address, got "me". Remove the key entirely to use the public pool.',
    ),
  );
});
