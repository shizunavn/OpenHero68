#define NOMINMAX
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shellapi.h>
#include <winhttp.h>
#include <atomic>
#include <string>
#include <thread>

namespace {
HANDLE child;
NOTIFYICONDATAW tray{};
std::wstring launchCommand;
constexpr wchar_t RunKey[] = L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
constexpr wchar_t RunName[] = L"OpenHero68RgbService";
UINT taskbarCreated;
std::atomic<bool> checkingUpdates{false};
std::atomic<bool> exiting{false};
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
struct HttpResult { DWORD status = 0; std::string body; };
HttpResult post(const wchar_t* endpoint, int receiveTimeout = 1500) {
    HttpResult result;
    HINTERNET session = WinHttpOpen(L"OpenHero68 RGB/0.2.3", WINHTTP_ACCESS_TYPE_NO_PROXY, nullptr, nullptr, 0);
    if (!session) return result;
    WinHttpSetTimeouts(session, 500, 500, 1000, receiveTimeout);
    HINTERNET connection = WinHttpConnect(session, L"127.0.0.1", 16868, 0);
    HINTERNET request = connection ? WinHttpOpenRequest(connection, L"POST", endpoint, nullptr, nullptr, nullptr, 0) : nullptr;
    DWORD status = 0, size = sizeof(status); char body[] = "{}";
    bool ok = request && WinHttpSendRequest(request, L"Content-Type: application/json\r\n", DWORD(-1), body, 2, 2, 0)
        && WinHttpReceiveResponse(request, nullptr)
        && WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, nullptr, &status, &size, nullptr);
    if (ok) {
        result.status = status;
        char buffer[1024]; DWORD read = 0;
        while (result.body.size() < 8192 && WinHttpReadData(request, buffer, sizeof(buffer), &read) && read) result.body.append(buffer, read);
    }
    if (request) WinHttpCloseHandle(request);
    if (connection) WinHttpCloseHandle(connection);
    WinHttpCloseHandle(session); return result;
}
bool command(const wchar_t* endpoint) { return post(endpoint).status == 200; }
std::wstring wide(const std::string& value) {
    if (value.empty()) return L"";
    int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), int(value.size()), nullptr, 0);
    if (length <= 0) return L"";
    std::wstring result(size_t(length), L'\0');
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), int(value.size()), result.data(), length);
    return result;
}
struct UpdateReply { std::string kind; std::wstring version; std::wstring file; bool valid = false; };
UpdateReply parseUpdateReply(const HttpResult& result) {
    if (result.status != 200) return {};
    const size_t first = result.body.find('|');
    if (first == std::string::npos) return {};
    const size_t second = result.body.find('|', first + 1);
    UpdateReply reply;
    reply.kind = result.body.substr(0, first);
    reply.version = wide(result.body.substr(first + 1, second == std::string::npos ? second : second - first - 1));
    if (reply.version.empty()) return {};
    if (reply.kind == "package" && second != std::string::npos) reply.file = wide(result.body.substr(second + 1));
    reply.valid = ((reply.kind == "none" || reply.kind == "core") && second == std::string::npos)
        || (reply.kind == "package" && !reply.file.empty());
    return reply;
}
void notify(const wchar_t* message) {
    NOTIFYICONDATAW notice = tray; notice.uFlags = NIF_INFO;
    wcscpy_s(notice.szInfoTitle, L"OpenHero68 RGB");
    wcscpy_s(notice.szInfo, message); notice.dwInfoFlags = NIIF_INFO;
    Shell_NotifyIconW(NIM_MODIFY, &notice);
}
void checkUpdates() {
    if (checkingUpdates.exchange(true)) { MessageBoxW(nullptr, L"An update check is already running.", L"OpenHero68 RGB", MB_OK | MB_ICONINFORMATION | MB_SETFOREGROUND); return; }
    notify(L"Checking and downloading updates...");
    std::thread([] {
        const UpdateReply reply = parseUpdateReply(post(L"/updates/tray-check", 150000));
        if (!exiting) {
            if (!reply.valid) MessageBoxW(nullptr, L"Update check or download failed. Open the service log folder for details.", L"OpenHero68 RGB", MB_OK | MB_ICONERROR | MB_SETFOREGROUND);
            else if (reply.kind == "none") MessageBoxW(nullptr, (L"No updates available. Version " + reply.version + L" is the latest.").c_str(), L"OpenHero68 RGB", MB_OK | MB_ICONINFORMATION | MB_SETFOREGROUND);
            else if (reply.kind == "core") MessageBoxW(nullptr, (L"Core update " + reply.version + L" downloaded and verified. The service is restarting to apply it.").c_str(), L"OpenHero68 RGB", MB_OK | MB_ICONINFORMATION | MB_SETFOREGROUND);
            else if (reply.kind == "package") {
                const std::wstring message = L"Windows update " + reply.version + L" downloaded and verified to:\n" + reply.file + L"\n\nQuit the tray app, extract the ZIP over its folder, then restart it. Open the download folder?";
                if (MessageBoxW(nullptr, message.c_str(), L"OpenHero68 RGB", MB_YESNO | MB_ICONINFORMATION | MB_SETFOREGROUND) == IDYES) {
                    const size_t slash = reply.file.find_last_of(L"\\/");
                    if (slash != std::wstring::npos) { const std::wstring folder = reply.file.substr(0, slash); open(folder.c_str()); }
                }
            }
        }
        checkingUpdates = false;
    }).detach();
}
void addTray() { Shell_NotifyIconW(NIM_ADD, &tray); tray.uVersion = NOTIFYICON_VERSION_4; Shell_NotifyIconW(NIM_SETVERSION, &tray); }
void menu(HWND window) {
    HMENU popup = CreatePopupMenu();
    AppendMenuW(popup, MF_STRING | MF_DISABLED, 0, L"OpenHero68 Background Service");
    AppendMenuW(popup, MF_STRING | MF_DISABLED, 0, L"Version: 0.2.1");
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
    case 1: open(L"https://open-hero68.pages.dev/"); break;
    case 2: open(L"http://127.0.0.1:16868/"); break;
    case 3: case 4:
        if (!command(selected == 3 ? L"/start" : L"/stop")) MessageBoxW(window, L"The RGB command failed. Open the control panel for details; Start requires a saved preset.", L"OpenHero68 RGB", MB_ICONWARNING);
        break;
    case 5: checkUpdates(); break;
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
    case WM_CLOSE: exiting = true; command(L"/shutdown"); WaitForSingleObject(child, 2000); DestroyWindow(window); return 0;
    case WM_QUERYENDSESSION: return TRUE;
    case WM_ENDSESSION: if (wparam) DestroyWindow(window); return 0;
    case WM_DESTROY: exiting = true; KillTimer(window, 1); Shell_NotifyIconW(NIM_DELETE, &tray); PostQuitMessage(0); return 0;
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
    std::wstring command = L"\"" + runtime + L"\" \"" + dir + L"\\bootstrap.cjs\" " + arguments;
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
        tray.hIcon = LoadIconW(instance, MAKEINTRESOURCEW(1)); wcscpy_s(tray.szTip, L"OpenHero68 RGB Service 0.2.1");
        addTray(); SetTimer(window, 1, 500, nullptr);
        MSG message; while (GetMessageW(&message, nullptr, 0, 0) > 0) { TranslateMessage(&message); DispatchMessageW(&message); }
    }
    CloseHandle(job); WaitForSingleObject(child, 2000);
    CloseHandle(process.hProcess); CloseHandle(mutex);
    return window ? 0 : 1;
}
