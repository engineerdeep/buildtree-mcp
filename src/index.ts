#!/usr/bin/env node
import "./stdout-guard";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server";

const version = typeof __MCP_VERSION__ === "string" ? __MCP_VERSION__ : "dev";

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  process.stdout.write(`${version}\n`);
  process.exit(0);
}
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(
    [
      `buildtree-mcp ${version}`,
      "",
      "MCP server for buildtree (stdio). Add it to your agent:",
      "  claude mcp add --transport stdio buildtree -- npx -y @buildtree/mcp",
      "",
      "Environment:",
      "  BUILDTREE_TOKEN     API token (CI); otherwise the buildtree_login tool signs in",
      "  BUILDTREE_API_URL   API origin (default https://buildtree.sh)",
      "",
      "Docs: https://buildtree.sh/docs/mcp",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

const handle = serveStdio(() => createServer(version), {
  onerror: (err) => console.error("[buildtree-mcp]", err.message),
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void handle.close().finally(() => process.exit(0));
  });
}
