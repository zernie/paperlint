import assert from "node:assert/strict";
import { test } from "vitest";
import { loadTypescript } from "./tex-requirements.ts";

test("loadTypescript refuses a module without the two functions a profile is read with", () => {
  assert.throws(
    () => loadTypescript(() => ({})),
    /loaded without parseConfigFileTextToJson/,
  );
});

test("loadTypescript hands back what `require` loaded when it has them", () => {
  const ts = {
    parseConfigFileTextToJson: () => ({ config: {} }),
    flattenDiagnosticMessageText: () => "",
  };
  assert.equal(
    loadTypescript(() => ts),
    ts,
  );
});
