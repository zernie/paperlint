// expect: no-restricted-globals
/** The environment read outside the composition root. */
export const home = (): string | undefined => process.env["HOME"];
