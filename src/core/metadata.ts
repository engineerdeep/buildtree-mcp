/// <reference path="./types/app-info-parser.d.ts" />
import { extname } from "node:path";
import AppInfoParser from "app-info-parser";

export interface AppMetadata {
  bundleId?: string;
  version?: string;
  buildNumber?: string;
  displayName?: string;
}

interface IpaResult {
  CFBundleIdentifier?: string;
  CFBundleShortVersionString?: string;
  CFBundleVersion?: string;
  CFBundleDisplayName?: string;
  CFBundleName?: string;
}

interface ApkResult {
  package?: string;
  versionName?: string | number;
  versionCode?: string | number;
  application?: { label?: string | string[] };
  applicationLabel?: string[];
}

/**
 * Reads metadata from a build artifact (.ipa or .apk). Returns an empty object
 * for other formats. Throws on a corrupt file; callers continue without it.
 */
export async function extractAppMetadata(filePath: string): Promise<AppMetadata> {
  const ext = extname(filePath).toLowerCase();
  if (ext !== ".apk" && ext !== ".ipa") return {};

  const parser = new AppInfoParser(filePath);
  const result = (await parser.parse()) as IpaResult & ApkResult;

  if (ext === ".ipa") {
    return {
      bundleId: result.CFBundleIdentifier,
      version: result.CFBundleShortVersionString,
      buildNumber: result.CFBundleVersion,
      displayName: result.CFBundleDisplayName ?? result.CFBundleName,
    };
  }

  const labelFromApp = result.application?.label;
  const label = Array.isArray(labelFromApp) ? labelFromApp[0] : labelFromApp;
  return {
    bundleId: result.package,
    version: stringOrUndef(result.versionName),
    buildNumber: stringOrUndef(result.versionCode),
    displayName: label ?? result.applicationLabel?.[0],
  };
}

function stringOrUndef(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v);
}
