/** Which token a portal command uses: the site's variable only, a lone site-less one refused by name. */
import assert from "node:assert/strict";
import { test } from "vitest";
import { hostOf, lookUpToken } from "./portal-token.ts";

const NAMES = {
  variable: "HOTCRP_TOKEN_MSR2027",
  shared: null,
  siteLess: "HOTCRP_TOKEN",
};
const HOSTED = { ...NAMES, shared: "HOTCRP_TOKEN_HOTCRP_COM" };

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
        shared: null,
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
      error: {
        kind: "missing",
        variable: "HOTCRP_TOKEN_MSR2027",
        shared: null,
      },
    });
});

test("lookUpToken: a hosted site with only the shared variable set → the shared token, and its name", () => {
  const env: Record<string, string> = {
    HOTCRP_TOKEN_HOTCRP_COM: " hct_all \n",
  };
  assert.deepEqual(
    lookUpToken(HOSTED, (n) => env[n]),
    {
      ok: true,
      value: { variable: "HOTCRP_TOKEN_HOTCRP_COM", token: "hct_all" },
    },
  );
});

test("lookUpToken: a hosted site with both set → the site's own token wins", () => {
  const env: Record<string, string> = {
    HOTCRP_TOKEN_MSR2027: "hct_site",
    HOTCRP_TOKEN_HOTCRP_COM: "hct_all",
  };
  assert.deepEqual(
    lookUpToken(HOSTED, (n) => env[n]),
    {
      ok: true,
      value: { variable: "HOTCRP_TOKEN_MSR2027", token: "hct_site" },
    },
  );
});

test("lookUpToken: a hosted site with a blank own variable falls to the shared one", () => {
  const env: Record<string, string> = {
    HOTCRP_TOKEN_MSR2027: "  ",
    HOTCRP_TOKEN_HOTCRP_COM: "hct_all",
  };
  assert.deepEqual(
    lookUpToken(HOSTED, (n) => env[n]),
    {
      ok: true,
      value: { variable: "HOTCRP_TOKEN_HOTCRP_COM", token: "hct_all" },
    },
  );
});

test("🔴 lookUpToken: a site with no shared variable never reads it, set or not", () => {
  const env: Record<string, string> = { HOTCRP_TOKEN_HOTCRP_COM: "hct_all" };
  const seen: string[] = [];
  assert.deepEqual(
    lookUpToken(NAMES, (n) => (seen.push(n), env[n])),
    {
      ok: false,
      error: {
        kind: "missing",
        variable: "HOTCRP_TOKEN_MSR2027",
        shared: null,
      },
    },
  );
  assert.deepEqual(seen, ["HOTCRP_TOKEN_MSR2027", "HOTCRP_TOKEN"]);
});

test("🔴 lookUpToken: a hosted site with only the site-less variable set → refused by name, shared named", () => {
  const env: Record<string, string> = { HOTCRP_TOKEN: "hct_other" };
  assert.deepEqual(
    lookUpToken(HOSTED, (n) => env[n]),
    {
      ok: false,
      error: {
        kind: "site-less",
        variable: "HOTCRP_TOKEN_MSR2027",
        shared: "HOTCRP_TOKEN_HOTCRP_COM",
        siteLess: "HOTCRP_TOKEN",
      },
    },
  );
});
