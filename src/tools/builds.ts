import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { buildInstallUrls, findProjectBySlug, formatBytes, qrPngBuffer } from "../core";
import { fail, guarded, text, withImage } from "../result";
import { getSession } from "../session";
import { linksText } from "./upload";

export function registerBuildsTools(server: McpServer): void {
  server.registerTool(
    "buildtree_list_builds",
    {
      title: "List builds",
      description: "List recent builds in a project, newest first, with ids, env, branch, version and open feedback counts. Filter by env or branch.",
      inputSchema: z.object({
        project: z.string().min(1).describe("Project slug."),
        env: z.string().optional(),
        branch: z.string().optional().describe('Branch name, or "checkpoint" for branchless builds.'),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      annotations: { readOnlyHint: true },
    },
    guarded(async ({ project, env, branch, limit }) => {
      const { client, apiUrl } = getSession();
      const proj = await findProjectBySlug(client, project);
      let builds = await client.builds.list.query({ projectId: proj.id });
      if (env) builds = builds.filter((b) => b.environment === env);
      if (branch) builds = builds.filter((b) => (branch === "checkpoint" ? b.branch === null : b.branch === branch));
      builds = builds.slice(0, limit);
      if (builds.length === 0) return text(`No builds in ${proj.slug}${env ? ` for env ${env}` : ""}${branch ? ` on ${branch}` : ""}.`);
      const rows = builds.map((b) => {
        const version = b.version ? `v${b.version}${b.buildNumber ? ` (${b.buildNumber})` : ""}` : b.filename;
        const fb = b.openFeedbackCount > 0 ? `, ${b.openFeedbackCount} open feedback` : "";
        return `- ${b.id}  ${b.environment}/${b.branch ?? "checkpoint"}  ${b.status}  ${version}  ${b.sizeBytes ? formatBytes(b.sizeBytes) : ""}  ${b.createdAt.toISOString().slice(0, 10)}${fb}`;
      });
      return text(`Builds in ${proj.slug} (${apiUrl}/dashboard/projects/${proj.slug}):\n${rows.join("\n")}\n\nUse buildtree_get_install_links with a build id for its URLs and QR.`);
    }),
  );

  server.registerTool(
    "buildtree_get_install_links",
    {
      title: "Get install links",
      description: "Install URLs and a QR code for an existing build id.",
      inputSchema: z.object({
        buildId: z.uuid(),
        qr: z.boolean().default(true),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ buildId, qr }) => {
      let apiUrl = "https://buildtree.sh";
      try {
        const session = getSession();
        apiUrl = session.apiUrl;
        const b = await session.client.builds.get.query({ buildId });
        const urls = buildInstallUrls({
          baseUrl: apiUrl,
          buildId: b.id,
          projectSlug: b.projectSlug,
          environment: b.environment,
          branch: b.branch,
          releaseTag: b.releaseTag,
        });
        const appLabel = `${b.displayName ?? b.projectName}${b.version ? ` v${b.version}` : ""}${b.buildNumber ? ` (${b.buildNumber})` : ""}`;
        const body = [
          `${appLabel} in ${b.projectSlug} / ${b.environment}${b.branch ? ` / ${b.branch}` : " (checkpoint)"}, status ${b.status}.`,
          "",
          linksText({ appLabel, urls, environment: b.environment, branch: b.branch, releaseTag: b.releaseTag }),
        ].join("\n");
        if (!qr) return text(body);
        return withImage(body, await qrPngBuffer(urls.pinned, { width: 320 }));
      } catch (err) {
        return fail(err, apiUrl);
      }
    },
  );
}
