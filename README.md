# OpenHero68

WebHID keyboard configuration app and Windows tray RGB service for AULA HERO68.

[Open the web app](https://open-hero68.pages.dev/) · [Download Windows RGB service](https://github.com/shizunavn/OpenHero68-RGB-Service/releases/latest/download/OpenHero68-RGB-Windows-x64.zip) · [Release notes](https://github.com/shizunavn/OpenHero68-RGB-Service/releases/latest)

## Features

- Keyboard profiles, remapping, actuation point, Rapid Trigger and deadzone settings.
- Advanced key configuration and macro editing.
- RGB settings using the existing AULA color engine.
- Custom RGB with an Aurora base and composable FX, including Comet, Pressure Wave, Ripple, Reaction, Touch, Jelly, AOE, Scan, Breath, Mixing, Trail and RT Display.
- A layer editor, local Demo without the Windows app, and a Background Service setup tutorial.
- Portable Windows tray service for RGB playback while the browser is closed.
- Rhythm Sync with seven key modes, native system-audio capture, live preview and a 60 FPS USB scheduler shared with Custom Effects.

Gamepad output is unfinished. Rhythm side modes are available in demo, but live side output remains gated until the HERO68 LED count, order and protocol are verified. Side LEDs retain their onboard effect during key playback.

## Run the app from source

Use Node.js 22.12 or later, then:

```sh
npm ci
npm run dev
```

Open the HTTPS URL printed by Vite in a browser supporting WebHID (Chrome or Edge), and use Connect to choose the keyboard. Vite creates a local development certificate. Windows service origins include the deployed app and localhost on port 5173; for another origin, launch the service with `--allow-origin https://your-host:port`.

```sh
npm run build
npm test
```

The production app is generated in `dist/`. Serve it over HTTPS for WebHID.

## Use the RGB tray service

1. Download the Windows x64 ZIP from Releases and extract it to a permanent folder.
2. Run `Hero68RgbService.exe`; the H icon appears in the system tray.
3. Open the web app and choose **Allow** if the browser asks to access apps and services on this device.
4. Go to RGB Settings > Custom Effects or Rhythm Sync, choose your preset, and select **Apply to keyboard**.
5. Closing the browser leaves playback running. Right-click the tray icon for controls.

Rhythm Sync in this source build requires **core 0.3.0, launcher 0.3.0 and API 5**.
Use the full Windows ZIP because the native audio/HID helper also changes: quit
the old tray app, extract all files over its folder, then run the new launcher.
The local build writes the ZIP to `service/releases/`; GitHub's latest download
only changes after that package is published. A core-only update is insufficient.
Versions 0.2.3 and 0.3.0 can report `Unexpected update source` after the GitHub
repository rename. Download the full 0.3.1 ZIP manually once; its updater accepts
both the canonical repository name and the original alias.
If Auto-start points to another folder, the new tray offers **Auto-start: replace
old app path**. Click it to register this folder instead; auto-start stays optional.
Without the app, select **Try demo** to edit and preview effects locally. Opening
RGB defaults to Onboard Effects and does not change the lighting running on the keyboard.

The menu includes Open web app, Open control panel, Start saved RGB, Stop RGB, Check for updates, Open log folder, Auto-start and Quit. Check for updates works directly from the tray: it reports when the installed version is current, downloads and applies compatible signed core updates, or downloads a checksum-verified ZIP when the native launcher must change. A downloaded ZIP must be extracted over the service folder after quitting the old launcher. Auto-start is optional, per Windows account, and disabled by default. Disable it before moving or deleting the service folder.

No Node/Python installation or administrator rights are required for the downloaded package. Keep all included files together. The control panel is http://127.0.0.1:16868/ and presets/logs are in `%LOCALAPPDATA%\OpenHero68\rgb-service`. The service shares Hall samples with the web so the browser does not start a second USB polling loop.

## Build the Windows service

Install Visual Studio Build Tools with the C++ desktop workload and Windows SDK. Set `HERO68_VCVARS` to your `vcvars64.bat` path, then:

```powershell
$env:HERO68_VCVARS = 'C:\path\to\VC\Auxiliary\Build\vcvars64.bat'
npm ci
npm run build:service
node tools/package-rgb-service.mjs
```

The native launcher and HID bridge are compiled with MSVC; the TypeScript RGB engine and current Node runtime are bundled into `service/dist/`. Packaging writes a ZIP and SHA256 checksum to `service/releases/`.

See [Rhythm Sync documentation](docs/RHYTHM_SYNC.md), [Custom RGB documentation](docs/CUSTOM_RGB.md) and [protocol notes](src/protocol/README.md) for implementation details and limitations.
