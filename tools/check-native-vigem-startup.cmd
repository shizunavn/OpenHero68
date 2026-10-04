@echo off
if defined HERO68_VCVARS (call "%HERO68_VCVARS%") else (call "D:\BuildTools\Product\VC\Auxiliary\Build\vcvars64.bat")
if errorlevel 1 exit /b 1
if not exist .refactor\gamepad-check mkdir .refactor\gamepad-check
cl /nologo /std:c++17 /O2 /EHsc /MT /I service\native\vendor\ViGEmClient\include tests\native-vigem-startup.test.cpp /Fe:.refactor\gamepad-check\vigem-startup-test.exe /Fo:.refactor\gamepad-check\vigem-startup-test.obj /link setupapi.lib
if errorlevel 1 exit /b 1
.refactor\gamepad-check\vigem-startup-test.exe
