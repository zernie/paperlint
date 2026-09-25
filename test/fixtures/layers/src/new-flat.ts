// expect: boundaries/dependencies
import { z } from "zod";

/** A NEW flat src/*.ts file is an ordinary app file: the legacy allowance is by name. */
export const Shape = z.string();
