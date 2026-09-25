/** Types for `eslint.config.mjs`, for the TypeScript tests that lint with the real configuration. */
import type { Linter } from "eslint";

export declare const IO_MODULES: readonly string[];
export declare const DOMAIN_EXTERNALS: readonly string[];
export declare const LEGACY_APP: readonly string[];
export declare const IO_GLOBALS: Linter.Config;
/** The layer block, with `boundaries/root-path` pinned to `root`. */
export declare function layerBoundaries(root: string): Linter.Config;
declare const config: Linter.Config[];
export default config;
