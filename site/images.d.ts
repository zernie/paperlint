// The type of an imported image (`import campus from "./campus.webp"`). `next build` writes the same
// reference into next-env.d.ts, but that file is git-ignored, so in a fresh checkout the lint and the
// type check run before it exists and read the import as an error-typed value.
/// <reference types="next/image-types/global" />
