// expect: boundaries/dependencies
import { z } from "zod";

/** A library in the domain: a tool's parser belongs to that tool's adapter. */
export const Shape = z.object({ n: z.number() });
