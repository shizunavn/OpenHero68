# OpenHero68 RGB Service

Portable Windows x64 tray application for AULA HERO68 custom RGB.

[Download Windows x64 ZIP](https://github.com/shizunavn/OpenHero68-RGB-Service/releases/latest/download/OpenHero68-RGB-Windows-x64.zip) · [Release notes and checksums](https://github.com/shizunavn/OpenHero68-RGB-Service/releases/latest)

## Setup

1. Extract the ZIP to a permanent folder. Keep all included files together.
2. Run `Hero68RgbService.exe`. It appears in the system tray with the H logo.
3. Open [OpenHero68](https://shizuna.ddns.net:5173/), go to RGB Settings > Custom Effects, and select **Start service RGB**.
4. Closing the browser leaves RGB running. Right-click the tray icon to control the service.

No Node/Python installation or administrator rights required.

## Tray menu

Open web app, Open control panel, Start saved RGB, Stop RGB, Check for updates, Open log folder, Auto-start, Quit.

Auto-start is optional and off by default. It uses your Windows account Run key. Enable it after choosing a permanent folder; disable it before moving or deleting the folder. Check for updates opens the latest release page; updates are installed manually.

The local control panel is http://127.0.0.1:16868/. Presets and logs are stored in `%LOCALAPPDATA%\OpenHero68\rgb-service`. Quit releases the keyboard and stops the service.

## Current scope

AULA base color engine and custom layers including Ripple, Reaction, Touch, Jelly, AOE, Scan, Breath, Mixing, Trail and RT Display. Target 40 FPS. Main keys are streamed; side LEDs keep their onboard effect. Gamepad and Rhythm Sync are not included.

This repository hosts portable binaries and release instructions.
