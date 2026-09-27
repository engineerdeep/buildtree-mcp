/*
 * stdout is the JSON-RPC wire for a stdio MCP server. Anything else written
 * there corrupts the stream, so every console method that targets stdout is
 * redirected to stderr before any other module loads. Import this first.
 */
for (const method of ["log", "info", "debug", "trace"] as const) {
  console[method] = (...args: unknown[]) => console.error(...args);
}
