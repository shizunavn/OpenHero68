#pragma once
#include <windows.h>
#include <string>
inline bool setupTestMode(){return GetEnvironmentVariableW(L"OPENHERO68_SETUP_TEST",nullptr,0)>0;}
inline const wchar_t* trayMutexName(){return setupTestMode()?L"Local\\OpenHero68SetupTest":L"Local\\OpenHero68RgbService";}
inline INTERNET_PORT servicePort(){return setupTestMode()?17868:16868;}
