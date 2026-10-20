/**
 * A HotCRP site's token variable — one per site, never shared by two: on the hosted service
 * (`*.hotcrp.com`) the subdomain, anywhere else the whole host and path.
 */
import { map, unique } from "remeda";
import { expect, test } from "vitest";
import { tokenVariable } from "./index.ts";

test("tokenVariable: on hotcrp.com the subdomain alone names the site", () => {
  expect(tokenVariable("https://msr2027.hotcrp.com")).toBe(
    "HOTCRP_TOKEN_MSR2027",
  );
  expect(tokenVariable("https://msr2027.hotcrp.com/")).toBe(
    "HOTCRP_TOKEN_MSR2027",
  );
  expect(tokenVariable("https://ase-2027.hotcrp.com")).toBe(
    "HOTCRP_TOKEN_ASE_2027",
  );
  expect(tokenVariable("msr2027.hotcrp.com")).toBe("HOTCRP_TOKEN_MSR2027");
});

test("tokenVariable: any other host — the whole host and path, upper-cased, non-alphanumerics as `_`", () => {
  expect(tokenVariable("https://aidc.submit.acsac.org")).toBe(
    "HOTCRP_TOKEN_AIDC_SUBMIT_ACSAC_ORG",
  );
  expect(tokenVariable("https://hotcrp.example.edu/conf2027")).toBe(
    "HOTCRP_TOKEN_HOTCRP_EXAMPLE_EDU_CONF2027",
  );
  expect(tokenVariable("https://hotcrp.example.edu/conf2027/")).toBe(
    "HOTCRP_TOKEN_HOTCRP_EXAMPLE_EDU_CONF2027",
  );
  expect(tokenVariable("hotcrp.example.edu")).toBe(
    "HOTCRP_TOKEN_HOTCRP_EXAMPLE_EDU",
  );
});

test("tokenVariable: two sites never share a variable — same first label, same last path segment", () => {
  const sites = [
    "https://conf.hotcrp.com",
    "https://conf.example.edu",
    "https://a.example.edu/conf2027",
    "https://b.example.edu/conf2027",
    "https://hotcrp.example.edu/conf2027",
    "https://hotcrp.example.edu/conf2028",
  ];
  const names = map(sites, tokenVariable);
  expect(unique(names)).toStrictEqual(names);
});

test("tokenVariable: a port other than the scheme's default is part of the site; the default changes nothing", () => {
  expect(
    map(
      [
        "https://review.example.org:8443/conf",
        "https://review.example.org:9443/conf",
        "https://review.example.org:443/conf",
        "https://review.example.org/conf",
        "http://127.0.0.1:9",
      ],
      tokenVariable,
    ),
  ).toStrictEqual([
    "HOTCRP_TOKEN_REVIEW_EXAMPLE_ORG_8443_CONF",
    "HOTCRP_TOKEN_REVIEW_EXAMPLE_ORG_9443_CONF",
    "HOTCRP_TOKEN_REVIEW_EXAMPLE_ORG_CONF",
    "HOTCRP_TOKEN_REVIEW_EXAMPLE_ORG_CONF",
    "HOTCRP_TOKEN_127_0_0_1_9",
  ]);
});
