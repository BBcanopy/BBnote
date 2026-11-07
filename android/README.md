# BBNote for Android

The Android app bundles the React interface and connects to one BBNote server at a time. It supports the existing online notebook, editor, drawing, media, theme, and migration features. An internet connection is required; there is no offline note cache or synchronization queue.

## Configure the server

Deploy a BBNote server version that exposes `GET /api/v1/auth/native-config`. Configure a **public native OIDC client**, separate from the confidential web client:

- Authorization code grant with PKCE S256 and no client secret.
- Exact redirect URI: `bbnote://auth/callback`.
- Set the server's `OIDC_CLIENT_ID_ANDROID` to this client's ID.
- Use the same issuer as the web client. Request `openid profile email`; add `offline_access` and enable refresh tokens on the provider to retain sign-in across access-token expiry.
- The provider must issue access tokens accepted by the BBNote API. The app sends access tokens as bearer credentials; web sessions continue to use cookies.

`GET /api/v1/auth/native-config` returns `{ issuer, clientId, scopes }`. No client secret is sent to the app. The app uses AppAuth in the system browser and stores authentication state encrypted with an Android Keystore key. Refresh tokens stay in native storage and are excluded from Android backup.

The connection screen accepts a root HTTPS origin, such as `https://notes.example.com`. URLs with paths, credentials, query strings, or fragments are rejected. The app uses normal system certificate validation. HTTP is permitted **only in debug builds** for `localhost`, `127.0.0.1`, and `10.0.2.2`. Plain HTTP LAN servers are rejected.

## Build and install

Install Node 26+, a full JDK 21, and Android SDK platform 36/build-tools 36.0.0. Set `JAVA_HOME` and `ANDROID_HOME` to their installation directories. Android Studio Otter 2025.2.1 or newer can manage these prerequisites. From the repository root:

```sh
npm ci
npm run android:build
```

This builds the web interface into `web/dist-android`, syncs Capacitor, runs Android unit tests and lint, and creates:

```text
android/android/app/build/outputs/apk/debug/app-debug.apk
```

Install on a connected device/emulator:

```sh
adb install -r android/android/app/build/outputs/apk/debug/app-debug.apk
```

The debug APK is signed with the SDK's development key and can be sideloaded. CI builds against SDK 36, runs native tests on an Android 15 emulator, and uploads the APK as `bbnote-debug-apk`; it is not signed for Play Store publication. Keep the same debug key when rebuilding to update an installed app without uninstalling.

```sh
npm run android:sync       # Rebuild the Android web bundle and sync plugins/assets
npm run android:launch     # Sync and run on a device/emulator
npm run open --workspace android  # Open the native project in Android Studio
```

Normal `npm run build` and Docker builds continue to build the browser interface. The Android project and Gradle wrapper are tracked; generated assets, SDKs, caches, local SDK settings, signing keys, and build outputs are ignored. Generated Capacitor Gradle files are recreated by `android:sync`.

## Use and verify

Enter the server origin, connect, then choose “Sign in with OIDC.” Sign-in can be cancelled and retried. A saved session is restored on restart; temporary connection failures offer retry. Changing servers confirms that the workspace will close, clears credentials, cancels requests, and returns to server setup.

Downloads use Android's save dialog; attachment links open an installed viewer with scoped temporary file access. Files stay in the app cache until cleared by Android. Voice recording requests microphone permission and shows an error if permission is denied. Android Back dismisses dialogs/drawers/menus before navigating backward or minimizing the root screen.

For a local debug server, enter `http://10.0.2.2:8082` in the standard Android emulator. The OIDC issuer must also be reachable from the emulator. A physical device can use `adb reverse tcp:8082 tcp:8082` and `http://127.0.0.1:8082`. Release builds require HTTPS even for these hosts.

Run targeted shared-interface coverage:

```sh
npm run test:android-ui
npm run test:web -- src/platform/native.test.ts src/components/AuthSplash.test.tsx src/components/MarkdownPreview.test.tsx
npm run test:server -- src/app.docs.test.ts src/controller/authController.test.ts
```

The dedicated Playwright server enables a development-only mocked native adapter. That hook is removed from production and APK builds. These tests cover connection validation/retry, cancelled sign-in, session restoration, logout, server changes, and native file actions. Existing mobile workspace tests cover notebook editing and drawing.

With an emulator/device connected, run the real native storage and refresh tests:

```sh
cd android/android
./gradlew :app:connectedDebugAndroidTest
```

On Windows, use `gradlew.bat`. The instrumented tests verify Keystore encryption, refresh coordination and rotation, temporary provider failures, invalid refresh grants, logout, and server disconnection.

For real OS integration, start an Android 15+ Google APIs emulator and run:

```sh
npx playwright install android
npm run test:android-device
```

This emulator-only test installs the APK, **clears its existing BBNote app data**, and runs a local fixture server on port 8765. It checks actual browser sign-in/cancellation and PKCE, process death during sign-in, force-stop/restart restoration, Back navigation, multipart uploads, microphone permission denial/grant, recording, and the Android save dialog. It never selects a physical phone or uses a production account. Screenshots are written under the ignored `android/.toolchain` directory. Also inspect keyboard resizing and safe-area layout on your target phone before release. Mocked browser tests alone do not exercise these OS integrations.
