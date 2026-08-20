# @bookorbit/mobile

Capacitor native shell for iOS and Android. This package does not contain app UI &mdash;
it wraps the built `client/` output (`client/dist`) in a native WebView and exposes
platform APIs the browser can't provide (background audio, offline downloads, secure
token storage).

## Setup

From the repo root:

```bash
pnpm install
pnpm --filter client build
pnpm --filter @bookorbit/mobile sync   # builds the client, then `cap sync`
```

`sync` copies `client/dist` into `android/app/src/main/assets/public` and
`ios/App/App/public`. Run it after every client change you want to see on-device.

## Running on a device or simulator

```bash
pnpm --filter @bookorbit/mobile open:android   # opens Android Studio
pnpm --filter @bookorbit/mobile open:ios       # opens Xcode (macOS only)
```

Build and run from the IDE. iOS additionally requires Xcode and CocoaPods
(`pod install` runs automatically via `cap sync` when CocoaPods is present).

## Connecting to a self-hosted server

The web client assumes it's served from the same origin as the API (`/api/v1/...`
relative URLs, refresh token via an `httpOnly` same-site cookie). A native shell has no
such origin, so this package enables Capacitor's `CapacitorHttp` plugin
(`capacitor.config.ts`), which routes `fetch`/`XHR` through native networking instead of
the WebView &mdash; bypassing WebView CORS restrictions and giving refresh cookies a real
native cookie jar to live in.

On top of that, `client/src/lib/server-connection.ts` is a small platform adapter: on
native builds it prefixes every API and socket.io request with a server URL the user
enters once, on a new `/connect` screen (`ServerConnectPage.vue`) gated by the router
guard. On web/PWA builds `isNativePlatform()` is false and every function in that module
is a no-op, so nothing about the existing browser client changed.

Known follow-up: OIDC/SSO login (`useOidc.ts`) does a full-page redirect to the identity
provider and back, which doesn't translate cleanly into a WebView. That still needs the
Capacitor Browser plugin plus a deep-link callback &mdash; out of scope for this pass.

## Platforms

- `android/` &mdash; Android Studio project, builds and runs without a Mac.
- `ios/` &mdash; Xcode project, requires macOS + Xcode + CocoaPods to build.

Both are committed to the repo, matching Capacitor's standard project layout. Re-run
`cap sync` after upgrading Capacitor packages; don't hand-edit the generated
`capacitor.config.json` files under `android/app/src/main/assets` or `ios/App/App`
&mdash; edit `capacitor.config.ts` instead.

## CI

`.github/workflows/ci.yml` has a `mobile-android` job that assembles a debug APK on
every PR/push touching `apps/mobile/**` or `client/**`, and uploads it as a build
artifact &mdash; an unsigned build-only check, not a release artifact. A `mobile-ios` job
does the same for the iOS Simulator target, but only on manual `workflow_dispatch`
(macOS runners cost several times the Actions minutes of Linux ones); trigger it by hand
from the Actions tab when validating an iOS-affecting change. Neither job needs code
signing or store credentials &mdash; that's scoped to store submission, separately.
