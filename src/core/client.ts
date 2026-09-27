import { createTRPCUntypedClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import type { BuildtreeApi } from "./api-types";

export type ApiClient = BuildtreeApi;

/**
 * A client for the buildtree API, typed by the hand-written `BuildtreeApi`
 * slice. Procedure paths come from property access (`client.builds.list`
 * calls `builds.list`), so there are no path strings to mistype.
 */
export function makeClient(apiUrl: string, token?: string): ApiClient {
  const untyped = createTRPCUntypedClient({
    links: [
      httpBatchLink({
        url: `${apiUrl.replace(/\/$/, "")}/api/trpc`,
        transformer: superjson,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    ],
  });
  const at = (path: string[]): unknown =>
    new Proxy(
      {},
      {
        get(_target, key) {
          if (typeof key !== "string") return undefined;
          if (key === "query") return (input?: unknown) => untyped.query(path.join("."), input);
          if (key === "mutate") return (input?: unknown) => untyped.mutation(path.join("."), input);
          return at([...path, key]);
        },
      },
    );
  return at([]) as ApiClient;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isTRPCError(err: unknown): err is TRPCClientError<any> {
  return err instanceof TRPCClientError;
}
