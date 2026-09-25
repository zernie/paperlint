// expect: boundaries/dependencies
import { run } from "../../app/use-case.ts";

/** An adapter reaching up into the app layer. */
export const upward = run;
