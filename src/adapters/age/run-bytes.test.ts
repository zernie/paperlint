/**
 * `spawnBytes` against the real `spawnSync`, with /bin/sh standing in for age: bytes in and out
 * unchanged, and each way a program can end as a value. The only age-adapter test with real I/O.
 */
import { describe, expect, it } from "vitest";
import { spawnBytes } from "./run-bytes.io.ts";

const sh = (script: string, stdin = new Uint8Array(), timeoutMs = 10_000) =>
  spawnBytes({
    file: "/bin/sh",
    args: ["-c", script],
    stdin,
    env: { PATH: "/usr/bin:/bin" },
    timeoutMs,
  });

describe("spawnBytes", () => {
  it("stdin reaches the program and stdout comes back byte for byte, with the status and stderr", () => {
    const all = new Uint8Array(Array.from({ length: 256 }, (_, i) => i));
    // Guards: binary ciphertext survives the trip — no text decoding on the way.
    expect(sh("cat; echo err >&2; exit 4", all)).toEqual({
      kind: "exited",
      status: 4,
      stdout: all,
      stderr: "err\n",
    });
  });

  it("a program that is not there is not-found; one that is killed or hangs is failed", () => {
    // Guards: a missing age is told apart from an age that failed.
    expect(
      spawnBytes({
        file: "paperlint-no-such-age",
        args: [],
        stdin: new Uint8Array(),
        env: {},
        timeoutMs: 1000,
      }),
    ).toEqual({ kind: "not-found" });
    expect(sh("kill -TERM $$")).toEqual({
      kind: "failed",
      message: "ended by SIGTERM",
    });
    expect(sh("sleep 5", new Uint8Array(), 50).kind).toBe("failed");
  });
});
