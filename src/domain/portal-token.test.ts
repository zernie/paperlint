/** Which token a portal command uses: the site's variable only, a lone site-less one refused by name. */
import assert from "node:assert/strict";
import { test } from "vitest";
import { hostOf, lookUpToken } from "./portal-token.ts";

const NAMES = { variable: "HOTCRP_TOKEN_MSR2027", siteLess: "HOTCRP_TOKEN" };

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
    lookUpToken(NAMES, (n) => env[n]),
    {
      ok: true,
      value: { variable: "HOTCRP_TOKEN_MSR2027", token: "hct_site" },
    },
  );
});

test("🔴 lookUpToken: only the site-less variable set → refused by name, never used", () => {
  const env: Record<string, string> = { HOTCRP_TOKEN: "hct_other" };
  assert.deepEqual(
    lookUpToken(NAMES, (n) => env[n]),
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
    assert.deepEqual(lookUpToken(NAMES, read), {
      ok: false,
      error: { kind: "missing", variable: "HOTCRP_TOKEN_MSR2027" },
    });
});
