import { describe, expect, it } from "vitest";
import {
  evaluatePklFile,
  PklEvaluationError,
  PKL_BIN_ENV,
  resolvePklBinary,
  type PklCommandRunner,
} from "./pkl.js";

function runner(
  result: Partial<{ status: number | null; stdout: string; stderr: string; error: Error }>,
  calls?: { bin: string; args: string[] }[]
): PklCommandRunner {
  return (bin, args) => {
    calls?.push({ bin, args });
    return {
      status: result.status ?? 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      error: result.error,
    };
  };
}

function enoent(): Error {
  const err = new Error("spawnSync pkl ENOENT") as NodeJS.ErrnoException;
  err.code = "ENOENT";
  return err;
}

describe("resolvePklBinary", () => {
  it("defaults to pkl on PATH", () => {
    expect(resolvePklBinary({})).toBe("pkl");
  });

  it("honours the binary override", () => {
    expect(resolvePklBinary({ [PKL_BIN_ENV]: "/opt/pkl/bin/pkl" })).toBe("/opt/pkl/bin/pkl");
  });

  it("ignores a blank override", () => {
    expect(resolvePklBinary({ [PKL_BIN_ENV]: "   " })).toBe("pkl");
  });
});

describe("evaluatePklFile", () => {
  it("renders the file as JSON via the pkl CLI", () => {
    const calls: { bin: string; args: string[] }[] = [];
    const result = evaluatePklFile("/repo/labelhost.pkl", {
      runner: runner({ stdout: '{"name":"myapp"}' }, calls),
      env: {},
    });

    expect(result).toEqual({ name: "myapp" });
    expect(calls).toEqual([
      { bin: "pkl", args: ["eval", "--format", "json", "/repo/labelhost.pkl"] },
    ]);
  });

  it("uses the overridden binary", () => {
    const calls: { bin: string; args: string[] }[] = [];
    evaluatePklFile("/repo/labelhost.pkl", {
      runner: runner({ stdout: "{}" }, calls),
      env: { [PKL_BIN_ENV]: "/opt/pkl" },
    });

    expect(calls[0]!.bin).toBe("/opt/pkl");
  });

  it("explains how to install pkl when the binary is missing", () => {
    expect(() =>
      evaluatePklFile("/repo/labelhost.pkl", { runner: runner({ error: enoent() }), env: {} })
    ).toThrow(PklEvaluationError);

    try {
      evaluatePklFile("/repo/labelhost.pkl", { runner: runner({ error: enoent() }), env: {} });
    } catch (err) {
      expect((err as Error).message).toContain("pkl-lang.org");
      expect((err as Error).message).toContain(PKL_BIN_ENV);
    }
  });

  it("passes through pkl's own diagnostics on a failed evaluation", () => {
    try {
      evaluatePklFile("/repo/labelhost.pkl", {
        runner: runner({
          status: 1,
          stderr: "–– Pkl Error ––\nCannot find property `nmae` in module `Labelhost`.",
        }),
        env: {},
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PklEvaluationError);
      expect((err as Error).message).toContain("Cannot find property `nmae`");
      expect((err as Error).message).toContain("/repo/labelhost.pkl");
    }
  });

  it("still reports a non-zero exit that produced no output", () => {
    expect(() =>
      evaluatePklFile("/repo/labelhost.pkl", { runner: runner({ status: 2 }), env: {} })
    ).toThrow(/exited with 2/);
  });

  it("reports a spawn failure that is not a missing binary", () => {
    expect(() =>
      evaluatePklFile("/repo/labelhost.pkl", {
        runner: runner({ error: new Error("EACCES") }),
        env: {},
      })
    ).toThrow(/Failed to run "pkl": EACCES/);
  });

  it("rejects output that is not JSON", () => {
    expect(() =>
      evaluatePklFile("/repo/labelhost.pkl", { runner: runner({ stdout: "name = 1" }), env: {} })
    ).toThrow(/did not produce JSON/);
  });
});
