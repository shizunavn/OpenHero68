#define NOMINMAX
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shellapi.h>
#include <winhttp.h>
#include <string>

namespace {
HANDLE child;
NOTIFYICONDATAW tray{};
std::wstring launchCommand;
constexpr wchar_t RunKey[] = L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
constexpr wchar_t RunName[] = L"OpenHero68RgbService";
UINT taskbarCreated;
void open(const wchar_t* url) { ShellExecuteW(nullptr, L"open", url, nullptr, nullptr, SW_SHOWNORMAL); }
bool autoStart() {
    wchar_t value[32768]; DWORD size = sizeof(value);
    return RegGetValueW(HKEY_CURRENT_USER, RunKey, RunName, RRF_RT_REG_SZ, nullptr, value, &size) == ERROR_SUCCESS && launchCommand == value;
}
void toggleAutoStart(HWND window) {
    HKEY key; LONG result = RegCreateKeyExW(HKEY_CURRENT_USER, RunKey, 0, nullptr, 0, KEY_SET_VALUE, nullptr, &key, nullptr);
    if (result == ERROR_SUCCESS) {
        if (autoStart()) result = RegDeleteValueW(key, RunName);
        else result = RegSetValueExW(key, RunName, 0, REG_SZ, reinterpret_cast<const BYTE*>(launchCommand.c_str()), DWORD((launchCommand.size()+1)*sizeof(wchar_t)));
        RegCloseKey(key);
    }
    if (result != ERROR_SUCCESS) MessageBoxW(window, L"Could not change auto-start for your Windows account.", L"OpenHero68 RGB", MB_ICONERROR);
}
bool post(const wchar_t* endpoint) {
    HINTERNET session = WinHttpOpen(L"OpenHero68 RGB/0.1.0", WINHTTP_ACCESS_TYPE_NO_PROXY, nullptr, nullptr, 0);
    if (!session) return false;
    WinHttpSetTimeouts(session, 500, 500, 1000, 1500);
    HINTERNET connection = WinHttpConnect(session, L"127.0.0.1", 16868, 0);
    HINTERNET request = connection ? WinHttpOpenRequest(connection, L"POST", endpoint, nullptr, nullptr, nullptr, 0) : nullptr;
    DWORD status = 0, size = sizeof(status); char body[] = "{}";
    bool ok = request && WinHttpSendRequest(request, L"Content-Type: application/json\r\n", DWORD(-1), body, 2, 2, 0)
        && WinHttpReceiveResponse(request, nullptr)
        && WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, nullptr, &status, &size, nullptr) && status == 200;
    if (request) WinHttpCloseHandle(request);
    if (connection) WinHttpCloseHandle(connection);
    WinHttpCloseHandle(session); return ok;
}
void addTray() { Shell_NotifyIconW(NIM_ADD, &tray); tray.uVersion = NOTIFYICON_VERSION_4; Shell_NotifyIconW(NIM_SETVERSION, &tray); }
void menu(HWND window) {
    HMENU popup = CreatePopupMenu();
    AppendMenuW(popup, MF_STRING | MF_DISABLED, 0, L"OpenHero68 Background Service");
    AppendMenuW(popup, MF_STRING | MF_DISABLED, 0, L"Version: 0.1.0");
    AppendMenuW(popup, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(popup, MF_STRING, 1, L"Open web app");
    AppendMenuW(popup, MF_STRING, 2, L"Open control panel");
    AppendMenuW(popup, MF_STRING, 3, L"Start saved RGB");
    AppendMenuW(popup, MF_STRING, 4, L"Stop RGB");
    AppendMenuW(popup, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(popup, MF_STRING, 5, L"Check for updates");
    AppendMenuW(popup, MF_STRING, 6, L"Open log folder");
    AppendMenuW(popup, MF_STRING | (autoStart() ? MF_CHECKED : 0), 7, L"Auto-start");
    AppendMenuW(popup, MF_STRING, 8, L"Quit");
    POINT point; GetCursorPos(&point); SetForegroundWindow(window);
    UINT selected = TrackPopupMenu(popup, TPM_RETURNCMD | TPM_RIGHTBUTTON, point.x, point.y, 0, window, nullptr);
    DestroyMenu(popup); PostMessageW(window, WM_NULL, 0, 0);
    switch (selected) {
    case 1: open(L"https://shizuna.ddns.net:5173/"); break;
    case 2: open(L"http://127.0.0.1:16868/"); break;
    case 3: case 4:
        if (!post(selected == 3 ? L"/start" : L"/stop")) MessageBoxW(window, L"The RGB command failed. Open the control panel for details; Start requires a saved preset.", L"OpenHero68 RGB", MB_ICONWARNING);
        break;
    case 5: open(L"https://github.com/shizunavn/OpenHero68-RGB-Service/releases/latest"); break;
    case 6: {
        wchar_t local[32768]; DWORD count = GetEnvironmentVariableW(L"LOCALAPPDATA", local, 32768);
        if (count && count < 32768) open((std::wstring(local) + L"\\OpenHero68\\rgb-service").c_str());
        break;
    }
    case 7: toggleAutoStart(window); break;
    case 8: SendMessageW(window, WM_CLOSE, 0, 0); break;
    }
}
LRESULT CALLBACK windowProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
    if (message == taskbarCreated) { addTray(); return 0; }
    switch (message) {
    case WM_APP + 1:
        if (LOWORD(lparam) == WM_CONTEXTMENU || LOWORD(lparam) == NIN_KEYSELECT) menu(window);
        else if (LOWORD(lparam) == NIN_SELECT) open(L"http://127.0.0.1:16868/");
        return 0;
    case WM_TIMER: if (WaitForSingleObject(child, 0) == WAIT_OBJECT_0) DestroyWindow(window); return 0;
    case WM_CLOSE: post(L"/shutdown"); WaitForSingleObject(child, 2000); DestroyWindow(window); return 0;
    case WM_QUERYENDSESSION: return TRUE;
    case WM_ENDSESSION: if (wparam) DestroyWindow(window); return 0;
    case WM_DESTROY: KillTimer(window, 1); Shell_NotifyIconW(NIM_DELETE, &tray); PostQuitMessage(0); return 0;
    }
    return DefWindowProcW(window, message, wparam, lparam);
}
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR arguments, int) {
    HANDLE mutex = CreateMutexW(nullptr, TRUE, L"Local\\OpenHero68RgbService");
    if (!mutex || GetLastError() == ERROR_ALREADY_EXISTS) { if (mutex) { CloseHandle(mutex); open(L"http://127.0.0.1:16868/"); } return 0; }
    wchar_t path[32768]; GetModuleFileNameW(nullptr, path, 32768);
    std::wstring dir(path); dir.resize(dir.find_last_of(L"\\/"));
    launchCommand = L"\"" + std::wstring(path) + L"\"";
    if (*arguments) launchCommand += L" " + std::wstring(arguments);
    std::wstring runtime = dir + L"\\runtime.exe";
    std::wstring command = L"\"" + runtime + L"\" \"" + dir + L"\\service.cjs\" " + arguments;
    HANDLE job = CreateJobObjectW(nullptr, nullptr);
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (!job || !SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) { if (job) CloseHandle(job); CloseHandle(mutex); return 1; }
    STARTUPINFOW startup{}; startup.cb = sizeof(startup); PROCESS_INFORMATION process{};
    if (!CreateProcessW(runtime.c_str(), command.data(), nullptr, nullptr, FALSE,
        CREATE_NO_WINDOW | CREATE_SUSPENDED, nullptr, dir.c_str(), &startup, &process)) {
        MessageBoxW(nullptr, L"Cannot start bundled RGB runtime. Keep the service folder together.", L"OpenHero68 RGB", MB_ICONERROR);
        CloseHandle(job); CloseHandle(mutex); return 1;
    }
    if (!AssignProcessToJobObject(job, process.hProcess)) { TerminateProcess(process.hProcess, 1); CloseHandle(process.hThread); CloseHandle(process.hProcess); CloseHandle(job); CloseHandle(mutex); return 1; }
    ResumeThread(process.hThread); CloseHandle(process.hThread);
    child = process.hProcess;
    taskbarCreated = RegisterWindowMessageW(L"TaskbarCreated");
    WNDCLASSW wc{}; wc.lpfnWndProc = windowProc; wc.hInstance = instance; wc.lpszClassName = L"OpenHero68RgbTray";
    RegisterClassW(&wc);
    HWND window = CreateWindowExW(0, wc.lpszClassName, L"OpenHero68 RGB Tray", WS_OVERLAPPED, 0, 0, 0, 0, nullptr, nullptr, instance, nullptr);
    if (window) {
        tray.cbSize = sizeof(tray); tray.hWnd = window; tray.uID = 1;
        tray.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP; tray.uCallbackMessage = WM_APP + 1;
        tray.hIcon = LoadIconW(instance, MAKEINTRESOURCEW(1)); wcscpy_s(tray.szTip, L"OpenHero68 RGB Service 0.1.0");
        addTray(); SetTimer(window, 1, 500, nullptr);
        MSG message; while (GetMessageW(&message, nullptr, 0, 0) > 0) { TranslateMessage(&message); DispatchMessageW(&message); }
    }
    CloseHandle(job); WaitForSingleObject(child, 2000);
    CloseHandle(process.hProcess); CloseHandle(mutex);
    return window ? 0 : 1;
}
