@echo off
if defined HERO68_VCVARS (call "%HERO68_VCVARS%") else (call "D:\BuildTools\Product\VC\Auxiliary\Build\vcvars64.bat")
if errorlevel 1 exit /b 1
if not exist .refactor\gamepad-check mkdir .refactor\gamepad-check
cl /nologo /std:c++17 /O2 /EHsc /MT tests\native-gamepad.test.cpp /Fe:.refactor\gamepad-check\gamepad-test.exe /Fo:.refactor\gamepad-check\gamepad-test.obj
if errorlevel 1 exit /b 1
.refactor\gamepad-check\gamepad-test.exe
