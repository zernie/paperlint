// expect: no-restricted-globals
/** The environment read outside the root. */
export const home = (): string | undefined => process.env["HOME"];
