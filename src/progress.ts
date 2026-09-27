import type { ServerContext } from "@modelcontextprotocol/server";
import { redactTokens } from "./core";

/**
 * Progress notifications for long tools. Only sent when the client asked for
 * them (a progressToken in the request meta); the counter is monotonic as the
 * protocol requires. Keeps Claude Code's idle timer alive during builds.
 */
export function makeProgress(ctx: ServerContext) {
  const token = ctx.mcpReq._meta?.progressToken;
  let n = 0;
  return {
    enabled: token !== undefined,
    async tick(message: string, total?: number): Promise<void> {
      if (token === undefined) return;
      n++;
      try {
        await ctx.mcpReq.notify({
          method: "notifications/progress",
          params: { progressToken: token, progress: n, total, message: redactTokens(message) },
        });
      } catch {
        // A failed notification must never fail the tool.
      }
    },
  };
}
