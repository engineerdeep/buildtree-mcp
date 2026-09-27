export interface FrameworkDoc {
  key: string;
  title: string;
  body: string;
}

/* Mirrors https://buildtree.sh/docs/frameworks/*. Keep in sync with the docs. */
export const FRAMEWORKS: FrameworkDoc[] = [
  {
    key: "expo",
    title: "Expo",
    body: `Zero-config: if eas.json exists and no buildtree config is set, buildtree uses:
  ios:     eas build --local --platform ios --profile preview --output build/App.ipa   -> build/App.ipa
  android: eas build --local --platform android --profile preview --output build/App.apk -> build/App.apk
Pin the output path with --output so the artifact path is predictable. eas build --local needs the EAS CLI and an eas.json profile (preview here). Ad-hoc iOS builds need tester UDIDs in the provisioning profile.`,
  },
  {
    key: "react-native",
    title: "React Native (bare)",
    body: `buildtree.config.json:
{
  "builds": {
    "ios":     { "command": "cd ios && fastlane build_adhoc", "artifact": "ios/build/MyApp.ipa" },
    "android": { "command": "cd android && ./gradlew assembleRelease", "artifact": "android/app/build/outputs/apk/release/app-release.apk" }
  }
}
Replace MyApp.ipa with the Xcode scheme name and build_adhoc with a Fastlane lane that exports an ad-hoc IPA (or xcodebuild archive + -exportArchive). assembleRelease needs a signing config; assembleDebug (app-debug.apk) is fine for QA.`,
  },
  {
    key: "flutter",
    title: "Flutter",
    body: `buildtree.config.json:
{
  "builds": {
    "ios":     { "command": "flutter build ipa --export-method ad-hoc", "artifact": "build/ios/ipa/Runner.ipa" },
    "android": { "command": "flutter build apk --release", "artifact": "build/app/outputs/flutter-apk/app-release.apk" }
  }
}
The IPA name matches the Xcode scheme (Runner by default). Flavors: flutter build apk --flavor staging --release writes build/app/outputs/flutter-apk/staging/release/app-staging-release.apk.`,
  },
  {
    key: "android",
    title: "Native Android",
    body: `buildtree.config.json:
{ "builds": { "android": { "command": "./gradlew assembleRelease", "artifact": "app/build/outputs/apk/release/app-release.apk" } } }
assembleRelease needs a signing config in app/build.gradle; assembleDebug and app-debug.apk work for QA.`,
  },
  {
    key: "ios",
    title: "Native iOS",
    body: `buildtree.config.json:
{ "builds": { "ios": { "command": "fastlane build_adhoc", "artifact": "build/App.ipa" } } }
Use a Fastlane lane (gym with export_method "ad-hoc") or xcodebuild archive followed by -exportArchive with an ExportOptions.plist, writing the IPA to the artifact path. Testers' UDIDs must be in the ad-hoc provisioning profile.`,
  },
];
