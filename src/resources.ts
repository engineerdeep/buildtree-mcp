import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { FRAMEWORKS } from "./content/frameworks";
import { GUIDE } from "./content/guide";

export function registerResources(server: McpServer): void {
  server.registerResource(
    "guide",
    "buildtree://guide",
    {
      title: "buildtree workflow guide",
      description: "How to take a mobile app from source to a shareable install link with the buildtree tools.",
      mimeType: "text/markdown",
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: GUIDE }] }),
  );

  server.registerResource(
    "framework",
    new ResourceTemplate("buildtree://frameworks/{framework}", {
      list: async () => ({
        resources: FRAMEWORKS.map((f) => ({
          uri: `buildtree://frameworks/${f.key}`,
          name: f.title,
          description: `Build command and artifact path for ${f.title}.`,
          mimeType: "text/markdown",
        })),
      }),
    }),
    {
      title: "Framework build recipes",
      description: "Build commands and artifact paths per framework: expo, react-native, flutter, android, ios.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const key = String(variables.framework ?? "");
      const doc = FRAMEWORKS.find((f) => f.key === key);
      const text = doc
        ? `# ${doc.title}\n\n${doc.body}`
        : `Unknown framework "${key}". Known: ${FRAMEWORKS.map((f) => f.key).join(", ")}.`;
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
    },
  );
}
