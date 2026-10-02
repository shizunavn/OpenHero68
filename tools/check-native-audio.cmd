@echo off
if defined HERO68_VCVARS (call "%HERO68_VCVARS%") else (call "D:\BuildTools\Product\VC\Auxiliary\Build\vcvars64.bat")
if errorlevel 1 exit /b 1
cl /nologo /std:c++17 /O2 /EHsc /MT tests\native-audio.test.cpp /Fe:.refactor\rhythm-service-check\audio-test.exe /Fo:.refactor\rhythm-service-check\audio-test.obj ole32.lib avrt.lib uuid.lib propsys.lib winmm.lib
if errorlevel 1 exit /b 1
.refactor\rhythm-service-check\audio-test.exe
