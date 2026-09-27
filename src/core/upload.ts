import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { ApiClient } from "./client";
import { extractAppMetadata, type AppMetadata } from "./metadata";

const CONTENT_TYPES: Record<string, string> = {
  ".apk": "application/vnd.android.package-archive",
  ".aab": "application/octet-stream",
  ".ipa": "application/octet-stream",
};

export function contentTypeFor(filename: string): string {
  return CONTENT_TYPES[extname(filename).toLowerCase()] ?? "application/octet-stream";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export interface UploadInput {
  filePath: string;
  projectId: string;
  environment: string;
  branch?: string | null;
  releaseTag?: string;
}

export type UploadPhase = "metadata" | "request" | "upload" | "confirm" | "done";

export interface UploadHooks {
  onPhase?: (phase: UploadPhase, info: { filename: string; sizeBytes: number }) => void;
  onWarning?: (message: string) => void;
}

export interface UploadOutcome {
  buildId: string;
  filename: string;
  sizeBytes: number;
  contentType: string;
  metadata: AppMetadata;
}

/**
 * The upload protocol: read metadata, ask the API for a presigned slot,
 * PUT the bytes straight to R2 (never through the API), confirm. Throws on
 * any failure; the caller maps errors for its surface.
 */
export async function uploadBuild(
  client: ApiClient,
  input: UploadInput,
  hooks: UploadHooks = {},
): Promise<UploadOutcome> {
  const filename = basename(input.filePath);
  const contentType = contentTypeFor(filename);
  const stats = await stat(input.filePath);
  if (!stats.isFile()) throw new Error(`Not a regular file: ${input.filePath}`);
  const sizeBytes = stats.size;
  const info = { filename, sizeBytes };

  hooks.onPhase?.("metadata", info);
  let metadata: AppMetadata = {};
  const ext = extname(filename).toLowerCase();
  if (ext === ".ipa" || ext === ".apk") {
    try {
      metadata = await extractAppMetadata(input.filePath);
    } catch (err) {
      hooks.onWarning?.(
        `Could not read ${ext.slice(1).toUpperCase()} metadata: ${err instanceof Error ? err.message : String(err)}. Continuing without it.`,
      );
    }
  }

  hooks.onPhase?.("request", info);
  const upload = await client.builds.requestUpload.mutate({
    projectId: input.projectId,
    environment: input.environment,
    branch: input.branch ?? undefined,
    filename,
    contentType,
    sizeBytes,
    bundleId: metadata.bundleId,
    version: metadata.version,
    buildNumber: metadata.buildNumber,
    displayName: metadata.displayName,
    releaseTag: input.releaseTag,
  });

  hooks.onPhase?.("upload", info);
  const body = await readFile(input.filePath);
  const putRes = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType, "Content-Length": String(sizeBytes) },
    body,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed: ${putRes.status} ${putRes.statusText}`);
  }

  hooks.onPhase?.("confirm", info);
  await client.builds.confirmUpload.mutate({ buildId: upload.buildId });
  hooks.onPhase?.("done", info);

  return { buildId: upload.buildId, filename, sizeBytes, contentType, metadata };
}
