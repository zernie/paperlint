/**
 * The port `paperlint toolchain` installs and checks an external program through. One port, many
 * programs: banal implements it now, TeX Live in #76.
 */
import type { Result } from "../domain/result.ts";
import type { Lines } from "../domain/text.ts";
import type { Ready } from "../domain/ready.ts";

export type { Ready };

export interface ToolInstaller {
  /** The program as a person reads it: `banal 1.2 (HotCRP f3e4352)`. */
  readonly label: string;
  /** Make it present, verified and running; `report` is told before a slow step (a download). */
  ensure(report: (line: string) => void): Result<Ready, Lines>;
  /** Is it present, verified and running? The same predicate as `ensure`, changing nothing. */
  check(): Result<Ready, Lines>;
}
