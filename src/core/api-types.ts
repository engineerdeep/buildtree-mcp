/*
 * The slice of the buildtree API that the CLI and the MCP server use, written
 * by hand so this package does not depend on the server's router types (and
 * can be published as source). `api-contract.check.ts` fails the monorepo
 * typecheck if the real API drifts from these shapes. Only fields a client
 * reads are listed; the server may return more.
 */

type Query<I, O> = { query: (input: I) => Promise<O> };
type QueryNoInput<O> = { query: () => Promise<O> };
type Mutation<I, O> = { mutate: (input: I) => Promise<O> };

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
}

export interface ApiOrg {
  id: string;
  name: string;
  slug: string;
  tier: string;
}

export interface ApiProject {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}

export interface ApiBuild {
  id: string;
  projectId: string;
  environment: string;
  branch: string | null;
  filename: string;
  status: string;
  sizeBytes: number | null;
  version: string | null;
  buildNumber: string | null;
  displayName: string | null;
  bundleId: string | null;
  releaseTag: string | null;
  createdAt: Date;
  uploadedAt: Date | null;
  openFeedbackCount: number;
}

export interface ApiBuildDetail {
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  environment: string;
  branch: string | null;
  filename: string;
  status: string;
  sizeBytes: number | null;
  version: string | null;
  buildNumber: string | null;
  displayName: string | null;
  bundleId: string | null;
  releaseTag: string | null;
  createdAt: Date;
}

export interface ApiRequestUploadInput {
  projectId: string;
  environment: string;
  branch?: string;
  filename: string;
  contentType?: string;
  sizeBytes?: number;
  bundleId?: string;
  version?: string;
  buildNumber?: string;
  displayName?: string;
  releaseTag?: string;
}

export interface ApiFeedbackItem {
  id: string;
  buildId: string;
  kind: string;
  message: string;
  submitterName: string;
  submitterEmail: string;
  emailSource: string;
  platform: string;
  status: string;
  createdAt: Date;
  build: {
    displayName: string | null;
    filename: string;
    version: string | null;
    buildNumber: string | null;
    environment: string;
    branch: string | null;
  };
  attachments: { id: string; url: string; contentType: string; sizeBytes: number }[];
}

export interface BuildtreeApi {
  me: {
    whoami: QueryNoInput<{ user: ApiUser }>;
    org: QueryNoInput<ApiOrg>;
  };
  projects: {
    list: QueryNoInput<ApiProject[]>;
    create: Mutation<{ name: string }, ApiProject>;
    delete: Mutation<{ projectId: string }, { deletedBuildCount: number }>;
  };
  builds: {
    list: Query<{ projectId: string }, ApiBuild[]>;
    get: Query<{ buildId: string }, ApiBuildDetail>;
    getDownloadUrl: Query<{ buildId: string; expiresIn?: number }, { url: string; filename: string }>;
    requestUpload: Mutation<ApiRequestUploadInput, { buildId: string; uploadUrl: string }>;
    confirmUpload: Mutation<{ buildId: string }, unknown>;
  };
  feedback: {
    list: Query<
      {
        projectId: string;
        buildId?: string;
        status?: "open" | "resolved";
        kind?: "bug" | "works" | "suggestion";
        limit?: number;
        cursor?: string;
      },
      { items: ApiFeedbackItem[]; nextCursor: string | null }
    >;
  };
}
