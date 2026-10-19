/** A HotCRP site's token variable: the host's first label, or a path-served site's last segment. */
import assert from "node:assert/strict";
import { test } from "vitest";
import { tokenVariable } from "./index.ts";

test("tokenVariable: HOTCRP_TOKEN_ and the host's first label, upper-cased, non-alphanumerics as `_`", () => {
  assert.equal(
    tokenVariable("https://msr2027.hotcrp.com"),
    "HOTCRP_TOKEN_MSR2027",
  );
  assert.equal(
    tokenVariable("https://aidc.submit.acsac.org"),
    "HOTCRP_TOKEN_AIDC",
  );
  assert.equal(
    tokenVariable("https://ase-2027.hotcrp.com:8443"),
    "HOTCRP_TOKEN_ASE_2027",
  );
  assert.equal(tokenVariable("http://127.0.0.1:9"), "HOTCRP_TOKEN_127");
});

test("🔴 tokenVariable: a site served under a path takes its last path segment — one host, many conferences", () => {
  assert.equal(
    tokenVariable("https://hotcrp.example.edu/conf2027"),
    "HOTCRP_TOKEN_CONF2027",
  );
  assert.equal(
    tokenVariable("https://hotcrp.example.edu/conf2027/"),
    "HOTCRP_TOKEN_CONF2027",
  );
  assert.equal(
    tokenVariable("https://hotcrp.example.edu/sec/2027-fall"),
    "HOTCRP_TOKEN_2027_FALL",
  );
  assert.equal(
    tokenVariable("https://msr2027.hotcrp.com/"),
    "HOTCRP_TOKEN_MSR2027",
  );
});

test("tokenVariable: a portal URL that does not parse is named by its first label", () => {
  assert.equal(tokenVariable("msr2027.hotcrp.com"), "HOTCRP_TOKEN_MSR2027");
});
