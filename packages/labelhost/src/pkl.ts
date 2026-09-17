import { spawnSync } from "node:child_process";

const PKL_BINARY = "pkl";
const PKL_COMMAND_TIMEOUT_MS = 30_000;

/** Override the `pkl` binary used to evaluate `.pkl` config. */
export const PKL_BIN_ENV = "LABELHOST_PKL_BIN";

/** Raised when a `.pkl` config exists but cannot be turned into config data. */
export class PklEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PklEvaluationError";
  }
}

interface PklCommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type PklCommandRunner = (bin: string, args: string[]) => PklCommandResult;

const defaultRunner: PklCommandRunner = (bin, args) => {
  const result = spawnSync(bin, args, {
    encoding: "utf-8",
    timeout: PKL_COMMAND_TIMEOUT_MS,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
};

/** The `pkl` binary to invoke, honouring the LABELHOST_PKL_BIN override. */
export function resolvePklBinary(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[PKL_BIN_ENV]?.trim();
  return override || PKL_BINARY;
}

function isMissingBinary(result: PklCommandResult): boolean {
  const code = (result.error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT";
}

function installHint(bin: string): string {
  return (
    `Could not run "${bin}". Pkl config requires the pkl CLI on PATH.\n` +
    `Install it from https://pkl-lang.org/main/current/pkl-cli/index.html, ` +
    `or set ${PKL_BIN_ENV} to its path.`
  );
}

/**
 * Evaluate a `.pkl` file to plain config data by shelling out to the pkl CLI.
 *
 * Pkl's JSON renderer omits null properties, so an unset schema property
 * arrives as absent rather than null and the existing config validation sees
 * the same shape it would get from a `.json` file.
 *
 * Throws PklEvaluationError when the CLI is missing, evaluation fails (a
 * schema violation or a syntax error), or the output is not JSON. The pkl
 * CLI's own diagnostics are passed through, since they point at the offending
 * line far better than anything reconstructed here.
 */
export function evaluatePklFile(
  filePath: string,
  options: { runner?: PklCommandRunner; env?: NodeJS.ProcessEnv } = {}
): unknown {
  const runner = options.runner ?? defaultRunner;
  const bin = resolvePklBinary(options.env ?? process.env);

  const result = runner(bin, ["eval", "--format", "json", filePath]);

  if (isMissingBinary(result)) {
    throw new PklEvaluationError(installHint(bin));
  }
  if (result.error) {
    throw new PklEvaluationError(`Failed to run "${bin}": ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new PklEvaluationError(
      detail
        ? `Could not evaluate ${filePath}:\n${detail}`
        : `Could not evaluate ${filePath} (${bin} exited with ${result.status}).`
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new PklEvaluationError(`${bin} did not produce JSON for ${filePath}.`);
  }
}
