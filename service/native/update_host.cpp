#define UNICODE
#define _UNICODE
#include <windows.h>
#include <winhttp.h>
#include "install_environment.h"
#include <shellapi.h>
#include <fstream>
#include <ViGEm/Client.h>
#include <string>

static std::wstring quote(const std::wstring& s) { return L"\"" + s + L"\""; }
int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
    int argc=0; auto argv=CommandLineToArgvW(GetCommandLineW(), &argc);
    if (!argv) return 1;
    if(argc>=3 && std::wstring(argv[1])==L"--run-installer") {
        // Closing this Job Object also stops the Inno child installer on timeout.
        HANDLE job=CreateJobObjectW(nullptr,nullptr);
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
        limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if(!job||!SetInformationJobObject(job,JobObjectExtendedLimitInformation,&limits,sizeof(limits)))return 1;
        std::wstring command=quote(argv[2]);for(int i=3;i<argc;i++)command+=L" "+quote(argv[i]);
        STARTUPINFOW si{};si.cb=sizeof(si);PROCESS_INFORMATION pi{};
        if(!CreateProcessW(argv[2],command.data(),nullptr,nullptr,FALSE,CREATE_SUSPENDED|CREATE_NO_WINDOW,nullptr,nullptr,&si,&pi)){CloseHandle(job);return 1;}
        if(!AssignProcessToJobObject(job,pi.hProcess)){TerminateProcess(pi.hProcess,1);CloseHandle(pi.hThread);CloseHandle(pi.hProcess);CloseHandle(job);return 1;}
        ResumeThread(pi.hThread);CloseHandle(pi.hThread);
        DWORD wait=WaitForSingleObject(pi.hProcess,240000),code=1;
        if(wait==WAIT_OBJECT_0)GetExitCodeProcess(pi.hProcess,&code);
        CloseHandle(job);WaitForSingleObject(pi.hProcess,5000);CloseHandle(pi.hProcess);LocalFree(argv);
        return wait==WAIT_OBJECT_0?int(code):1;
    }
    if(argc>1 && std::wstring(argv[1])==L"--wait-stop") {
        HANDLE mutex=OpenMutexW(SYNCHRONIZE|MUTEX_MODIFY_STATE,FALSE,trayMutexName());
        if(!mutex)return 0;
        DWORD result=WaitForSingleObject(mutex,40000);
        if(result==WAIT_OBJECT_0||result==WAIT_ABANDONED)ReleaseMutex(mutex);
        CloseHandle(mutex);return (result==WAIT_OBJECT_0||result==WAIT_ABANDONED)?0:1;
    }
    if(argc>1 && std::wstring(argv[1])==L"--probe-driver") {
        if(setupTestMode()){
            wchar_t fixture[32];GetEnvironmentVariableW(L"OPENHERO68_TEST_DRIVER",fixture,32);
            return std::wstring(fixture)==L"ready"?0:std::wstring(fixture)==L"error"?2:1;
        }
        HKEY key; bool installed=RegOpenKeyExW(HKEY_LOCAL_MACHINE,L"SYSTEM\\CurrentControlSet\\Services\\ViGEmBus",0,KEY_READ,&key)==ERROR_SUCCESS;
        if(installed)RegCloseKey(key);
        // Installed-but-unavailable is distinct from missing. No driver is installed here.
        auto client=vigem_alloc();
        if(client){auto result=vigem_connect(client);vigem_disconnect(client);vigem_free(client);if(VIGEM_SUCCESS(result))return 0;}
        return installed?2:1;
    }
    wchar_t own[32768];GetModuleFileNameW(nullptr,own,32768);
    std::wstring root(own);root.resize(root.find_last_of(L"\\/"));
    bool worker=argc==3 && std::wstring(argv[1])==L"--worker";
    std::wstring dir=root, arguments;
    if(worker) {
        dir=argv[2];arguments=L"--worker "+quote(dir);
    } else {
        std::ifstream active(root+L"\\active-version.txt");std::string version;std::getline(active,version);
        if(version.empty()||version.find_first_not_of("0123456789.")!=std::string::npos)return 1;
        dir=root+L"\\versions\\"+std::wstring(version.begin(),version.end());
        arguments=L"--launch "+quote(root);
    }
    std::wstring runtime=dir+L"\\runtime.exe",cmd=quote(runtime)+L" "+quote(dir+L"\\update-worker.cjs")+L" "+arguments;
    STARTUPINFOW si{};si.cb=sizeof(si);PROCESS_INFORMATION pi{};
    DWORD flags=CREATE_NO_WINDOW;
    BOOL inJob=FALSE;IsProcessInJob(GetCurrentProcess(),nullptr,&inJob);
    if(inJob)flags|=CREATE_BREAKAWAY_FROM_JOB;
    bool ok=CreateProcessW(runtime.c_str(),cmd.data(),nullptr,nullptr,FALSE,flags,nullptr,dir.c_str(),&si,&pi)!=FALSE;
    LocalFree(argv);
    if(!ok)return 1;
    CloseHandle(pi.hThread);CloseHandle(pi.hProcess);return 0;
}
