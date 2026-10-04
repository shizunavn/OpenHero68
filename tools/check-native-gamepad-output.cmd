@echo off
if defined HERO68_VCVARS (call "%HERO68_VCVARS%") else (call "D:\BuildTools\Product\VC\Auxiliary\Build\vcvars64.bat")
if errorlevel 1 exit /b 1
if not exist .refactor\gamepad-check mkdir .refactor\gamepad-check
if not defined HERO68_VIGEM_OBJECT set "HERO68_VIGEM_OBJECT=.refactor\gamepad-service\vigem-client.obj"
cl /nologo /std:c++17 /O2 /EHsc /MT /I service\native\vendor\ViGEmClient\include tests\native-gamepad-output.test.cpp "%HERO68_VIGEM_OBJECT%" /Fe:.refactor\gamepad-check\gamepad-output-test.exe /Fo:.refactor\gamepad-check\gamepad-output-test.obj /link xinput.lib setupapi.lib avrt.lib user32.lib
if errorlevel 1 exit /b 1
.refactor\gamepad-check\gamepad-output-test.exe
