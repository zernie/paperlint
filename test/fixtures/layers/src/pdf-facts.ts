// expect: clean
import { z } from "zod";

/** A file on the LEGACY_APP ratchet keeps its libraries until #76 splits it. */
export const Shape = z.string();
