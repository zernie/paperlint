/** Paths as the domain holds them. */
import type { Opaque } from "ts-essentials";

/** An absolute path. Minted at the composition root (`abs`), so nothing inside resolves a cwd. */
export type AbsolutePath = Opaque<string, "AbsolutePath">;
