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
// Configuration commands used by OpenHero68, plus volatile RGB and passive Hall.
// Firmware update, reset and calibration commands remain excluded.
bool allowed(const std::array<unsigned char,64>& p) {
    if (!valid(p.data(), p.size())) return false;
    const auto c=p[1], z=p[2], n=p[6];
    const bool config =
        ((c==3||c==0x83||c==0x12||c==0x92)&&z<=2) ||
        ((c==0x13||c==0x15||c==0x16||c==0x19||c==0x93||c==0x95||c==0x96||c==0x99)&&z==0&&n>0) ||
        (c==0x10&&z==0&&n==1&&p[7]<=2) || ((c==0x90||c==0x87)&&z==0) ||
        ((c==0x1a||c==0x9a)&&z<=2) || (c==5&&z==0) ||
        ((c==4||c==0x84)&&(z==1||z==6||z==17||z==19||z==21||z==23||z==24||z==25||z==29||z==30)) ||
        ((c==6||c==0x86)&&z==0) ||
        (c==0x82&&(z==1||z==2||z==3||z==4||z==6||z==8||z==9));
    return config || (p[1] == 8 && (p[2] == 1 || (p[2] == 2 && p[6] == 3))) ||
           (p[1] == 0x98 && p[2] == 1 && p[6] > 0 && p[6] <= 18 && p[6] % 2 == 0) ||
           false;
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
        const bool sendOnly=line.rfind("send:",0)==0;
        if(sendOnly)line=line.substr(5);
        std::array<unsigned char,64> request{};
        bool parsed = line.size() == 128;
        auto digit = [](char c) { return c >= '0' && c <= '9' ? c-'0' : c >= 'a' && c <= 'f' ? c-'a'+10 : -1; };
        for (size_t i = 0; parsed && i < 64; ++i) {
            int a = digit(line[i*2]), b = digit(line[i*2+1]);
            if (a < 0 || b < 0) parsed = false; else request[i] = static_cast<unsigned char>(a*16+b);
        }
        if (!parsed || !allowed(request) || (sendOnly && !(request[1]==4 && request[2]==23 && request[6]==1 && request[7]<=6))) { std::cout << "error:request" << std::endl; continue; }
        if (!device) device = openDevice();
        if (!device) { std::cout << "error:disconnected" << std::endl; continue; }
        std::vector<unsigned char> output(device->output);
        std::copy(request.begin(), request.end(), output.begin());
        DWORD count = 0;
        bool okay = io(*device, output, true, 100, count) && count == output.size();
        // Live RGB is fire-and-forget; firmware does not emit a CMD08 ACK.
        // Echo the submitted report after OS write completion to acknowledge IPC.
        if ((request[1] == 8 || sendOnly) && okay) {
            for (auto v : request) std::cout << std::hex << std::setw(2) << std::setfill('0') << unsigned(v);
            std::cout << std::endl;
            continue;
        }
        const DWORD replyTimeout = request[1]==0x98 ? 100 : 800;
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(replyTimeout);
        std::vector<unsigned char> input(device->input);
        bool replied = false;
        while (okay && std::chrono::steady_clock::now() < deadline) {
            okay = io(*device, input, false, replyTimeout, count);
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
