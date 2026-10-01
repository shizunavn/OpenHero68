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

Gamepad output and Rhythm Sync are unfinished. The RGB service streams main keys; side LEDs retain their onboard effect.

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
4. Go to RGB Settings > Custom Effects, choose your preset, and select **Apply to keyboard**.
5. Closing the browser leaves playback running. Right-click the tray icon for controls.

The Pages website requires service core 0.2.3 or later. Upgrading from 0.2.2 or
earlier requires the full 0.2.3 Windows ZIP: quit the old tray app, extract all files
over its folder, then run the new launcher. Check for updates can download this ZIP.
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
powershell -NoProfile -File tools/package-rgb-service.ps1
```

The native launcher and HID bridge are compiled with MSVC; the TypeScript RGB engine and current Node runtime are bundled into `service/dist/`. Packaging writes a ZIP and SHA256 checksum to `service/releases/`.

See [Custom RGB documentation](docs/CUSTOM_RGB.md) and [protocol notes](src/protocol/README.md) for implementation details and limitations.
