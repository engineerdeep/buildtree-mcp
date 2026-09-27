export interface InstallUrls {
  /** Installs this exact build forever. */
  pinned: string;
  /** Always the latest build for the env (and branch). */
  folder: string;
  /** Frozen to a release tag, when the build carries one. */
  release?: string;
  /** PNG QR code of the pinned URL, hosted by the site. */
  qrPng: string;
  /** Dashboard page for the build. */
  dashboardBuild: string;
}

function seg(s: string): string {
  return encodeURIComponent(s);
}

/** The install URL family for a build. Every path segment is encoded; branch slashes are kept. */
export function buildInstallUrls(p: {
  baseUrl: string;
  buildId: string;
  projectSlug: string;
  environment: string;
  branch?: string | null;
  releaseTag?: string | null;
}): InstallUrls {
  const base = p.baseUrl.replace(/\/$/, "");
  const branchPath = p.branch ? `/${p.branch.split("/").map(seg).join("/")}` : "";
  const pinnedPath = `/install/${seg(p.buildId)}`;
  return {
    pinned: `${base}${pinnedPath}`,
    folder: `${base}/install/folder/${seg(p.projectSlug)}/${seg(p.environment)}${branchPath}`,
    release: p.releaseTag ? `${base}/install/release/${seg(p.projectSlug)}/${seg(p.releaseTag)}` : undefined,
    qrPng: `${base}/api/qr?path=${encodeURIComponent(pinnedPath)}`,
    dashboardBuild: `${base}/dashboard/projects/${seg(p.projectSlug)}/builds/${seg(p.buildId)}`,
  };
}
