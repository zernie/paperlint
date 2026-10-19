/** The token variable of a portal site, and the one lookup policy: the site's variable only. */
import assert from "node:assert/strict";
import { test } from "vitest";
import { hostOf, lookUpToken, tokenVariable } from "./portal-token.ts";

const MSR = { kind: "hotcrp", url: "https://msr2027.hotcrp.com" } as const;

test("tokenVariable: the kind's prefix and the host's first label, upper-cased, non-alphanumerics as `_`", () => {
  assert.equal(tokenVariable(MSR), "HOTCRP_TOKEN_MSR2027");
  assert.equal(
    tokenVariable({ kind: "hotcrp", url: "https://aidc.submit.acsac.org" }),
    "HOTCRP_TOKEN_AIDC",
  );
  assert.equal(
    tokenVariable({
      kind: "hotcrp",
      url: "https://ase-2027.hotcrp.com:8443",
    }),
    "HOTCRP_TOKEN_ASE_2027",
  );
  assert.equal(
    tokenVariable({ kind: "hotcrp", url: "http://127.0.0.1:9" }),
    "HOTCRP_TOKEN_127",
  );
});

test("🔴 tokenVariable: a site served under a path takes its last path segment — one host, many conferences", () => {
  assert.equal(
    tokenVariable({
      kind: "hotcrp",
      url: "https://hotcrp.example.edu/conf2027",
    }),
    "HOTCRP_TOKEN_CONF2027",
  );
  assert.equal(
    tokenVariable({
      kind: "hotcrp",
      url: "https://hotcrp.example.edu/conf2027/",
    }),
    "HOTCRP_TOKEN_CONF2027",
  );
  assert.equal(
    tokenVariable({
      kind: "hotcrp",
      url: "https://hotcrp.example.edu/sec/2027-fall",
    }),
    "HOTCRP_TOKEN_2027_FALL",
  );
  assert.equal(
    tokenVariable({ kind: "hotcrp", url: "https://msr2027.hotcrp.com/" }),
    "HOTCRP_TOKEN_MSR2027",
  );
});

test("tokenVariable: a portal URL that does not parse is named by its first label", () => {
  assert.equal(
    tokenVariable({ kind: "hotcrp", url: "msr2027.hotcrp.com" }),
    "HOTCRP_TOKEN_MSR2027",
  );
});

test("hostOf: the URL's host; a text that is no URL stands for itself", () => {
  assert.equal(
    hostOf("https://msr2027.hotcrp.com/deadlines"),
    "msr2027.hotcrp.com",
  );
  assert.equal(hostOf("msr2027.hotcrp.com"), "msr2027.hotcrp.com");
});

test("lookUpToken: the site's variable set → its token, trimmed, and its name", () => {
  const env: Record<string, string> = {
    HOTCRP_TOKEN_MSR2027: " hct_site \n",
    HOTCRP_TOKEN: "hct_other",
  };
  assert.deepEqual(
    lookUpToken(MSR, (n) => env[n]),
    {
      ok: true,
      value: { variable: "HOTCRP_TOKEN_MSR2027", token: "hct_site" },
    },
  );
});

test("🔴 lookUpToken: only the site-less HOTCRP_TOKEN set → refused by name, never used", () => {
  const env: Record<string, string> = { HOTCRP_TOKEN: "hct_other" };
  assert.deepEqual(
    lookUpToken(MSR, (n) => env[n]),
    {
      ok: false,
      error: {
        kind: "site-less",
        variable: "HOTCRP_TOKEN_MSR2027",
        siteLess: "HOTCRP_TOKEN",
      },
    },
  );
});

test("lookUpToken: neither set, or only blanks → missing, naming the site's variable", () => {
  const blank: Record<string, string> = {
    HOTCRP_TOKEN_MSR2027: "  ",
    HOTCRP_TOKEN: "",
  };
  for (const read of [() => undefined, (n: string) => blank[n]])
    assert.deepEqual(lookUpToken(MSR, read), {
      ok: false,
      error: { kind: "missing", variable: "HOTCRP_TOKEN_MSR2027" },
    });
});
