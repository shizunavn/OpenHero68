// Exercise the tray's real per-user Run-key functions, restoring prior state.
#include "../service/native/launcher.cpp"
#include <vector>
#include <iostream>

int main() {
    HKEY key;
    if (RegCreateKeyExW(HKEY_CURRENT_USER, RunKey, 0, nullptr, 0, KEY_QUERY_VALUE | KEY_SET_VALUE, nullptr, &key, nullptr) != ERROR_SUCCESS) return 1;
    DWORD type = 0, size = 0;
    LONG previous = RegQueryValueExW(key, RunName, nullptr, &type, nullptr, &size);
    std::vector<BYTE> saved(size);
    if (previous == ERROR_SUCCESS && RegQueryValueExW(key, RunName, nullptr, &type, saved.data(), &size) != ERROR_SUCCESS) { RegCloseKey(key); return 1; }
    if (previous != ERROR_SUCCESS && previous != ERROR_FILE_NOT_FOUND) { RegCloseKey(key); return 1; }
    launchCommand = L"\"C:\\OpenHero68 test folder\\Hero68RgbService.exe\" --allow-origin https://localhost:5173";
    RegDeleteValueW(key, RunName);
    bool ok = !autoStart();
    toggleAutoStart(nullptr); ok = ok && autoStart();
    toggleAutoStart(nullptr); ok = ok && !autoStart();
    LONG restored = previous == ERROR_SUCCESS ? RegSetValueExW(key, RunName, 0, type, saved.data(), size) : RegDeleteValueW(key, RunName);
    RegCloseKey(key);
    ok = ok && (restored == ERROR_SUCCESS || (previous == ERROR_FILE_NOT_FOUND && restored == ERROR_FILE_NOT_FOUND));
    HICON icon = LoadIconW(GetModuleHandleW(nullptr), MAKEINTRESOURCEW(1));
    ok = ok && icon != nullptr;
    const UpdateReply current = parseUpdateReply({200, "none|0.2.1"});
    const UpdateReply package = parseUpdateReply({200, "package|0.3.0|C:\\Updates\\Hero68.zip"});
    ok = ok && current.valid && current.kind == "none" && current.version == L"0.2.1";
    ok = ok && package.valid && package.kind == "package" && package.file == L"C:\\Updates\\Hero68.zip";
    ok = ok && !parseUpdateReply({400, "error"}).valid && !parseUpdateReply({200, "none"}).valid;
    std::cout << (ok ? "PASS: auto-start, H icon, and update reply parsing\n" : "FAIL: native tray checks\n");
    return ok ? 0 : 1;
}
