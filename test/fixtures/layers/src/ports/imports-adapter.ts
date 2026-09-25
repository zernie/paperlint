// expect: boundaries/dependencies
import type { adapterOne } from "../adapters/one/index.ts";

/** A port shaped by an adapter. */
export type Shaped = typeof adapterOne;
