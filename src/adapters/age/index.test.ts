/**
 * The age `Sealer` over a scripted `RunBytes`: the commands it builds, the header it checks, and each
 * way age can fail — as a value, never a throw. The real age runs in test/e2e/age/.
 */
import { describe, expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import {
  ageSealer,
  x25519Stanzas,
  type BytesCommand,
  type BytesExit,
} from "./index.ts";

const R1 = `age1${"q".repeat(58)}`;
const R2 = `age1${"p".repeat(58)}`;
const ENV = { PATH: "/usr/bin" };
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);
const header = (stanzas: number): Uint8Array =>
  bytes(
    [
      "age-encryption.org/v1",
      ...Array.from(
        { length: stanzas },
        (_, i) => `-> X25519 k${String(i)}\nbody`,
      ),
      "--- mac",
      "payload",
    ].join("\n"),
  );

/** A sealer whose age answers `exit`, and the commands it was given. */
const scripted = (exit: BytesExit) => {
  const calls: BytesCommand[] = [];
  const sealer = ageSealer((c) => {
    calls.push(c);
    return exit;
  }, ENV);
  return { sealer, calls };
};
const exited = (stdout: Uint8Array, status = 0, stderr = ""): BytesExit => ({
  kind: "exited",
  status,
  stdout,
  stderr,
});

describe("seal", () => {
  it("runs age with one -r per recipient, the plaintext on stdin, and returns the ciphertext", () => {
    const { sealer, calls } = scripted(exited(header(2)));
    // Guards: every recipient is asked, and the plaintext travels on stdin, never as a path.
    expect(sealer.seal([R1, R2], bytes("x"))).toEqual({
      ok: true,
      value: header(2),
    });
    expect(calls).toEqual([
      {
        file: "age",
        args: ["-r", R1, "-r", R2],
        stdin: bytes("x"),
        env: ENV,
        timeoutMs: 600_000,
      },
    ]);
  });

  it("refuses a ciphertext sealed to fewer recipients than asked, or not an age file", () => {
    // Guards: a seal that someone cannot open is caught when it is written, not at unsealing.
    expect(
      scripted(exited(header(1))).sealer.seal([R1, R2], bytes("x")),
    ).toEqual({
      ok: false,
      error: {
        kind: "failed",
        message: "age sealed to 1 recipients, not the 2 asked",
      },
    });
    expect(
      scripted(exited(bytes("hello"))).sealer.seal([R1], bytes("x")),
    ).toEqual({
      ok: false,
      error: {
        kind: "failed",
        message: "age wrote something that is not an age file",
      },
    });
  });
});

describe("how age can fail", () => {
  const seal = (x: BytesExit) => scripted(x).sealer.seal([R1], bytes("x"));

  it("not installed, refused with its own words or its status, or not run at all", () => {
    // Guards: each failure is a value the command turns into a message — a missing age is named as such.
    expect([
      seal({ kind: "not-found" }),
      seal(exited(new Uint8Array(), 1, "age: error: bad recipient\n")),
      seal(exited(new Uint8Array(), 3)),
      seal({ kind: "failed", message: "ended by SIGKILL" }),
    ]).toEqual([
      { ok: false, error: { kind: "missing" } },
      {
        ok: false,
        error: { kind: "failed", message: "age: error: bad recipient" },
      },
      { ok: false, error: { kind: "failed", message: "age exited 3" } },
      { ok: false, error: { kind: "failed", message: "ended by SIGKILL" } },
    ]);
  });
});

describe("x25519Stanzas", () => {
  it("counts the stanzas of an age header, and refuses one without its version line or end", () => {
    // Guards: the header check reads age's own format, not a guess.
    expect([
      x25519Stanzas(header(3)),
      x25519Stanzas(bytes("age-encryption.org/v2\n--- m")),
      x25519Stanzas(bytes("age-encryption.org/v1\n-> X25519 a")),
    ]).toEqual([3, null, null]);
  });
});

it("unseal: age -d with the identity file, the ciphertext by path, nothing on stdin", () => {
  const { sealer, calls } = scripted(exited(bytes("plain")));
  // Guards: the identity file is age's own format, passed by path; the plaintext comes back on stdout.
  expect(
    sealer.unseal(absolutePath("/k.txt"), absolutePath("/s/RESULTS.md.age")),
  ).toEqual({ ok: true, value: bytes("plain") });
  expect(calls).toEqual([
    {
      file: "age",
      args: ["-d", "-i", "/k.txt", "/s/RESULTS.md.age"],
      stdin: new Uint8Array(),
      env: ENV,
      timeoutMs: 600_000,
    },
  ]);
});
