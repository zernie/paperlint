// expect: boundaries/dependencies
import { late } from "../app.ts";

/** Core reaching up into the app layer. */
export const lateFromCore = (): boolean => late(0);
