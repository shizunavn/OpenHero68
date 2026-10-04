@echo off
rem Requires ViGEmBus. Run with Gamepad stopped; only neutral controller output.
if defined HERO68_VCVARS (call "%HERO68_VCVARS%") else (call "D:\BuildTools\Product\VC\Auxiliary\Build\vcvars64.bat")
if errorlevel 1 exit /b 1
if not exist .refactor\gamepad-check mkdir .refactor\gamepad-check
cl /nologo /std:c++17 /O2 /EHsc /MT /I service\native\vendor\ViGEmClient\include tests\native-vigem-live-startup.test.cpp /Fe:.refactor\gamepad-check\vigem-live-startup.exe /Fo:.refactor\gamepad-check\vigem-live-startup.obj /link xinput.lib setupapi.lib avrt.lib user32.lib
if errorlevel 1 exit /b 1
.refactor\gamepad-check\vigem-live-startup.exe
