@echo off
if defined HERO68_VCVARS (call "%HERO68_VCVARS%") else (call "D:\BuildTools\Product\VC\Auxiliary\Build\vcvars64.bat")
if errorlevel 1 exit /b 1
if not exist .refactor\rhythm-service-check mkdir .refactor\rhythm-service-check
cl /nologo /std:c++17 /O2 /EHsc /MT tests\native-rhythm.test.cpp /Fe:.refactor\rhythm-service-check\rhythm-test.exe /Fo:.refactor\rhythm-service-check\rhythm-test.obj
if errorlevel 1 exit /b 1
.refactor\rhythm-service-check\rhythm-test.exe
