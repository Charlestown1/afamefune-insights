# Packaging Afamefune Insights as an Android app

## Why Trusted Web Activity (Bubblewrap), not Capacitor

Afamefune Insights is a live, server-rendered app using **cookie-based sessions**
(express-session + Passport) and **Google OAuth**. Two things make TWA the
correct choice here rather than Capacitor:

1. **Google actively blocks OAuth sign-in inside embedded WebViews**
   (the "disallowed_useragent" policy). Capacitor apps run your site inside
   an embedded WebView, which would break "Continue with Google" for your
   users. A TWA instead opens your real production URL inside actual
   Chrome — the same engine, cookie jar, and user-agent as a normal browser
   tab — so Google OAuth, session cookies, and everything else behave
   exactly as they do on the live website today.
2. Since the app already IS the production site (not something that needs
   to work offline-first with native device APIs), wrapping the existing
   PWA is simpler, smaller, and more maintainable than bundling a native
   shell — future updates to the website ship instantly to the Android app
   with no rebuild required.

## What was already done for you (in this ZIP)

- `public/manifest.json` — completed with real icons, correct theme colors
  pulled from your actual CSS (`#0b0d12`), description, scope, orientation.
- `public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png` —
  generated directly from your existing `logo.png` (not replaced/invented).
- `public/sw.js` — a real service worker: caches static assets, NEVER
  caches `/api/`, `/auth/`, or `/.well-known/` (private/dynamic data),
  network-first for page loads with an offline fallback, and automatic
  cache-busting on every deploy so users never get stuck on old assets.
- `public/offline.html` — themed offline fallback page.
- `public/app.js` — service worker registration appended at the end
  (nothing existing was touched).
- `server.js` — added `GET /.well-known/assetlinks.json`, required for the
  installed Android app to open without a browser URL bar.
- `android-twa/twa-manifest.json` — a correctly-formatted Bubblewrap config
  pointing at your real production host, icons, and colors.

## What you still need to do (requires network + Android SDK — not available
## in the sandbox that prepared this ZIP)

### 1. Deploy this updated project to Render first
The PWA files (manifest, icons, service worker) must be live at your
production URL before packaging, since the Android app will load directly
from `https://afamefune-insights.onrender.com`.

### 2. Install Bubblewrap (needs Node.js 14+ and a JDK)
```bash
npm install -g @bubblewrap/cli
```

### 3. Generate the actual Android project
From the `android-twa/` folder in this ZIP (it already has a correct
`twa-manifest.json`, so `init` will just confirm/reuse it):
```bash
cd android-twa
bubblewrap init --manifest=https://afamefune-insights.onrender.com/manifest.json
```
Bubblewrap will offer to download the Android SDK/JDK automatically if you
don't have them — say yes. Confirm the prompted values match
`twa-manifest.json` (package ID `com.afamefune.insights`, host, icons).

### 4. Build the signed APK
```bash
bubblewrap build
```
This produces `app-release-signed.apk` in that folder — that is your real,
installable **Afamefune-Insights.apk**.

### 5. Enable the "no URL bar" experience (Digital Asset Links)
Get your signing key's SHA-256 fingerprint:
```bash
keytool -list -v -keystore android.keystore -alias afamefune
```
Copy the `SHA256:` value, then on Render set an environment variable:
```
ANDROID_APK_SHA256_FINGERPRINT=<the fingerprint, colons and all>
```
Redeploy, then verify:
```bash
bubblewrap validate --manifest=https://afamefune-insights.onrender.com/manifest.json
```

### 6. Install and test
```bash
adb install app-release-signed.apk
```
Test: email/password login, Google login, adding a trade, the prop-firm
tracker, session tracker, admin dashboard (as an admin user), advertisement
display, donation copy button, the Android back button, and behavior with
Wi-Fi turned off.

## Notes on things covered automatically by TWA (no extra config needed)
- **Back button**: TWA maps it to browser history automatically — back
  goes to the previous in-app page, and exits when there's no more history.
- **File uploads / chart screenshots**: handled by Chrome's native file
  picker inside the TWA, same as in a normal mobile browser tab.
- **External links** (ads, donation, Instagram): open in a system Custom
  Tab / browser by default, so they never break or trap the user.
- **Permissions**: a TWA requests essentially no special Android
  permissions beyond internet access — there's no manifest permission
  list to hand-edit.
