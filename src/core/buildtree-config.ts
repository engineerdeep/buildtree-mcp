import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod/v4";

const PlatformConfigSchema = z.object({
  command: z.string().min(1),
  artifact: z.string().min(1),
});

const buildtreeConfigSchema = z.object({
  builds: z.record(z.string(), PlatformConfigSchema),
});

export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;
export type buildtreeConfig = z.infer<typeof buildtreeConfigSchema>;

export interface ResolvedConfig {
  config: buildtreeConfig;
  /** Directory `artifact` paths resolve against. */
  configRoot: string;
  source: "buildtree.config.json" | "package.json" | "eas-default";
}

/** Zero-config fallback for Expo projects (an `eas.json` is present). */
export const EXPO_DEFAULT: buildtreeConfig = {
  builds: {
    ios: {
      command: "eas build --local --platform ios --profile preview --output build/App.ipa",
      artifact: "build/App.ipa",
    },
    android: {
      command: "eas build --local --platform android --profile preview --output build/App.apk",
      artifact: "build/App.apk",
    },
  },
};

export async function loadbuildtreeConfig(startDir = process.cwd()): Promise<ResolvedConfig> {
  let dir = resolve(startDir);
  while (true) {
    const directConfig = await readJsonIfExists(resolve(dir, "buildtree.config.json"));
    if (directConfig) {
      return { config: buildtreeConfigSchema.parse(directConfig), configRoot: dir, source: "buildtree.config.json" };
    }
    const pkg = await readJsonIfExists(resolve(dir, "package.json"));
    if (pkg && typeof pkg === "object" && pkg !== null && "buildtree" in pkg) {
      const config = buildtreeConfigSchema.parse((pkg as { buildtree: unknown }).buildtree);
      return { config, configRoot: dir, source: "package.json" };
    }
    if (await fileExists(resolve(dir, "eas.json"))) {
      return { config: EXPO_DEFAULT, configRoot: dir, source: "eas-default" };
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        "No buildtree config found. Add a `buildtree.config.json` at your project root, or a `buildtree` field to package.json.\n\n" +
          "Example:\n" +
          '  { "builds": { "android": { "command": "./gradlew assembleRelease", "artifact": "build/app-release.apk" } } }',
      );
    }
    dir = parent;
  }
}

export function resolveArtifactPath(resolved: ResolvedConfig, platform: string): string {
  const platformConfig = resolved.config.builds[platform];
  if (!platformConfig) {
    throw new Error(
      `No build configuration for platform "${platform}". Available: ${Object.keys(resolved.config.builds).join(", ")}`,
    );
  }
  return isAbsolute(platformConfig.artifact)
    ? platformConfig.artifact
    : resolve(resolved.configRoot, platformConfig.artifact);
}

/** Writes `buildtree.config.json` in `dir`. Refuses to overwrite unless asked. */
export async function writeBuildtreeConfig(
  dir: string,
  config: buildtreeConfig,
  opts: { overwrite?: boolean } = {},
): Promise<{ path: string }> {
  const parsed = buildtreeConfigSchema.parse(config);
  const path = resolve(dir, "buildtree.config.json");
  if (!opts.overwrite && (await fileExists(path))) {
    throw new Error(`${path} already exists. Pass overwrite to replace it.`);
  }
  await writeFile(path, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
  return { path };
}

export type DetectedFramework = "expo" | "react-native" | "flutter" | "android" | "ios" | "unknown";

export interface ProjectDetection {
  framework: DetectedFramework;
  /** What the detection saw, in plain words. */
  evidence: string[];
  /** A config already in place, if any. */
  existing: ResolvedConfig | null;
  /** Suggested config for this framework, or null when nothing fits. */
  suggested: buildtreeConfig | null;
  /** Things a human still has to decide (signing, scheme names, flavors). */
  notes: string[];
}

/*
 * Suggested commands and artifact paths mirror the docs at
 * /docs/frameworks/{expo,react-native,flutter}. Keep them in sync.
 */
const SUGGESTIONS: Record<Exclude<DetectedFramework, "unknown">, { config: buildtreeConfig; notes: string[] }> = {
  expo: {
    config: EXPO_DEFAULT,
    notes: [
      "eas build --local needs the EAS CLI (npm i -g eas-cli) and an eas.json profile named preview.",
      "iOS ad-hoc builds need every tester's UDID in the provisioning profile; buildtree collects UDIDs on the project's Devices page.",
    ],
  },
  "react-native": {
    config: {
      builds: {
        ios: { command: "cd ios && fastlane build_adhoc", artifact: "ios/build/MyApp.ipa" },
        android: {
          command: "cd android && ./gradlew assembleRelease",
          artifact: "android/app/build/outputs/apk/release/app-release.apk",
        },
      },
    },
    notes: [
      "Replace MyApp.ipa with the Xcode scheme name, and build_adhoc with the Fastlane lane that exports an ad-hoc IPA (or use xcodebuild -exportArchive).",
      "assembleRelease needs a signing config in android/app/build.gradle; a debug APK (assembleDebug, app-debug.apk) also works for QA.",
    ],
  },
  flutter: {
    config: {
      builds: {
        ios: { command: "flutter build ipa --export-method ad-hoc", artifact: "build/ios/ipa/Runner.ipa" },
        android: { command: "flutter build apk --release", artifact: "build/app/outputs/flutter-apk/app-release.apk" },
      },
    },
    notes: [
      "The IPA filename matches the Xcode scheme (Runner by default).",
      "Flavored builds land under build/app/outputs/flutter-apk/<flavor>/release/app-<flavor>-release.apk.",
    ],
  },
  android: {
    config: {
      builds: {
        android: { command: "./gradlew assembleRelease", artifact: "app/build/outputs/apk/release/app-release.apk" },
      },
    },
    notes: ["assembleRelease needs a signing config; assembleDebug and app-debug.apk are fine for QA."],
  },
  ios: {
    config: {
      builds: {
        ios: { command: "fastlane build_adhoc", artifact: "build/App.ipa" },
      },
    },
    notes: [
      "Native iOS needs a Fastlane lane or an xcodebuild archive + export step that writes an ad-hoc IPA to the artifact path.",
    ],
  },
};

/** Inspects a directory and suggests a buildtree config. Filesystem only, no execution. */
export async function detectProject(dir: string): Promise<ProjectDetection> {
  const root = resolve(dir);
  const evidence: string[] = [];
  const has = async (rel: string) => fileExists(resolve(root, rel));
  const entries = await readdir(root).catch(() => [] as string[]);

  let existing: ResolvedConfig | null = null;
  try {
    const found = await loadbuildtreeConfig(root);
    if (found.source !== "eas-default") existing = found;
  } catch {
    existing = null;
  }

  const pkgRaw = await readJsonIfExists(resolve(root, "package.json"));
  const pkg = (pkgRaw ?? {}) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  let framework: DetectedFramework = "unknown";
  if ((await has("eas.json")) || "expo" in deps) {
    framework = "expo";
    if (await has("eas.json")) evidence.push("eas.json present");
    if ("expo" in deps) evidence.push("expo in package.json dependencies");
  } else if ("react-native" in deps && ((await has("android")) || (await has("ios")))) {
    framework = "react-native";
    evidence.push("react-native in package.json dependencies");
    if (await has("android")) evidence.push("android/ directory");
    if (await has("ios")) evidence.push("ios/ directory");
  } else if (await has("pubspec.yaml")) {
    framework = "flutter";
    evidence.push("pubspec.yaml present");
  } else if ((await has("settings.gradle")) || (await has("settings.gradle.kts"))) {
    framework = "android";
    evidence.push("settings.gradle at the root");
  } else if (entries.some((e) => e.endsWith(".xcworkspace") || e.endsWith(".xcodeproj")) || (await has("Podfile"))) {
    framework = "ios";
    evidence.push("Xcode project at the root");
  }

  const suggestion = framework === "unknown" ? null : SUGGESTIONS[framework];
  return {
    framework,
    evidence,
    existing,
    suggested: suggestion?.config ?? null,
    notes: suggestion?.notes ?? ["No known mobile project layout found. Write the build command and artifact path by hand."],
  };
}

async function readJsonIfExists(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
