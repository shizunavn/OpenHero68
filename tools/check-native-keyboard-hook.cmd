@echo off
if defined HERO68_VCVARS (call "%HERO68_VCVARS%") else (call "D:\BuildTools\Product\VC\Auxiliary\Build\vcvars64.bat")
if errorlevel 1 exit /b 1
if not exist .refactor\gamepad-check mkdir .refactor\gamepad-check
cl /nologo /std:c++17 /O2 /EHsc /MT tests\native-keyboard-hook.test.cpp /Fe:.refactor\gamepad-check\keyboard-hook-test.exe /Fo:.refactor\gamepad-check\keyboard-hook-test.obj /link user32.lib
if errorlevel 1 exit /b 1
.refactor\gamepad-check\keyboard-hook-test.exe
