/** A program `paperlint toolchain` installed or found: present, verified, running. */

// Not exported: a `Ready` carries this property, and the one way to write it is `ready` below.
const READY = Symbol("Ready");

/**
 * Present, verified, running. BRANDED: a literal `{ where, fresh, verified }` is not a `Ready`, so
 * only an installer's adapter — one minting call each (banal's is `ready` in
 * `adapters/banal/index.ts`) — can make one, and a ready line cannot be printed without it.
 */
export interface Ready {
  /** Where it is: the program's path or its bin directory. */
  readonly where: string;
  /** This run installed it. */
  readonly fresh: boolean;
  /** What was checked before calling it ready, as a person reads it. */
  readonly verified: string;
  readonly [READY]: true;
}

/** An installer's verdict that its program is ready. Called by an installer adapter, after its checks. */
export const ready = (r: {
  readonly where: string;
  readonly fresh: boolean;
  readonly verified: string;
}): Ready => ({
  where: r.where,
  fresh: r.fresh,
  verified: r.verified,
  [READY]: true,
});
