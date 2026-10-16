/** `nodeRemove` on a temp directory: the file goes, and a file already gone is no error. */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import { useTempDir } from "../../../test/support.ts";
import { nodeRemove } from "./remove.io.ts";

const root = useTempDir("remove-");

it("removes the file, and a second removal does nothing", () => {
  const p = absolutePath(join(root, "x.txt"));
  writeFileSync(p, "x");
  nodeRemove(p);
  nodeRemove(p);
  // Guards: the plaintext is gone after a seal, and a re-run does not fail on it.
  expect(existsSync(p)).toBe(false);
});
