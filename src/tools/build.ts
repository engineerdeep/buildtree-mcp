import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  assertArtifact,
  formatBytes,
  loadbuildtreeConfig,
  resolveArtifactPath,
  resolvePlatform,
  runBuildCommand,
  setLastBuildArtifact,
} from "../core";
import { makeProgress } from "../progress";
import { fail, text } from "../result";

const DESCRIPTION = `Run the build command from buildtree.config.json for one platform and record the artifact for buildtree_upload.
Builds take 5 to 30 minutes. Progress notifications keep long-running clients alive, but some clients enforce a short per-tool timeout (Codex defaults to 60 seconds). If yours may time out, run the command yourself in a shell instead (for example \`npx @buildtree/cli build android\`) and then call buildtree_upload with the artifact path.`;

export function registerBuildTool(server: McpServer): void {
  server.registerTool(
    "buildtree_build",
    {
      title: "Run the configured build",
      description: DESCRIPTION,
      inputSchema: z.object({
        dir: z.string().min(1).describe("Absolute path to the app's root directory (where buildtree.config.json lives)."),
        platform: z.string().optional().describe("Platform key from the config, e.g. ios or android. Optional when only one is configured."),
        timeoutSeconds: z.number().int().min(30).max(7200).default(3600),
        tailLines: z.number().int().min(10).max(500).default(80),
      }),
    },
    async ({ dir, platform, timeoutSeconds, tailLines }, ctx) => {
      const progress = makeProgress(ctx);
      try {
        const resolved = await loadbuildtreeConfig(dir);
        const chosen = resolvePlatform(resolved, platform);
        const command = resolved.config.builds[chosen]!.command;
        const started = Date.now();
        const logDir = join(tmpdir(), "buildtree-mcp");
        await mkdir(logDir, { recursive: true });
        const logPath = join(logDir, `build-${chosen}-${started}.log`);
        const all: string[] = [];
        let lastTick = 0;

        await progress.tick(`Running: ${command}`);
        const run = await runBuildCommand({
          command,
          cwd: resolved.configRoot,
          stdio: "pipe",
          env: { ...process.env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
          signal: ctx.mcpReq.signal,
          timeoutMs: timeoutSeconds * 1000,
          tailLines,
          onLine: (line) => {
            all.push(line);
            const now = Date.now();
            if (now - lastTick > 5000) {
              lastTick = now;
              void progress.tick(`${Math.round((now - started) / 1000)}s: ${line.slice(0, 120)}`);
            }
          },
        });
        await writeFile(logPath, all.join("\n") + "\n", "utf-8").catch(() => {});

        const seconds = Math.round(run.durationMs / 1000);
        const tail = run.tail.length ? "```\n" + run.tail.join("\n") + "\n```" : "(no output)";
        if (run.timedOut) {
          return {
            content: [{ type: "text", text: `Build timed out after ${seconds}s. Full log: ${logPath}\n\nLast lines:\n${tail}` }],
            isError: true,
          };
        }
        if (run.exitCode !== 0) {
          return {
            content: [
              {
                type: "text",
                text: `Build failed with exit code ${run.exitCode ?? run.signal ?? "unknown"} after ${seconds}s. Full log: ${logPath}\n\nLast ${run.tail.length} lines:\n${tail}`,
              },
            ],
            isError: true,
          };
        }

        const artifactPath = resolveArtifactPath(resolved, chosen);
        const { sizeBytes } = await assertArtifact(artifactPath);
        setLastBuildArtifact(artifactPath, chosen);
        return text(
          [
            `Build for ${chosen} succeeded in ${seconds}s.`,
            `Artifact: ${artifactPath} (${formatBytes(sizeBytes)})`,
            `Full log: ${logPath}`,
            "",
            "Next: buildtree_upload (file defaults to this artifact).",
            "",
            `Last lines:\n${tail}`,
          ].join("\n"),
        );
      } catch (err) {
        return fail(err, "https://buildtree.sh");
      }
    },
  );
}
