import type { CallToolResult } from "@modelcontextprotocol/server";
import { getApiUrl, normalizeError, redactTokens } from "./core";

/** A text result. Every string passes through token redaction. */
export function text(body: string): CallToolResult {
  return { content: [{ type: "text", text: redactTokens(body) }] };
}

/** A text result with a PNG image block (used for QR codes). */
export function withImage(body: string, png: Buffer, mimeType = "image/png"): CallToolResult {
  return {
    content: [
      { type: "text", text: redactTokens(body) },
      { type: "image", data: png.toString("base64"), mimeType },
    ],
  };
}

/** An error result the agent can act on: message plus the next step. */
export function fail(err: unknown, apiUrl: string): CallToolResult {
  const e = normalizeError(err, { apiUrl });
  const lines = [`${e.code}: ${e.message}`];
  if (e.hint) lines.push(`Next step: ${e.hint}`);
  return { content: [{ type: "text", text: redactTokens(lines.join("\n")) }], isError: true };
}

/** Wraps a handler so thrown errors become isError results instead of protocol failures. */
export function guarded<A>(
  run: (args: A) => Promise<CallToolResult>,
): (args: A) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return await run(args);
    } catch (err) {
      return fail(err, getApiUrl());
    }
  };
}
