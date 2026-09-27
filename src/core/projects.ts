import type { ApiClient } from "./client";
import { BuildtreeError } from "./errors";

export type ProjectSummary = Awaited<ReturnType<ApiClient["projects"]["list"]["query"]>>[number];

export async function listProjects(client: ApiClient): Promise<ProjectSummary[]> {
  return client.projects.list.query();
}

export async function findProjectBySlug(client: ApiClient, slug: string): Promise<ProjectSummary> {
  const projects = await client.projects.list.query();
  const match = projects.find((p) => p.slug === slug);
  if (!match) {
    const known = projects.map((p) => p.slug).join(", ") || "(none yet)";
    throw new BuildtreeError(
      "PROJECT_NOT_FOUND",
      `Project "${slug}" not found.`,
      `Known projects: ${known}.`,
    );
  }
  return match;
}
