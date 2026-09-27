import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { setLastProjectSlug } from "../core";
import { guarded, text } from "../result";
import { getSession } from "../session";

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    "buildtree_list_projects",
    {
      title: "List projects",
      description: "List the buildtree projects this account can upload to. Use the slug with buildtree_upload.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    guarded(async () => {
      const { client, apiUrl } = getSession();
      const projects = await client.projects.list.query();
      if (projects.length === 0) {
        return text("No projects yet. Create one with buildtree_create_project.");
      }
      const rows = projects.map(
        (p) => `- ${p.slug}  (${p.name}, created ${p.createdAt.toISOString().slice(0, 10)})  ${apiUrl}/dashboard/projects/${p.slug}`,
      );
      return text(`Projects:\n${rows.join("\n")}`);
    }),
  );

  server.registerTool(
    "buildtree_create_project",
    {
      title: "Create a project",
      description: "Create a buildtree project (one per app). Returns the slug to use in buildtree_upload.",
      inputSchema: z.object({ name: z.string().min(1).max(100).describe("Human name, e.g. the app name.") }),
    },
    guarded(async ({ name }) => {
      const { client, apiUrl } = getSession();
      const created = await client.projects.create.mutate({ name });
      setLastProjectSlug(created.slug);
      return text(
        [
          `Created project "${created.name}" with slug ${created.slug}.`,
          `Dashboard: ${apiUrl}/dashboard/projects/${created.slug}`,
        ].join("\n"),
      );
    }),
  );
}
