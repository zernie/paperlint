/** Removing a file — the one effect `Files` does not have, used by `paperlint studies seal` to drop a plaintext. */
import type { AbsolutePath } from "../domain/paths.ts";

/** Remove the file at `p`; nothing when there is none. */
export type RemoveFile = (p: AbsolutePath) => void;
