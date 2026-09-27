import { randomBytes } from "node:crypto";
import { defaultApiUrl, setApiToken } from "./config-store";

/*
 * Browser-pair login. The CLI prints the URL, opens it and polls with a
 * spinner; the MCP server hands the URL to the agent and polls on a later
 * tool call. Both build on these three pieces.
 */

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface LoginBegin {
  pairId: string;
  url: string;
  apiUrl: string;
  expiresAt: string;
}

export async function beginLogin(opts: { apiUrl?: string } = {}): Promise<LoginBegin> {
  const apiUrl = (opts.apiUrl ?? defaultApiUrl()).replace(/\/$/, "");
  const pairId = randomBytes(16).toString("base64url");
  const res = await fetch(`${apiUrl}/api/cli/begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairId }),
  });
  if (!res.ok) {
    throw new Error(`Failed to start login: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { expiresAt?: string };
  return {
    pairId,
    url: `${apiUrl}/cli-login?pair=${encodeURIComponent(pairId)}`,
    apiUrl,
    expiresAt: data.expiresAt ?? new Date(Date.now() + DEFAULT_TIMEOUT_MS).toISOString(),
  };
}

export type LoginStatus =
  | { status: "pending" }
  | { status: "approved"; token: string }
  | { status: "expired" | "consumed" | "not_found" };

export async function pollLoginOnce(apiUrl: string, pairId: string): Promise<LoginStatus> {
  const res = await fetch(`${apiUrl}/api/cli/status?pair=${encodeURIComponent(pairId)}`);
  if (!res.ok) return { status: "pending" };
  const data = (await res.json()) as { status: string; token?: string };
  if (data.status === "approved" && typeof data.token === "string") {
    return { status: "approved", token: data.token };
  }
  if (data.status === "expired" || data.status === "consumed" || data.status === "not_found") {
    return { status: data.status };
  }
  return { status: "pending" };
}

/**
 * Polls until approved, persisting the token to the shared store. Resolves
 * `null` on timeout so callers can decide whether to keep waiting.
 */
export async function waitForLogin(opts: {
  apiUrl: string;
  pairId: string;
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
  onPoll?: (attempt: number) => void;
}): Promise<{ apiUrl: string; token: string } | null> {
  const deadline = Date.now() + (opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const interval = opts.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new Error("Login cancelled.");
    await sleep(interval);
    attempt++;
    opts.onPoll?.(attempt);
    const result = await pollLoginOnce(opts.apiUrl, opts.pairId);
    if (result.status === "approved") {
      setApiToken(result.token, opts.apiUrl);
      return { apiUrl: opts.apiUrl, token: result.token };
    }
    if (result.status !== "pending") {
      throw new Error(`Login failed: ${result.status}`);
    }
  }
  return null;
}

/** Opens a URL in the user's browser. Never throws; returns whether it worked. */
export async function openInBrowser(url: string): Promise<boolean> {
  try {
    const { default: open } = await import("open");
    await open(url);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
