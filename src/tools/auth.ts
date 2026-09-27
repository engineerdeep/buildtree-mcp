import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  beginLogin,
  getApiToken,
  getApiUrl,
  openInBrowser,
  pollLoginOnce,
  setApiToken,
  TIER_LABELS,
} from "../core";
import { makeProgress } from "../progress";
import { fail, guarded, text } from "../result";
import { getSession, pendingLogins } from "../session";

export function registerAuthTools(server: McpServer): void {
  server.registerTool(
    "buildtree_whoami",
    {
      title: "Who am I",
      description:
        "Check the buildtree login and account: email, organization, plan and limits. Call this first. If it reports not logged in, use buildtree_login.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    guarded(async () => {
      const session = getSession();
      const [me, org] = await Promise.all([
        session.client.me.whoami.query(),
        session.client.me.org.query(),
      ]);
      const tier = TIER_LABELS[org.tier] ?? org.tier;
      return text(
        [
          `Logged in as ${me.user.email} (token from ${session.source === "env" ? "BUILDTREE_TOKEN" : "buildtree login"}).`,
          `Organization: ${org.name} on the ${tier} plan.`,
          `API: ${session.apiUrl}`,
        ].join("\n"),
      );
    }),
  );

  server.registerTool(
    "buildtree_login",
    {
      title: "Log in to buildtree",
      description:
        "Start a browser login. Returns a URL the user must open and approve (the tool also tries to open it). Then call buildtree_login_status with the pairId. Never returns a token.",
      inputSchema: z.object({
        apiUrl: z.url().optional().describe("Override the API origin (default https://buildtree.sh or BUILDTREE_API_URL)."),
      }),
    },
    guarded(async ({ apiUrl }) => {
      const existing = getApiToken();
      if (existing && !apiUrl) {
        try {
          const session = getSession();
          const me = await session.client.me.whoami.query();
          return text(`Already logged in as ${me.user.email}. Call buildtree_whoami for details.`);
        } catch {
          // Stored token is stale; fall through to a fresh login.
        }
      }
      const begin = await beginLogin({ apiUrl });
      pendingLogins.set(begin.pairId, begin);
      const opened = await openInBrowser(begin.url);
      return text(
        [
          opened
            ? "A browser window should have opened."
            : "Could not open a browser on this machine.",
          `Ask the user to open ${begin.url} and approve the login (it expires at ${begin.expiresAt}).`,
          `Then call buildtree_login_status with pairId "${begin.pairId}".`,
        ].join("\n"),
      );
    }),
  );

  server.registerTool(
    "buildtree_login_status",
    {
      title: "Check login approval",
      description:
        "Wait for a login started by buildtree_login to be approved. Polls for up to waitSeconds and stores the token for this machine (shared with the buildtree CLI). Call again while it reports pending.",
      inputSchema: z.object({
        pairId: z.string().min(16).max(64),
        waitSeconds: z.number().int().min(0).max(120).default(45),
      }),
    },
    async ({ pairId, waitSeconds }, ctx) => {
      const begin = pendingLogins.get(pairId);
      const apiUrl = begin?.apiUrl ?? getApiUrl();
      const progress = makeProgress(ctx);
      const deadline = Date.now() + waitSeconds * 1000;
      let attempt = 0;
      try {
        do {
          attempt++;
          const result = await pollLoginOnce(apiUrl, pairId);
          if (result.status === "approved") {
            setApiToken(result.token, apiUrl);
            pendingLogins.delete(pairId);
            const session = getSession();
            const me = await session.client.me.whoami.query();
            return text(`Logged in as ${me.user.email}. The buildtree CLI on this machine shares this login.`);
          }
          if (result.status !== "pending") {
            pendingLogins.delete(pairId);
            return fail(new Error(`Login ${result.status}. Call buildtree_login to start again.`), apiUrl);
          }
          await progress.tick(`Waiting for approval (${attempt})`);
          if (ctx.mcpReq.signal.aborted) break;
          if (Date.now() < deadline) await new Promise((r) => setTimeout(r, 2000));
        } while (Date.now() < deadline);
        return text("Still pending. Ask the user to approve in the browser, then call buildtree_login_status again.");
      } catch (err) {
        return fail(err, apiUrl);
      }
    },
  );
}
