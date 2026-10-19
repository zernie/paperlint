/**
 * A HotCRP site's token variable — one per site, never shared by two: on the hosted service
 * (`*.hotcrp.com`) the subdomain, anywhere else the whole host and path.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { tokenVariable } from "./index.ts";

test("tokenVariable: on hotcrp.com the subdomain alone names the site", () => {
  assert.equal(
    tokenVariable("https://msr2027.hotcrp.com"),
    "HOTCRP_TOKEN_MSR2027",
  );
  assert.equal(
    tokenVariable("https://msr2027.hotcrp.com/"),
    "HOTCRP_TOKEN_MSR2027",
  );
  assert.equal(
    tokenVariable("https://ase-2027.hotcrp.com"),
    "HOTCRP_TOKEN_ASE_2027",
  );
  assert.equal(tokenVariable("msr2027.hotcrp.com"), "HOTCRP_TOKEN_MSR2027");
});

test("tokenVariable: any other host — the whole host and path, upper-cased, non-alphanumerics as `_`", () => {
  assert.equal(
    tokenVariable("https://aidc.submit.acsac.org"),
    "HOTCRP_TOKEN_AIDC_SUBMIT_ACSAC_ORG",
  );
  assert.equal(
    tokenVariable("https://hotcrp.example.edu/conf2027"),
    "HOTCRP_TOKEN_HOTCRP_EXAMPLE_EDU_CONF2027",
  );
  assert.equal(
    tokenVariable("https://hotcrp.example.edu/conf2027/"),
    "HOTCRP_TOKEN_HOTCRP_EXAMPLE_EDU_CONF2027",
  );
  assert.equal(tokenVariable("http://127.0.0.1:9"), "HOTCRP_TOKEN_127_0_0_1");
  assert.equal(
    tokenVariable("hotcrp.example.edu"),
    "HOTCRP_TOKEN_HOTCRP_EXAMPLE_EDU",
  );
});

test("🔴 tokenVariable: two sites never share a variable — same first label, same last path segment", () => {
  const sites = [
    "https://conf.hotcrp.com",
    "https://conf.example.edu",
    "https://a.example.edu/conf2027",
    "https://b.example.edu/conf2027",
    "https://hotcrp.example.edu/conf2027",
    "https://hotcrp.example.edu/conf2028",
  ];
  const names = sites.map(tokenVariable);
  assert.equal(new Set(names).size, sites.length, names.join(", "));
});
