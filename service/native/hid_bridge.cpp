#define NOMINMAX
#include <windows.h>
#include <setupapi.h>
#include <hidsdi.h>
#include <hidpi.h>
#include <array>
#include <vector>
#include <string>
#include <iostream>
#include <iomanip>
#include <memory>
#include <chrono>
#include <cmath>

struct Device {
    HANDLE h = INVALID_HANDLE_VALUE;
    DWORD input = 64, output = 64;
    ~Device() { if (h != INVALID_HANDLE_VALUE) CloseHandle(h); }
};
std::unique_ptr<Device> openDevice() {
    GUID guid; HidD_GetHidGuid(&guid);
    auto list = SetupDiGetClassDevsW(&guid, nullptr, nullptr, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
    if (list == INVALID_HANDLE_VALUE) return {};
    std::unique_ptr<Device> result;
    unsigned matches = 0;
    for (DWORD i = 0;; ++i) {
        SP_DEVICE_INTERFACE_DATA item{}; item.cbSize = sizeof(item);
        if (!SetupDiEnumDeviceInterfaces(list, nullptr, &guid, i, &item)) break;
        DWORD size = 0;
        SetupDiGetDeviceInterfaceDetailW(list, &item, nullptr, 0, &size, nullptr);
        if (size < sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA_W)) continue;
        std::vector<unsigned char> data(size);
        auto detail = reinterpret_cast<SP_DEVICE_INTERFACE_DETAIL_DATA_W*>(data.data());
        detail->cbSize = sizeof(*detail);
        if (!SetupDiGetDeviceInterfaceDetailW(list, &item, detail, size, nullptr, nullptr)) continue;
        auto d = std::make_unique<Device>();
        d->h = CreateFileW(detail->DevicePath, GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, nullptr);
        if (d->h == INVALID_HANDLE_VALUE) continue;
        HIDD_ATTRIBUTES attrs{}; attrs.Size = sizeof(attrs);
        PHIDP_PREPARSED_DATA prepared = nullptr; HIDP_CAPS caps{};
        const bool match = HidD_GetAttributes(d->h, &attrs) && attrs.VendorID == 0x372e &&
            attrs.ProductID == 0x103e && HidD_GetPreparsedData(d->h, &prepared) &&
            HidP_GetCaps(prepared, &caps) == HIDP_STATUS_SUCCESS && caps.UsagePage == 0xff60 &&
            caps.Usage == 0x61 && caps.InputReportByteLength >= 64 && caps.OutputReportByteLength >= 64;
        if (prepared) HidD_FreePreparsedData(prepared);
        if (match) { ++matches; d->input = caps.InputReportByteLength; d->output = caps.OutputReportByteLength; result = std::move(d); }
    }
    SetupDiDestroyDeviceInfoList(list);
    if (matches != 1) result.reset();
    return result;
}
bool io(Device& d, std::vector<unsigned char>& buffer, bool write, DWORD timeout, DWORD& count) {
    OVERLAPPED ov{}; ov.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!ov.hEvent) return false;
    BOOL okay = write ? WriteFile(d.h, buffer.data(), DWORD(buffer.size()), &count, &ov)
                      : ReadFile(d.h, buffer.data(), DWORD(buffer.size()), &count, &ov);
    if (!okay && GetLastError() == ERROR_IO_PENDING) {
        if (WaitForSingleObject(ov.hEvent, timeout) == WAIT_OBJECT_0)
            okay = GetOverlappedResult(d.h, &ov, &count, FALSE);
        else { CancelIoEx(d.h, &ov); WaitForSingleObject(ov.hEvent, INFINITE); okay = FALSE; }
    }
    CloseHandle(ov.hEvent); return !!okay;
}
bool valid(const unsigned char* p, size_t n) {
    unsigned sum = 0; for (size_t i = 0; i < 64 && i < n; ++i) sum += p[i];
    return n >= 64 && p[0] == 9 && p[6] <= 56 && (sum & 255) == 255;
}
// This private bridge accepts only volatile RGB, passive Hall reads and identity.
bool allowed(const std::array<unsigned char,64>& p) {
    if (!valid(p.data(), p.size())) return false;
    return (p[1] == 8 && (p[2] == 1 || (p[2] == 2 && p[6] == 3))) ||
           (p[1] == 0x98 && p[2] == 1 && p[6] > 0 && p[6] <= 18 && p[6] % 2 == 0) ||
           (p[1] == 0x82 && p[2] == 1);
}
int main() {
    std::unique_ptr<Device> device;
    HANDLE timer = CreateWaitableTimerExW(nullptr, nullptr, 0x00000002, TIMER_MODIFY_STATE | SYNCHRONIZE);
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.rfind("wait:", 0) == 0) {
            double delay = 0;
            try { delay = std::stod(line.substr(5)); } catch (...) {}
            if (std::isfinite(delay) && delay > 0 && delay <= 25) {
                LARGE_INTEGER due{}; due.QuadPart = -static_cast<LONGLONG>(delay * 10000);
                if (timer && SetWaitableTimer(timer, &due, 0, nullptr, nullptr, FALSE)) WaitForSingleObject(timer, INFINITE);
                else Sleep(static_cast<DWORD>(std::ceil(delay)));
            }
            std::cout << "waited" << std::endl; continue;
        }
        if (line == "close") { device.reset(); std::cout << "closed" << std::endl; continue; }
        std::array<unsigned char,64> request{};
        bool parsed = line.size() == 128;
        auto digit = [](char c) { return c >= '0' && c <= '9' ? c-'0' : c >= 'a' && c <= 'f' ? c-'a'+10 : -1; };
        for (size_t i = 0; parsed && i < 64; ++i) {
            int a = digit(line[i*2]), b = digit(line[i*2+1]);
            if (a < 0 || b < 0) parsed = false; else request[i] = static_cast<unsigned char>(a*16+b);
        }
        if (!parsed || !allowed(request)) { std::cout << "error:request" << std::endl; continue; }
        if (!device) device = openDevice();
        if (!device) { std::cout << "error:disconnected" << std::endl; continue; }
        std::vector<unsigned char> output(device->output);
        std::copy(request.begin(), request.end(), output.begin());
        DWORD count = 0;
        bool okay = io(*device, output, true, 100, count) && count == output.size();
        // Live RGB is fire-and-forget; firmware does not emit a CMD08 ACK.
        // Echo the submitted report after OS write completion to acknowledge IPC.
        if (request[1] == 8 && okay) {
            for (auto v : request) std::cout << std::hex << std::setw(2) << std::setfill('0') << unsigned(v);
            std::cout << std::endl;
            continue;
        }
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(100);
        std::vector<unsigned char> input(device->input);
        bool replied = false;
        while (okay && std::chrono::steady_clock::now() < deadline) {
            okay = io(*device, input, false, 100, count);
            if (!okay) break;
            if (!valid(input.data(), count) || input[1] != request[1] || input[2] != request[2]) continue;
            if (request[1] == 0x98) {
                if (input[6] != request[6]*3) continue;
                bool positions = true;
                for (unsigned i = 0; i < request[6]/2; ++i)
                    positions &= input[7+i*6] == request[7+i*2] && input[8+i*6] == request[8+i*2];
                if (!positions) continue;
            }
            replied = true; break;
        }
        if (!replied) { device.reset(); std::cout << "error:timeout" << std::endl; continue; }
        for (unsigned i = 0; i < 64; ++i) std::cout << std::hex << std::setw(2) << std::setfill('0') << unsigned(input[i]);
        std::cout << std::endl;
    }
    if (timer) CloseHandle(timer);
}
