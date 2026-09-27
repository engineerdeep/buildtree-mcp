# buildtree MCP server

[![npm](https://img.shields.io/npm/v/@buildtree/mcp)](https://www.npmjs.com/package/@buildtree/mcp)

MCP server for [buildtree](https://buildtree.sh), the fastest way to share Android and iOS builds with testers. Let your AI coding agent set up buildtree for your app, run the build, upload the `.apk` or `.ipa`, and hand you an install link and QR code to share. It can also read the feedback and screenshots testers send back.

Works with Expo, React Native, Flutter, and native Android and iOS apps, in Claude Code, Claude Desktop, Codex, Gemini CLI, Cursor and Windsurf.

> "Set up buildtree for this app and give me a QR code for an Android build."

## Install

**Claude Code**

```bash
claude mcp add --transport stdio buildtree -- npx -y @buildtree/mcp
```

**Claude Desktop**: download `buildtree-mcp-<version>.mcpb` from the [latest release](https://github.com/engineerdeep/buildtree-mcp/releases/latest) and double-click it. Or add the JSON below to `claude_desktop_config.json`.

**Codex CLI** (`~/.codex/config.toml`)

```toml
[mcp_servers.buildtree]
command = "npx"
args = ["-y", "@buildtree/mcp"]
tool_timeout_sec = 1800
```

**Gemini CLI, Cursor, Windsurf, Claude Desktop (JSON)**

```json
{
  "mcpServers": {
    "buildtree": { "command": "npx", "args": ["-y", "@buildtree/mcp"] }
  }
}
```

Requires Node 20 or later.

## Tools

| Tool | What it does |
|---|---|
| `buildtree_whoami` | Account, organization and plan |
| `buildtree_login`, `buildtree_login_status` | Browser login, shared with the buildtree CLI |
| `buildtree_list_projects`, `buildtree_create_project` | One project per app |
| `buildtree_detect_project` | Detects Expo, React Native, Flutter or native and suggests build commands |
| `buildtree_write_config` | Writes `buildtree.config.json` |
| `buildtree_build` | Runs the build with progress updates |
| `buildtree_upload` | Uploads the build; returns install links and a QR code image |
| `buildtree_list_builds`, `buildtree_get_install_links` | Browse builds, get links and QR for any build |
| `buildtree_list_feedback` | Tester feedback with screenshots |

Resources: `buildtree://guide` (the workflow) and `buildtree://frameworks/{expo|react-native|flutter|android|ios}` (build recipes). Prompt: `setup`.

## Sign in

The first time, your agent opens a browser page where you approve the connection. The login is stored where the `buildtree` CLI keeps its own, so either can sign in for both. In CI, set `BUILDTREE_TOKEN` to an API token from the buildtree dashboard. Tokens never appear in tool output.

## Links

- Docs: https://buildtree.sh/docs/mcp
- How to share a build with testers: https://buildtree.sh/docs/guides/share-app-with-testers
- CLI: [`@buildtree/cli`](https://www.npmjs.com/package/@buildtree/cli)
- Support: hello@buildtree.sh

MIT licensed.
