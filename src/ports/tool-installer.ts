/**
 * The port `paperlint toolchain` installs and checks an external program through. One port, many
 * programs: banal implements it now, TeX Live in #76.
 */
import type { Opaque } from "ts-essentials";
import type { Result } from "../domain/result.ts";
import type { Lines } from "../domain/text.ts";

/**
 * Present, verified, running. BRANDED: a literal `{ where, fresh, verified }` is not a `Ready`, so
 * only an installer's adapter — one minting function each (banal's is `ready` in
 * `adapters/banal/index.ts`) — can make one, and a ready line cannot be printed without it.
 */
export type Ready = Opaque<
  {
    /** Where it is: the program's path or its bin directory. */
    readonly where: string;
    /** This run installed it. */
    readonly fresh: boolean;
    /** What was checked before calling it ready, as a person reads it. */
    readonly verified: string;
  },
  "Ready"
>;

export interface ToolInstaller {
  /** The program as a person reads it: `banal 1.2 (HotCRP f3e4352)`. */
  readonly label: string;
  /** Make it present, verified and running; `report` is told before a slow step (a download). */
  ensure(report: (line: string) => void): Result<Ready, Lines>;
  /** Is it present, verified and running? The same predicate as `ensure`, changing nothing. */
  check(): Result<Ready, Lines>;
}
