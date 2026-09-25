// expect: boundaries/dependencies
import { late } from "../app.ts";

/** An adapter reaching up into the app layer. */
export const lateFromAdapter = (): boolean => late(0);
