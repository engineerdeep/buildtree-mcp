import { resolve } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  buildInstallUrls,
  findProjectBySlug,
  formatBytes,
  getLastBuildArtifact,
  getLastProjectSlug,
  qrPngBuffer,
  setLastProjectSlug,
  uploadBuild,
  type InstallUrls,
} from "../core";
import { makeProgress } from "../progress";
import { fail, text, withImage } from "../result";
import { getSession } from "../session";

export function linksText(opts: {
  appLabel: string;
  urls: InstallUrls;
  environment: string;
  branch: string | null;
  releaseTag?: string | null;
}): string {
  const lines = [
    `Pinned install URL (this exact build): ${opts.urls.pinned}`,
    `Folder URL (always the latest in ${opts.environment}${opts.branch ? `/${opts.branch}` : ", the checkpoint"}): ${opts.urls.folder}`,
  ];
  if (opts.urls.release) lines.push(`Release URL (frozen to ${opts.releaseTag}): ${opts.urls.release}`);
  lines.push(`QR code PNG: ${opts.urls.qrPng}`);
  lines.push(`Dashboard: ${opts.urls.dashboardBuild}`);
  lines.push("");
  lines.push(`Share line: Install ${opts.appLabel}: ${opts.urls.pinned}`);
  lines.push("The QR image below encodes the pinned URL; testers scan it with their phone camera.");
  return lines.join("\n");
}

export function registerUploadTools(server: McpServer): void {
  server.registerTool(
    "buildtree_upload",
    {
      title: "Upload a build",
      description:
        "Upload an .apk, .aab or .ipa to a buildtree project and get back install URLs plus a QR code image. Omit `branch` to publish the environment's checkpoint (the build QA should grab); pass `branch` for a pre-merge preview. `file` defaults to the artifact from the last buildtree_build.",
      inputSchema: z.object({
        file: z.string().optional().describe("Absolute path to the .apk/.aab/.ipa. Defaults to the last built artifact."),
        project: z.string().optional().describe("Project slug (see buildtree_list_projects). Defaults to the last used project."),
        env: z.string().min(1).max(50).describe("Environment, e.g. dev, staging, prod."),
        branch: z.string().max(200).optional().describe("Branch or feature name for a pre-merge preview. Omit for the env checkpoint."),
        release: z.string().min(1).max(100).optional().describe("Release tag, e.g. v1.5.0, to also get a frozen release URL."),
        qr: z.boolean().default(true).describe("Include the QR code image in the result."),
      }),
    },
    async ({ file, project, env, branch, release, qr }, ctx) => {
      let apiUrl = "https://buildtree.sh";
      try {
        const session = getSession();
        apiUrl = session.apiUrl;
        const progress = makeProgress(ctx);

        const filePath = file ? resolve(file) : getLastBuildArtifact()?.path;
        if (!filePath) {
          return fail(new Error("No file given and no artifact from a previous buildtree_build. Pass `file`."), apiUrl);
        }
        const slug = project ?? getLastProjectSlug();
        if (!slug) {
          return fail(new Error("No project given. Pass `project` (see buildtree_list_projects) or create one with buildtree_create_project."), apiUrl);
        }
        const proj = await findProjectBySlug(session.client, slug);
        setLastProjectSlug(proj.slug);

        const result = await uploadBuild(
          session.client,
          { filePath, projectId: proj.id, environment: env, branch: branch ?? null, releaseTag: release },
          {
            onPhase: (phase, info) => {
              void progress.tick(
                phase === "upload"
                  ? `Uploading ${info.filename} (${formatBytes(info.sizeBytes)})`
                  : `${phase} ${info.filename}`,
              );
            },
          },
        );

        const urls = buildInstallUrls({
          baseUrl: apiUrl,
          buildId: result.buildId,
          projectSlug: proj.slug,
          environment: env,
          branch: branch ?? null,
          releaseTag: release ?? null,
        });
        const m = result.metadata;
        const appLabel = `${m.displayName ?? proj.name}${m.version ? ` v${m.version}` : ""}${m.buildNumber ? ` (${m.buildNumber})` : ""}`;
        const header = [
          `Uploaded ${result.filename} (${formatBytes(result.sizeBytes)}) to ${proj.slug} / ${env}${branch ? ` / ${branch}` : " (checkpoint)"}.`,
          `Build id: ${result.buildId}`,
          m.bundleId ? `App: ${appLabel}, ${m.bundleId}` : `App: ${appLabel}`,
          "",
          linksText({ appLabel, urls, environment: env, branch: branch ?? null, releaseTag: release }),
        ].join("\n");

        if (!qr) return text(header);
        const png = await qrPngBuffer(urls.pinned, { width: 320 });
        return withImage(header, png);
      } catch (err) {
        return fail(err, apiUrl);
      }
    },
  );
}
