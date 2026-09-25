// expect: boundaries/dependencies
import { adapterOne } from "./adapters/one/index.ts";

/** The app naming a tool instead of taking the port. */
export const measured = (): number => adapterOne.measure("x" as never);
