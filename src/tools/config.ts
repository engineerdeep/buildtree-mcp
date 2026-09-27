import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { detectProject, writeBuildtreeConfig } from "../core";
import { guarded, text } from "../result";

export function registerConfigTools(server: McpServer): void {
  server.registerTool(
    "buildtree_detect_project",
    {
      title: "Detect the mobile project",
      description:
        "Inspect a directory (Expo, React Native, Flutter, native Android or iOS) and suggest the buildtree.config.json build commands and artifact paths. Filesystem only; runs nothing. Review the notes before writing the config.",
      inputSchema: z.object({ dir: z.string().min(1).describe("Absolute path to the app's root directory.") }),
      annotations: { readOnlyHint: true },
    },
    guarded(async ({ dir }) => {
      const d = await detectProject(dir);
      const lines = [`Framework: ${d.framework}`];
      if (d.evidence.length) lines.push(`Evidence: ${d.evidence.join("; ")}`);
      if (d.existing) {
        lines.push(`Existing config (${d.existing.source} in ${d.existing.configRoot}):`);
        lines.push("```json\n" + JSON.stringify(d.existing.config, null, 2) + "\n```");
      }
      if (d.suggested) {
        lines.push(d.existing ? "Suggested config for reference:" : "Suggested buildtree.config.json (pass `builds` to buildtree_write_config):");
        lines.push("```json\n" + JSON.stringify(d.suggested, null, 2) + "\n```");
      }
      lines.push("Notes:");
      for (const n of d.notes) lines.push(`- ${n}`);
      return text(lines.join("\n"));
    }),
  );

  server.registerTool(
    "buildtree_write_config",
    {
      title: "Write buildtree.config.json",
      description:
        "Write buildtree.config.json in a directory. `builds` maps a platform name (ios, android) to a shell command and the exact artifact path it produces (no globs). Refuses to overwrite unless overwrite is true.",
      inputSchema: z.object({
        dir: z.string().min(1).describe("Absolute path to the app's root directory."),
        builds: z
          .record(
            z.string().min(1),
            z.object({
              command: z.string().min(1).describe("Shell command run from dir."),
              artifact: z.string().min(1).describe("Path of the produced .apk/.ipa, relative to dir."),
            }),
          )
          .describe("Platform name to build definition."),
        overwrite: z.boolean().default(false),
      }),
      annotations: { idempotentHint: true },
    },
    guarded(async ({ dir, builds, overwrite }) => {
      const { path } = await writeBuildtreeConfig(dir, { builds }, { overwrite });
      return text(
        `Wrote ${path}:\n\n\`\`\`json\n${JSON.stringify({ builds }, null, 2)}\n\`\`\`\n\nNext: buildtree_build (or run the command yourself), then buildtree_upload.`,
      );
    }),
  );
}
