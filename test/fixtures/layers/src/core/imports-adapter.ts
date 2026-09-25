// expect: boundaries/dependencies
import { systemClock } from "../adapters/clock.ts";

/** Core reaching into an adapter instead of taking the port. */
export const nowFromCore = (): number => systemClock.now();
