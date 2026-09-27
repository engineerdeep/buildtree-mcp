import { TRPCClientError } from "@trpc/client";

export type BuildtreeErrorCode =
  | "NOT_LOGGED_IN"
  | "PROJECT_NOT_FOUND"
  | "LIMIT_REACHED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NETWORK"
  | "INVALID_INPUT"
  | "UNKNOWN";

/** A user-facing failure with a stable code and an optional next step. */
export class BuildtreeError extends Error {
  constructor(
    public readonly code: BuildtreeErrorCode,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "BuildtreeError";
  }
}

/** Turn tRPC and fetch failures into a BuildtreeError with a code the caller can act on. */
export function normalizeError(err: unknown, ctx: { apiUrl: string }): BuildtreeError {
  if (err instanceof BuildtreeError) return err;
  if (err instanceof TRPCClientError) {
    const code = (err.data as { code?: string } | undefined)?.code;
    const message = err.message;
    if (code === "UNAUTHORIZED") {
      return new BuildtreeError(
        "NOT_LOGGED_IN",
        "Not logged in, or the token was revoked.",
        "Run `buildtree login`, or set BUILDTREE_TOKEN to an API token from the dashboard.",
      );
    }
    if (code === "FORBIDDEN" && /limit reached/i.test(message)) {
      return new BuildtreeError(
        "LIMIT_REACHED",
        message,
        `Delete old builds or upgrade the plan at ${ctx.apiUrl}/pricing.`,
      );
    }
    if (code === "FORBIDDEN") return new BuildtreeError("FORBIDDEN", message);
    if (code === "NOT_FOUND") return new BuildtreeError("NOT_FOUND", message);
    if (code === "BAD_REQUEST") return new BuildtreeError("INVALID_INPUT", message);
    return new BuildtreeError("UNKNOWN", message);
  }
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return new BuildtreeError(
      "NETWORK",
      `Cannot reach ${ctx.apiUrl}.`,
      "Check the connection, or BUILDTREE_API_URL if you point at another server.",
    );
  }
  return new BuildtreeError("UNKNOWN", err instanceof Error ? err.message : String(err));
}

/** Masks API tokens in any text that might be shown or logged. */
export function redactTokens(text: string): string {
  return text.replace(/bt_[A-Za-z0-9_-]{8,}/g, "bt_***");
}
