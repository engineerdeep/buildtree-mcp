import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import type { ResolvedConfig } from "./buildtree-config";

/** Picks the platform to build, or throws with the choices when it is ambiguous. */
export function resolvePlatform(resolved: ResolvedConfig, requested?: string): string {
  const available = Object.keys(resolved.config.builds);
  if (available.length === 0) {
    throw new Error("buildtree config has no platforms defined under `builds`.");
  }
  if (requested) {
    if (!available.includes(requested)) {
      throw new Error(`Unknown platform "${requested}". Available: ${available.join(", ")}`);
    }
    return requested;
  }
  if (available.length === 1) return available[0]!;
  throw new Error(
    `Multiple platforms configured (${available.join(", ")}); pass one: buildtree build <platform>`,
  );
}

export interface RunCommandOptions {
  command: string;
  cwd: string;
  /** "inherit" streams straight to the terminal (CLI); "pipe" collects lines (MCP). */
  stdio: "inherit" | "pipe";
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** How many trailing lines to keep when piping. */
  tailLines?: number;
  onLine?: (line: string, stream: "stdout" | "stderr") => void;
}

export interface RunCommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  tail: string[];
  durationMs: number;
  timedOut: boolean;
}

/** Runs a shell command. Never throws on a non-zero exit; inspect exitCode. */
export function runBuildCommand(opts: RunCommandOptions): Promise<RunCommandResult> {
  const started = Date.now();
  const tailMax = opts.tailLines ?? 80;
  const tail: string[] = [];
  return new Promise((resolve, reject) => {
    const child = spawn(opts.command, {
      cwd: opts.cwd,
      shell: true,
      stdio: opts.stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
      env: opts.env ?? process.env,
    });
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, opts.timeoutMs)
      : null;
    const onAbort = () => child.kill("SIGTERM");
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    const push = (stream: "stdout" | "stderr") => {
      let buffer = "";
      return (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          tail.push(line);
          if (tail.length > tailMax) tail.shift();
          opts.onLine?.(line, stream);
        }
      };
    };
    child.stdout?.on("data", push("stdout"));
    child.stderr?.on("data", push("stderr"));

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("exit", (code, signal) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve({ exitCode: code, signal, tail, durationMs: Date.now() - started, timedOut });
    });
  });
}

/** Confirms the artifact exists and is a file; explains the fix when it does not. */
export async function assertArtifact(path: string): Promise<{ sizeBytes: number }> {
  try {
    const stats = await stat(path);
    if (!stats.isFile()) throw new Error(`Artifact path is not a regular file: ${path}`);
    return { sizeBytes: stats.size };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Build succeeded but artifact not found at: ${path}\n` +
          `Update the \`artifact\` field in your buildtree config to match where your build command writes its output.`,
      );
    }
    throw err;
  }
}
