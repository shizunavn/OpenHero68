@echo off
call "D:\BuildTools\Product\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 exit /b 1
cl /nologo /std:c++17 /O2 /EHsc /MT tests\native-tray.test.cpp service\dist\launcher.res /Fe:service\dist\tray-test.exe /Fo:service\dist\tray-test.obj /link user32.lib shell32.lib advapi32.lib winhttp.lib
if errorlevel 1 exit /b 1
service\dist\tray-test.exe
