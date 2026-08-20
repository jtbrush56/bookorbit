# @bookorbit/capacitor-background-audio

Capacitor plugin scaffold for background audiobook playback with lock-screen transport controls on native (Android/iOS) builds. Part of [issue #5](https://github.com/jtbrush56/bookorbit/issues/5).

## Status: scaffold, unverified

This package was written without access to Android Studio, Xcode, a physical device, or an emulator/simulator. Concretely:

- **TypeScript** (`src/`): typechecked and used by the client build. The web fallback (`web.ts`) runs in a real browser and is testable.
- **Android** (`android/`): real Kotlin, wired into Gradle the same way `@capacitor/filesystem` (and other official Capacitor plugins) wire themselves in - a self-contained `build.gradle` applying its own Kotlin plugin, a `BackgroundAudioService` foreground service, and a `BackgroundAudioPlugin` bridge. This **does** get compiled by CI's `mobile-android` job (`gradle assembleDebug`), so it's at least known to build. It has **not** been run on a device or emulator - no confirmation that playback actually survives backgrounding, that the notification renders correctly, that `MediaSessionCompat` callbacks fire from real lock-screen/Bluetooth controls, or that `PendingIntent` / foreground-service-type handling is correct on every supported Android version (23-35).
- **iOS** (`ios/`): real Swift (`AVPlayer` + `AVAudioSession` + `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter`). CI's `mobile-ios` job only runs on manual `workflow_dispatch`, so this has **not** been confirmed to even compile, let alone run. `UIBackgroundModes: audio` was added to `apps/mobile/ios/App/App/Info.plist`, which is required infrastructure but not sufficient on its own.
- **Not wired into the reader.** `AudiobookReaderView.vue` / `useAudioQueue.ts` still play audio through Howler in the WebView, exactly as before this package existed. Nothing in the app calls this plugin yet.

## What's needed to actually finish this

1. Build and run `apps/mobile` on a real Android device/emulator and iOS device/simulator (Xcode + CocoaPods, Android Studio) to confirm both native sides actually compile, link, and behave as intended.
2. Fix whatever breaks - foreground service permission/type handling across Android versions, `AVAudioSession` category/route edge cases, background-mode entitlement on iOS, etc.
3. Wire the plugin into `AudiobookReaderView.vue`: on native, delegate transport commands (`play`/`pause`/`seek`/track navigation) to `BackgroundAudio` instead of Howler, and listen for `positionUpdate`/`remoteNext`/`remotePrevious`/`remoteSeek`/etc. to drive the existing UI and progress-saving logic. Howler should stay the web/PWA implementation.
4. Handle authenticated streaming: `load()` takes a resolved absolute URL plus a `headers` map (meant to carry `Authorization: Bearer <token>`) since native `AVPlayer`/`MediaPlayer` requests don't go through the WebView's `api()` wrapper or cookie jar. A caller needs to build these from `resolveApiUrl()` and `getValidToken()` (see `client/src/lib/server-connection.ts` and `client/src/lib/api.ts`) and refresh the header when the token rotates mid-playback.
5. Offline audiobook playback through this plugin (native players generally need a local file path, not a blob URL - the offline-download work in #5 currently only covers the web-Howler path via blob URLs).

## API surface

See `src/definitions.ts` for the full `BackgroundAudioPlugin` interface: `load`, `play`, `pause`, `stop`, `seek`, `setRate`, `setVolume`, `updateMetadata`, `getStatus`, and events (`play`, `pause`, `ended`, `positionUpdate`, `remoteNext`, `remotePrevious`, `remoteSeek`, `remoteSkipForward`, `remoteSkipBackward`, `error`).
