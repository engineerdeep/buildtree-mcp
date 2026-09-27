import Conf from "conf";

interface Schema {
  apiUrl?: string;
  apiToken?: string;
  tokenPrefix?: string;
  lastProjectSlug?: string;
  lastBuildArtifact?: string;
  lastBuildPlatform?: string;
}

/**
 * Persistent config shared by the CLI and the MCP server (same `conf`
 * project name, so one `buildtree login` serves both). On macOS this is
 * ~/Library/Preferences/buildtree-nodejs/config.json.
 */
export const config = new Conf<Schema>({ projectName: "buildtree" });

export const DEFAULT_API_URL = "https://buildtree.sh";

/*
 * Hosts that inject settings as environment variables (Claude Desktop
 * bundles, CI templates) can pass an unset option as an empty string or an
 * unexpanded placeholder such as "${user_config.buildtree_token}". Only
 * values that look real are honored; anything else falls through to the
 * stored login.
 */
function envApiUrl(): string | undefined {
  const v = process.env.BUILDTREE_API_URL?.trim();
  return v && /^https?:\/\/[^\s$]+$/.test(v) ? v.replace(/\/$/, "") : undefined;
}

function envToken(): string | undefined {
  const v = process.env.BUILDTREE_TOKEN?.trim();
  return v && /^bt_[A-Za-z0-9_-]{8,}$/.test(v) ? v : undefined;
}

/** The URL a fresh login should target: explicit env, else production. */
export function defaultApiUrl(): string {
  return envApiUrl() ?? DEFAULT_API_URL;
}

/**
 * Explicit environment wins over whatever `buildtree login` stored, so a CI
 * job or a dev pointing at a local server never has to clear the config file.
 */
export function getApiUrl(): string {
  return envApiUrl() ?? config.get("apiUrl") ?? DEFAULT_API_URL;
}

export interface StoredToken {
  token: string;
  source: "env" | "store";
}

/** `BUILDTREE_TOKEN` (CI) takes precedence over the token persisted by login. */
export function getApiToken(): StoredToken | undefined {
  const fromEnv = envToken();
  if (fromEnv) return { token: fromEnv, source: "env" };
  const stored = config.get("apiToken");
  return stored ? { token: stored, source: "store" } : undefined;
}

export function setApiToken(token: string, apiUrl: string): void {
  config.set("apiUrl", apiUrl);
  config.set("apiToken", token);
  config.set("tokenPrefix", token.slice(0, 12));
}

export function clearApiToken(): void {
  config.delete("apiToken");
  config.delete("tokenPrefix");
}

export function getLastProjectSlug(): string | undefined {
  return config.get("lastProjectSlug");
}

export function setLastProjectSlug(slug: string): void {
  config.set("lastProjectSlug", slug);
}

export function getLastBuildArtifact(): { path: string; platform?: string } | undefined {
  const path = config.get("lastBuildArtifact");
  if (!path) return undefined;
  return { path, platform: config.get("lastBuildPlatform") };
}

export function setLastBuildArtifact(path: string, platform: string): void {
  config.set("lastBuildArtifact", path);
  config.set("lastBuildPlatform", platform);
}
