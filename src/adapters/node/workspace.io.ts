/**
 * `Workspace` over a temporary directory: `mkdtemp` + `realpath` (macOS's `/var` is a symlink to
 * `/private/var`, and a path through it is not the one a child process reports) + `rm` in `finally`.
 */
import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { BanalStaging, StagedInput } from "../banal/invocation.ts";
import type {
  AbsolutePath,
  NotAPromise,
  Scratch,
  Workspace,
} from "../../domain/ports.ts";

function scratchIn(dir: AbsolutePath): Scratch {
  return {
    dir,
    stage(s: BanalStaging): StagedInput {
      const [xml, stub] = s.files;
      const at = (name: string) => join(dir, name) as AbsolutePath;
      writeFileSync(at(xml.name), xml.content);
      writeFileSync(at(stub.name), stub.content);
      chmodSync(at(stub.name), 0o755);
      return { xml: at(xml.name), stub: at(stub.name) } as StagedInput;
    },
  };
}

/** Scratch directories under `tmpDir`. */
export function tmpWorkspace(tmpDir: string): Workspace {
  return {
    within<T>(prefix: string, use: (s: Scratch) => NotAPromise<T>): T {
      const dir = realpathSync(mkdtempSync(join(tmpDir, prefix)));
      try {
        return use(scratchIn(dir as AbsolutePath));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
