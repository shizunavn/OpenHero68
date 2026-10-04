# Windows setup and release operations

Service 0.5.0 introduces per-user installation and full application updates.
The website version is independent. New releases contain only the setup EXE,
signed update manifest and checksum list, not portable ZIP/core update assets.

## Build

Use Windows x64 with Node and MSVC C++ Build Tools. `vswhere` finds MSVC;
`HERO68_VCVARS` can override its vcvars64.bat. Run:

```powershell
npm ci
npm run prepare:setup
npm run build:setup
npm run test:setup
```

`prepare:setup` downloads Inno Setup 6.7.3 and ViGEmBus 1.22.0 from their
official GitHub releases, verifies pinned SHA-256 and installs the compiler
inside `.refactor/setup-tools`. It never installs the driver. The bundled Node
runtime is the build process's executable; CI pins its exact version from
`service/version.json`. Changing the toolchain requires updating the pins.

Output: `service/releases/OpenHero68-Setup-Windows-x64.exe`.

## Release

1. Update `service/version.json` and add `docs/releases/vX.Y.Z.md`.
2. Configure repository Actions secret **RELEASE_SIGNING_KEY** with the existing
   Ed25519 private key in PEM format. Its public key must match
   `service/updatePublicKey.ts`. Do not regenerate this key for each release.
3. Push the committed source and tag `vX.Y.Z`. The Windows workflow validates
   the tag, tests, builds and runs the isolated setup smoke suite.
4. The separate release job signs the tested EXE and verifies it again. It uploads
   EXE, `OpenHero68-update.json` and `SHA256SUMS.txt` into a draft, verifies uploaded
   content and publishes it as latest. It refuses to modify a public release.

PR jobs never receive signing secrets. Local signing may use
`%LOCALAPPDATA%/OpenHero68/release-signing-key.pem`; run `npm run sign:setup`
and `npm run verify:setup`. The signing tool refuses an unknown key. Do not
publish a locally built setup as an update without its signed manifest.

Authenticode is not configured. Windows may show SmartScreen when initially
opening the downloaded installer. Ed25519 validates update packages; it is
separate from Windows publisher signing.

## Installation and update state

Programs live at `%LOCALAPPDATA%/Programs/OpenHero68`, with a stable
`OpenHero68.exe` starter and `versions/X.Y.Z` payload directories. Configuration
and logs stay at `%LOCALAPPDATA%/OpenHero68/rgb-service`. `installation.json`
records active/previous versions and shortcut/Auto-start choices.

The worker stages downloads under `rgb-service/updates/<operationId>` and runs
outside the tray process's kill-on-close Job Object. A flushed transaction
journal and backup survive app termination. The new app must report the expected
version, API and operation token within 30 seconds before the active version is
committed. Failure restores the prior installation metadata and state. The stable
starter retries interrupted rollback before launching an app. Successful updates
retain one previous version.

`POST /updates/apply` returns 202 and an operation id. Concurrent calls return
the current operation. `GET /updates` reports persistent progress/results;
`/status` advertises `supportsFullUpdate`. The internal `/updates/prepare` request
must match the operation id already recorded locally. Existing origin/host rules
still apply. No endpoint accepts an arbitrary setup path or download URL.

RGB/Rhythm use saved startup behavior. Gamepad remains disabled after restart.
The installer never reboots Windows. ViGEmBus installation is optional, elevated
separately, and only offered when missing; an existing unavailable driver gets
an explanatory message instead of an install checkbox. Downloaded installer
files are not counted as installed drivers.

## Validation boundaries

Node tests exercise authenticated packages, source/size bounds, retries,
deduplication and transaction rollback. `test:setup` compiles isolated installers
and launches a fake HTTP service using its own AppId, port 17868, mutex, shortcut
and state folder. It tests Unicode paths, full updates, restart, rollback,
shortcut selection and uninstall without opening HID or installing any driver.

Before the first public tag, manually validate Windows 10/11 with a real HERO68:
safe gamepad/HID shutdown, saved RGB/Rhythm resume, driver UAC cancellation and
driver reboot-needed reporting. Hosted CI does not prove these hardware cases.
Cloudflare Pages deployment remains separate.
