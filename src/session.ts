import {
  BuildtreeError,
  getApiToken,
  getApiUrl,
  makeClient,
  type ApiClient,
  type LoginBegin,
} from "./core";

export interface Session {
  client: ApiClient;
  apiUrl: string;
  source: "env" | "store";
}

/** The authenticated client, or a NOT_LOGGED_IN error that names the login tools. */
export function getSession(): Session {
  const token = getApiToken();
  if (!token) {
    throw new BuildtreeError(
      "NOT_LOGGED_IN",
      "Not logged in to buildtree.",
      "Call buildtree_login, ask the user to approve in the browser, then buildtree_login_status. In CI, set BUILDTREE_TOKEN instead.",
    );
  }
  return { client: makeClient(getApiUrl(), token.token), apiUrl: getApiUrl(), source: token.source };
}

/** Login attempts started by buildtree_login, keyed by pair id, for buildtree_login_status. */
export const pendingLogins = new Map<string, LoginBegin>();
