import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { GUIDE } from "./content/guide";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "setup",
    {
      title: "Set up buildtree for this app",
      description: "Walk the user from source to a shareable install link and QR code.",
      argsSchema: z.object({
        dir: z.string().optional().describe("App directory (defaults to the working directory)."),
        env: z.string().optional().describe("Environment to publish to (default dev)."),
      }),
    },
    async ({ dir, env }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Set up buildtree for the app in ${dir ?? "the current directory"} and give me an install link and QR code for the ${env ?? "dev"} environment.`,
              "Follow the buildtree guide below. Confirm the build command with me before running anything that signs or uploads.",
              "",
              GUIDE,
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
