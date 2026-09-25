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
import type { AbsolutePath } from "../../domain/paths.ts";
import type { NotAPromise, Scratch, Workspace } from "../../ports/workspace.ts";

function scratchIn(dir: AbsolutePath): Scratch {
  return {
    dir,
    write(name, content, mode): AbsolutePath {
      const at = join(dir, name) as AbsolutePath;
      writeFileSync(at, content);
      if (mode === "exec") chmodSync(at, 0o755);
      return at;
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
