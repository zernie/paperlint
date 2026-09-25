// expect: clean
/** A port, declared in core: pure, imports nothing. */
export interface Clock {
  now(): number;
}
