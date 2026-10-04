#define NOMINMAX
#include <windows.h>
#include <setupapi.h>
#include <hidsdi.h>
#include <hidpi.h>
#include <psapi.h>
#pragma comment(lib,"psapi.lib")
#include <array>
#include <vector>
#include <string>
#include <iostream>
#include <iomanip>
#include <memory>
#include <chrono>
#include <cmath>
#include <mutex>
#include <thread>
#include <cwctype>
#include <deque>
#include <sstream>
#include "rhythm_audio.h"
#include "gamepad_output.h"

std::mutex outputMutex;
std::atomic<bool> powerSuspended{false};
std::atomic<gamepad::Output*> powerGamepad{nullptr};
void emitLine(const std::string& value) {
    std::lock_guard<std::mutex> guard(outputMutex);
    std::cout << value << std::endl;
}
bool heroKeyboard(HANDLE handle) {
    if (!handle) return false;
    UINT length = 0;
    if (GetRawInputDeviceInfoW(handle, RIDI_DEVICENAME, nullptr, &length) != 0 || !length) return false;
    std::wstring name(length, L'\0');
    if (GetRawInputDeviceInfoW(handle, RIDI_DEVICENAME, name.data(), &length) == UINT(-1)) return false;
    for (auto& ch : name) ch = std::towupper(ch);
    return name.find(L"VID_372E") != std::wstring::npos && name.find(L"PID_103E") != std::wstring::npos;
}
LRESULT CALLBACK rawWindow(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
    if(message==WM_POWERBROADCAST){
        if(wparam==PBT_APMSUSPEND){powerSuspended=true;if(auto p=powerGamepad.load())p->pause(true);}
        if(wparam==PBT_APMRESUMEAUTOMATIC||wparam==PBT_APMRESUMESUSPEND)powerSuspended=false;
    }
    if (message == WM_INPUT) {
        UINT length = 0;
        if (GetRawInputData(reinterpret_cast<HRAWINPUT>(lparam), RID_INPUT, nullptr, &length, sizeof(RAWINPUTHEADER)) == 0 && length >= sizeof(RAWINPUTHEADER)) {
            std::vector<BYTE> bytes(length);
            if (GetRawInputData(reinterpret_cast<HRAWINPUT>(lparam), RID_INPUT, bytes.data(), &length, sizeof(RAWINPUTHEADER)) == length) {
                const auto* raw = reinterpret_cast<const RAWINPUT*>(bytes.data());
                if (raw->header.dwType == RIM_TYPEKEYBOARD && heroKeyboard(raw->header.hDevice)) {
                    const auto& key = raw->data.keyboard;
                    if (key.MakeCode && !(key.Flags & RI_KEY_E1)) {
                        const unsigned scan = key.MakeCode | ((key.Flags & RI_KEY_E0) ? 0x100 : 0);
                        char line[40];
                        sprintf_s(line, "key:%03x:%d", scan, (key.Flags & RI_KEY_BREAK) ? 0 : 1);
                        emitLine(line);
                    }
                }
            }
        }
    }
    return DefWindowProcW(window, message, wparam, lparam);
}
DWORD WINAPI rawThread(LPVOID) {
    HINSTANCE module = GetModuleHandleW(nullptr);
    WNDCLASSW wc{}; wc.hInstance = module; wc.lpfnWndProc = rawWindow; wc.lpszClassName = L"OpenHero68RawKeyboard";
    RegisterClassW(&wc);
    HWND window = CreateWindowExW(0, wc.lpszClassName, L"OpenHero68 Input", WS_OVERLAPPED, 0, 0, 0, 0, nullptr, nullptr, module, nullptr);
    if (!window) { emitLine("raw:unavailable"); return 1; }
    RAWINPUTDEVICE input{}; input.usUsagePage = 1; input.usUsage = 6; input.dwFlags = RIDEV_INPUTSINK; input.hwndTarget = window;
    emitLine(RegisterRawInputDevices(&input, 1, sizeof(input)) ? "raw:ready" : "raw:unavailable");
    MSG message;
    while (GetMessageW(&message, nullptr, 0, 0) > 0) { TranslateMessage(&message); DispatchMessageW(&message); }
    DestroyWindow(window); return 0;
}

struct Device {
    HANDLE h = INVALID_HANDLE_VALUE;
    std::wstring identity;
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
        if (match) { ++matches; d->identity=detail->DevicePath;wchar_t serial[256]{};if(HidD_GetSerialNumberString(d->h,serial,sizeof(serial)))d->identity+=std::wstring(L"|")+serial;d->input = caps.InputReportByteLength; d->output = caps.OutputReportByteLength; result = std::move(d); }
    }
    SetupDiDestroyDeviceInfoList(list);
    if (matches != 1) result.reset();
    else if(result)HidD_FlushQueue(result->h);
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
struct ProcessMetrics {
    double at=0,cpu=0,rss=0;uint64_t ticks=0;
    void update(double now){if(now-at<1000)return;FILETIME created,ended,kernel,user;PROCESS_MEMORY_COUNTERS memory{};
      if(GetProcessTimes(GetCurrentProcess(),&created,&ended,&kernel,&user)){const uint64_t next=(uint64_t(kernel.dwHighDateTime)<<32)+kernel.dwLowDateTime+(uint64_t(user.dwHighDateTime)<<32)+user.dwLowDateTime;if(at)cpu=(next-ticks)/(now-at)/100.;ticks=next;}
      if(GetProcessMemoryInfo(GetCurrentProcess(),&memory,sizeof(memory)))rss=memory.WorkingSetSize/1048576.;at=now;
    }
};
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
    DWORD schedulingTask=0;HANDLE scheduling=AvSetMmThreadCharacteristicsW(L"Playback",&schedulingTask);
    HANDLE rawWorker = CreateThread(nullptr, 0, rawThread, nullptr, 0, nullptr);
    std::unique_ptr<Device> device;
    HANDLE timer = CreateWaitableTimerExW(nullptr, nullptr, 0x00000002, TIMER_MODIFY_STATE | SYNCHRONIZE);
    if (!timer) timer = CreateWaitableTimerW(nullptr, FALSE, nullptr);
    HANDLE ready = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    std::mutex queueMutex;std::deque<std::string> queue;std::atomic<bool> ended{false};
    std::thread reader([&] { std::string line;while(std::getline(std::cin,line)) { {std::lock_guard<std::mutex> lock(queueMutex);queue.push_back(std::move(line));}SetEvent(ready); }ended=true;SetEvent(ready); });
    rhythm::Capture capture;rhythm::Engine engine;bool rhythmActive=false,rhythmPaused=false,customActive=false;
    hall::Scheduler hallScheduler;gamepad::Config gamepadConfig;gamepad::Output gamepadOutput;
    powerGamepad=&gamepadOutput;
    bool gamepadPaused=false,hallFault=false,ioPaused=false,wasSuspended=false,wasGamepadEnabled=false;
    auto setGamepadPause=[&]{gamepadOutput.pause(gamepadPaused||rhythmPaused||powerSuspended.load()||hallFault||ioPaused);};
    std::array<double,hall::Capacity> consumerHz{};std::array<bool,hall::Capacity> hallDirty{};
    double nextHallPublish=0,nextGamepadPublish=0,nextInputPublish=0;bool inputStreaming=false;uint64_t inputSequence=0;
    ProcessMetrics processMetrics;
    auto updateHall=[&]{auto hz=consumerHz;if(gamepadOutput.enabled())for(const auto& b:gamepadConfig.bindings)hz[b.pos]=std::max(hz[b.pos],double(gamepad::analog(b.action)?gamepadConfig.rate:100));hallScheduler.configure(hz,rhythm::clockMs());};
    std::vector<rhythm::Report> customBatch;uint64_t submission=0,lastSubmission=0,reusedFrames=0;
    double nextFrame=0,reconnectAt=0,lastFrame=0;uint64_t dropped=0,lastAudioSequence=0;
    auto parseReport=[](const std::string& text,std::array<unsigned char,64>& request) {
        if(text.size()!=128)return false;
        auto digit=[](char c){return c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:-1;};
        for(size_t i=0;i<64;++i){int a=digit(text[i*2]),b=digit(text[i*2+1]);if(a<0||b<0)return false;request[i]=static_cast<unsigned char>(a*16+b);}return allowed(request);
    };
    auto writeReport=[&](const rhythm::Report& request) {
        if(!device)device=openDevice();if(!device)return false;
        std::vector<unsigned char> output(device->output);std::copy(request.begin(),request.end(),output.begin());DWORD count=0;
        return io(*device,output,true,100,count)&&count==output.size();
    };
    auto pollSharedHall=[&](double now){
      auto ids=hallScheduler.batch(now);if(ids.empty())return;
      hallScheduler.requests++;
      if(!device)device=openDevice();
      if(!device){hallScheduler.failed(now);hallFault=true;setGamepadPause();emitLine("hall-error:Device disconnected");return;}
      std::vector<uint8_t> positions;for(auto id:ids){positions.push_back(uint8_t(id>>8));positions.push_back(uint8_t(id));}
      auto packet=rhythm::report(0x98,1,1,0,positions);
      std::vector<unsigned char> output(device->output),input(device->input);std::copy(packet.begin(),packet.end(),output.begin());DWORD count=0;
      bool okay=io(*device,output,true,20,count)&&count==output.size(),matched=false;
      const double limit=rhythm::clockMs()+20;
      while(okay&&rhythm::clockMs()<limit){
        okay=io(*device,input,false,DWORD(std::max(1.,limit-rhythm::clockMs())),count);
        if(!okay)break;matched=hall::matchesReply(input.data(),count,ids);if(matched)break;
      }
      if(!matched){device.reset();hallScheduler.failed(rhythm::clockMs());hallFault=true;setGamepadPause();emitLine("hall-error:Hall request timed out");return;}
      const double at=rhythm::clockMs();hallFault=false;setGamepadPause();hallScheduler.success();
      for(size_t i=0;i<ids.size();i++){size_t o=7+i*6;uint16_t word=uint16_t(input[o+4]*256+input[o+5]);hallScheduler.received(ids[i],uint16_t(input[o+2]*256+input[o+3]),word&0x7fff,!!(word&0x8000),at);hallDirty[ids[i]]=true;gamepadOutput.sample(ids[i],hallScheduler.samples[ids[i]]);}
    };
    while (!ended) {
      const double now=rhythm::clockMs();
      if(inputStreaming&&now>=nextInputPublish){auto value=gamepadOutput.input();value.pop_back();emitLine("gamepad-input:"+value+",\"sequence\":"+std::to_string(++inputSequence)+"}");nextInputPublish=now+1000./60;}
      if(wasGamepadEnabled!=gamepadOutput.enabled()){wasGamepadEnabled=gamepadOutput.enabled();updateHall();}
      if(wasSuspended!=powerSuspended.load()){wasSuspended=powerSuspended.load();for(auto& sample:hallScheduler.samples)sample={};for(auto& due:hallScheduler.due)due=now;setGamepadPause();emitLine(wasSuspended?"power:suspend":"power:resume");}
      if(!rhythmPaused&&!gamepadPaused&&!powerSuspended.load())pollSharedHall(now);
      if(now>=nextHallPublish&&hallScheduler.active()){
        std::ostringstream event;event<<std::setprecision(15)<<"hall-snapshot:{\"publishedMs\":"<<rhythm::clockMs()<<",\"requests\":"<<hallScheduler.requests<<",\"timeouts\":"<<hallScheduler.timeouts<<",\"records\":[";bool comma=false;
        for(size_t pos=0;pos<hall::Capacity;pos++)if(hallDirty[pos]&&hallScheduler.hz[pos]>0){const auto& s=hallScheduler.samples[pos];if(!s.sequence)continue;if(comma)event<<',';comma=true;event<<"{\"pos\":"<<pos<<",\"distanceUnits\":"<<s.distance<<",\"adc\":"<<s.adc<<",\"pressed\":"<<(s.pressed?"true":"false")<<",\"timestampMs\":"<<s.at<<",\"sequence\":"<<s.sequence<<"}";hallDirty[pos]=false;}
        event<<"]}";if(comma)emitLine(event.str());nextHallPublish=now+10;
      }
      if(now>=nextGamepadPublish){emitLine("gamepad-status:"+gamepadOutput.status());processMetrics.update(now);std::ostringstream stats;stats<<"hall-stats:{\"requests\":"<<hallScheduler.requests<<",\"timeouts\":"<<hallScheduler.timeouts<<",\"nativeCpuPercent\":"<<processMetrics.cpu<<",\"nativeRssMB\":"<<processMetrics.rss<<",\"keys\":[";bool comma=false;for(size_t pos=0;pos<hall::Capacity;pos++)if(hallScheduler.hz[pos]){if(comma)stats<<',';comma=true;stats<<"{\"pos\":"<<pos<<",\"requestedHz\":"<<hallScheduler.hz[pos]<<",\"hz\":"<<hallScheduler.measuredHz(pos,now)<<",\"intervalP99Ms\":"<<hallScheduler.lifetimeP99(pos)<<",\"recentIntervalP99Ms\":"<<hallScheduler.p99(pos)<<"}";}stats<<"]}";emitLine(stats.str());nextGamepadPublish=now+250;}
      if(customActive && !rhythmPaused && !powerSuspended.load() && now>=nextFrame) {
        if(now-nextFrame>=1000./60)dropped+=uint64_t((now-nextFrame)/(1000./60));
        nextFrame+=1000./60;if(nextFrame<=now)nextFrame=now+1000./60;
        if(!customBatch.empty()&&now>=reconnectAt){
          bool okay=true;for(const auto& p:customBatch)if(!writeReport(p)){okay=false;break;}
          if(okay){double completed=rhythm::clockMs();if(submission==lastSubmission)++reusedFrames;lastSubmission=submission;
            std::ostringstream event;event<<"custom-frame:{\"submission\":"<<submission<<",\"packets\":"<<customBatch.size()<<",\"frameMs\":"<<completed-now<<",\"gapMs\":"<<(lastFrame?completed-lastFrame:0)<<",\"droppedFrames\":"<<dropped<<",\"reusedFrames\":"<<reusedFrames<<"}";emitLine(event.str());lastFrame=completed;
          }else{gamepadOutput.pause(true);hallFault=true;device.reset();hallScheduler.failed(rhythm::clockMs());reconnectAt=now+1000;emitLine("custom-error:Device disconnected or RGB write failed");}
        }
        emitLine("custom-tick:");
      }
      if(rhythmActive && !rhythmPaused && !powerSuspended.load() && now>=nextFrame) {
        if(now-nextFrame>=1000./60)dropped+=uint64_t((now-nextFrame)/(1000./60));
        nextFrame+=1000./60;if(nextFrame<=now)nextFrame=now+1000./60;
        if(now>=reconnectAt) {
          auto audio=capture.snapshot();const auto frame=engine.render(audio.audio,now);const double renderedAt=rhythm::clockMs();const auto encoded=rhythm::encode(frame);const double encodedAt=rhythm::clockMs();
          bool okay=true;for(const auto& p:encoded.packets)if(!writeReport(p)){okay=false;break;}
          if(okay) {
            const double completed=rhythm::clockMs();std::ostringstream event;
            event<<"rhythm-frame:{\"colors\":[";
            for(size_t i=0;i<encoded.keys.size();++i){if(i)event<<',';char color[8];sprintf_s(color,"#%02x%02x%02x",encoded.keys[i][0],encoded.keys[i][1],encoded.keys[i][2]);event<<rhythm::jsonString(color);}
            event<<"],\"packets\":"<<encoded.packets.size()<<",\"frameMs\":"<<completed-now<<",\"gapMs\":"<<(lastFrame?completed-lastFrame:0)<<",\"droppedFrames\":"<<dropped;
            event<<",\"renderMs\":"<<renderedAt-now<<",\"encodeMs\":"<<encodedAt-renderedAt<<",\"writeMs\":"<<completed-encodedAt;
            event<<",\"audioLevel\":"<<frame.level<<",\"audioState\":"<<rhythm::jsonString(audio.state)<<",\"audioError\":"<<rhythm::jsonString(audio.error)<<",\"sampleRate\":"<<audio.sampleRate<<",\"audioEndpoint\":"<<rhythm::jsonString(audio.endpoint);
            // Silence and repeatedly rendered snapshots are not latency samples.
            const bool freshAudio=audio.audio.sequence!=lastAudioSequence&&audio.audio.envelope>.0001&&audio.audio.sampleQpcMs>0&&completed-audio.audio.receivedMs<100;
            const double sampleLatency=completed-audio.audio.sampleQpcMs;
            event<<",\"audioToWriteMs\":"<<(freshAudio&&sampleLatency>=0?sampleLatency:-1);
            event<<",\"captureToWriteMs\":"<<(freshAudio?completed-audio.audio.receivedMs:-1)<<",\"audioTimestampInvalid\":"<<(freshAudio&&sampleLatency<0?"true":"false")<<"}";
            lastAudioSequence=audio.audio.sequence;
            emitLine(event.str());lastFrame=completed;
          }else{gamepadOutput.pause(true);hallFault=true;device.reset();hallScheduler.failed(rhythm::clockMs());reconnectAt=now+1000;emitLine("rhythm-error:Device disconnected or RGB write failed");}
        }
      }
      std::string line;
      {std::lock_guard<std::mutex> lock(queueMutex);if(!queue.empty()){line=std::move(queue.front());queue.pop_front();}}
      if(line.empty()) {
        if(timer){double deadline=nextGamepadPublish;if(inputStreaming)deadline=std::min(deadline,nextInputPublish);if((rhythmActive||customActive)&&!rhythmPaused&&!powerSuspended.load())deadline=std::min(deadline,nextFrame);if(!rhythmPaused&&!gamepadPaused&&!powerSuspended.load())deadline=std::min(deadline,hallScheduler.deadline());LARGE_INTEGER due{};due.QuadPart=-std::max<LONGLONG>(1,LONGLONG((deadline-rhythm::clockMs())*10000));SetWaitableTimer(timer,&due,0,nullptr,nullptr,FALSE);HANDLE handles[]={ready,timer};WaitForMultipleObjects(2,handles,FALSE,1000);}
        else WaitForSingleObject(ready,1000);
        continue;
      }
      if(line.rfind("hall-config:",0)==0){try{std::array<double,hall::Capacity> hz{};for(auto& p:gamepad::split(line.substr(12),'|')){auto v=gamepad::split(p,',');if(v.size()!=2)throw std::runtime_error("Invalid Hall demand");double pos=gamepad::number(v[0]),rate=gamepad::number(v[1]);if(pos<1||pos>=hall::Capacity||pos!=std::floor(pos)||!hall::heroPosition(unsigned(pos))||rate<1||rate>200)throw std::runtime_error("Invalid Hall rate");hz[size_t(pos)]=std::max(hz[size_t(pos)],rate);}consumerHz=hz;updateHall();emitLine("hall-ready");}catch(const std::exception& e){emitLine("error:"+std::string(e.what()));}continue;}
      if(line.rfind("gamepad-config:",0)==0){try{auto c=gamepad::parse(line.substr(15));gamepadOutput.configure(c);gamepadConfig=c;updateHall();emitLine("gamepad-configured");}catch(const std::exception& e){emitLine("error:"+std::string(e.what()));}continue;}
      if(line=="gamepad-start"||line=="gamepad-start-paused"){gamepadPaused=line=="gamepad-start-paused";if(gamepadOutput.start()){setGamepadPause();updateHall();emitLine("gamepad-ready");}else emitLine("error:"+gamepadOutput.error());continue;}
      if(line=="gamepad-stop"){gamepadOutput.stop();updateHall();emitLine("gamepad-stopped");continue;}
      if(line=="gamepad-status"){emitLine("gamepad-state:"+gamepadOutput.status());continue;}
      if(line=="device-identity"){if(!device)device=openDevice();if(!device){emitLine("error:Device disconnected");continue;}std::ostringstream id;id<<"device-identity:"<<std::hex<<std::setfill('0');for(auto c:device->identity)id<<std::setw(4)<<unsigned(std::towlower(c));emitLine(id.str());continue;}
      if(line=="gamepad-input-on"||line=="gamepad-input-off"){inputStreaming=line=="gamepad-input-on";nextInputPublish=0;emitLine("gamepad-input-ready");continue;}
      if(line=="gamepad-pause"){gamepadPaused=true;setGamepadPause();emitLine("gamepad-paused");continue;}
      if(line=="gamepad-resume"){gamepadPaused=false;setGamepadPause();emitLine("gamepad-resumed");continue;}
      if(line=="audio-devices"){emitLine("audio-devices:"+rhythm::audioDevices());continue;}
      if(line=="custom-start"){rhythmActive=false;capture.stop();customActive=true;customBatch.clear();submission=lastSubmission=reusedFrames=dropped=0;lastFrame=0;rhythmPaused=false;nextFrame=rhythm::clockMs();emitLine("custom-ready");continue;}
      if(line=="custom-stop"){customActive=false;customBatch.clear();emitLine("custom-stopped");continue;}
      if(line=="rhythm-stop"){rhythmActive=false;rhythmPaused=false;capture.stop();engine.reset();emitLine("rhythm-stopped");continue;}
      if(line=="rhythm-pause"){rhythmPaused=true;setGamepadPause();emitLine("rhythm-paused");continue;}
      if(line=="rhythm-resume"){rhythmPaused=false;setGamepadPause();nextFrame=rhythm::clockMs();emitLine("rhythm-resumed");continue;}
      if(line.rfind("rhythm:",0)==0) {
        try {
          rhythm::Config c;std::vector<std::string> fields;std::istringstream parts(line.substr(7));std::string part;while(std::getline(parts,part,';'))fields.push_back(part);
          if(fields.size()!=14)throw std::runtime_error("Invalid rhythm command");
          c.keyMode=std::stoi(fields[0]);c.sideMode=std::stoi(fields[1]);c.brightness=std::stod(fields[2]);c.sensitivity=std::stod(fields[3]);c.releaseMs=std::stod(fields[4]);
          for(int i=0;i<3;++i){int n=std::stoi(fields[5+i]);if(n<0||n>255)throw std::runtime_error("Invalid color");c.color[i]=uint8_t(n);}
          c.palette=std::stoi(fields[8]);c.db=std::stod(fields[9]);c.window=std::stoi(fields[10]);c.spatialRadius=std::stoi(fields[11]);
          // Side protocol is not yet verified on the target board; reject activation honestly.
          if(fields[12]!="1"||c.sideMode!=500)throw std::runtime_error("Side rhythm is not hardware-verified");
          c.endpoint.clear();if(fields[13].size()%2)throw std::runtime_error("Invalid endpoint");
          for(size_t i=0;i<fields[13].size();i+=2)c.endpoint+=char(std::stoi(fields[13].substr(i,2),nullptr,16));
          engine.configure(c);capture.start(c.endpoint);customActive=false;customBatch.clear();if(!rhythmActive){dropped=0;lastFrame=0;nextFrame=rhythm::clockMs();}rhythmActive=true;emitLine("rhythm-ready");
        }catch(const std::exception& e){emitLine("error:"+std::string(e.what()));}
        continue;
      }
      if(line.rfind("batch:",0)==0||line.rfind("frame:",0)==0) {
        const bool queued=line.rfind("frame:",0)==0;uint64_t id=0;std::string payload=line.substr(6);
        if(queued){const auto colon=payload.find(':');try{id=std::stoull(payload.substr(0,colon));if(colon==std::string::npos||!customActive||id==0)throw std::runtime_error("Invalid frame");payload=payload.substr(colon+1);}catch(...){emitLine("error:Invalid frame submission");continue;}}
        std::vector<rhythm::Report> batch;std::istringstream parts(payload);std::string part;bool okay=!rhythmActive;
        while(std::getline(parts,part,',')){rhythm::Report p{};if(!parseReport(part,p)||p[1]!=8||p[2]!=1||p[4]>4||p[4]==0||p[5]!=batch.size()){okay=false;break;}batch.push_back(p);}
        if(batch.empty()||batch.size()>4)okay=false;for(const auto& p:batch)if(p[4]!=batch.size())okay=false;
        if(!okay){emitLine("error:Invalid RGB batch");continue;}
        if(queued){customBatch=std::move(batch);submission=id;emitLine("frame-queued");continue;}
        for(const auto& p:batch)if(!writeReport(p)){okay=false;break;}
        if(!okay){device.reset();emitLine("error:RGB batch write failed");}else emitLine("batch-written");continue;
      }
        if (line.rfind("wait:", 0) == 0) {
            double delay = 0;
            try { delay = std::stod(line.substr(5)); } catch (...) {}
            if (std::isfinite(delay) && delay > 0 && delay <= 25) {
                LARGE_INTEGER due{}; due.QuadPart = -static_cast<LONGLONG>(delay * 10000);
                if (timer && SetWaitableTimer(timer, &due, 0, nullptr, nullptr, FALSE)) WaitForSingleObject(timer, INFINITE);
                else Sleep(static_cast<DWORD>(std::ceil(delay)));
            }
            emitLine("waited"); continue;
        }
        if (line == "close") { hallFault=true;setGamepadPause();device.reset();hallScheduler.failed(rhythm::clockMs());reconnectAt=rhythm::clockMs()+1000; emitLine("closed"); continue; }
        const bool sendOnly=line.rfind("send:",0)==0;
        if(sendOnly)line=line.substr(5);
        std::array<unsigned char,64> request{};
        bool parsed = line.size() == 128;
        auto digit = [](char c) { return c >= '0' && c <= '9' ? c-'0' : c >= 'a' && c <= 'f' ? c-'a'+10 : -1; };
        for (size_t i = 0; parsed && i < 64; ++i) {
            int a = digit(line[i*2]), b = digit(line[i*2+1]);
            if (a < 0 || b < 0) parsed = false; else request[i] = static_cast<unsigned char>(a*16+b);
        }
        if (!parsed || !allowed(request) || (sendOnly && !(request[1]==4 && request[2]==23 && request[6]==1 && request[7]<=6))) { emitLine("error:request"); continue; }
        ioPaused=true;setGamepadPause();
        if (!device) device = openDevice();
        if (!device) { hallFault=true;ioPaused=false;setGamepadPause();hallScheduler.failed(rhythm::clockMs());emitLine("error:disconnected"); continue; }
        std::vector<unsigned char> output(device->output);
        std::copy(request.begin(), request.end(), output.begin());
        DWORD count = 0;
        bool okay = io(*device, output, true, 100, count) && count == output.size();
        // Live RGB is fire-and-forget; firmware does not emit a CMD08 ACK.
        // Echo the submitted report after OS write completion to acknowledge IPC.
        if ((request[1] == 8 || sendOnly) && okay) {
            ioPaused=false;setGamepadPause();
            std::lock_guard<std::mutex> guard(outputMutex);
            for (auto v : request) std::cout << std::hex << std::setw(2) << std::setfill('0') << unsigned(v);
            std::cout << std::endl;
            continue;
        }
        const DWORD replyTimeout = request[1]==0x98 ? 100 : 800;
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(replyTimeout);
        std::vector<unsigned char> input(device->input);
        bool replied = false;
        while (okay && std::chrono::steady_clock::now() < deadline) {
            const auto remaining=std::chrono::duration_cast<std::chrono::milliseconds>(deadline-std::chrono::steady_clock::now()).count();
            okay = io(*device, input, false,DWORD(std::max<int64_t>(1,remaining)), count);
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
        if (!replied) { device.reset();hallFault=true;ioPaused=false;setGamepadPause();hallScheduler.failed(rhythm::clockMs());emitLine("error:timeout"); continue; }
        ioPaused=false;setGamepadPause();
        std::lock_guard<std::mutex> guard(outputMutex);
        for (unsigned i = 0; i < 64; ++i) std::cout << std::hex << std::setw(2) << std::setfill('0') << unsigned(input[i]);
        std::cout << std::endl;
    }
    powerGamepad=nullptr;gamepadOutput.stop();capture.stop();reader.join();CloseHandle(ready);
    if(scheduling)AvRevertMmThreadCharacteristics(scheduling);
    if (timer) CloseHandle(timer);
    if (rawWorker) {PostThreadMessageW(GetThreadId(rawWorker),WM_QUIT,0,0);WaitForSingleObject(rawWorker,1000);CloseHandle(rawWorker);}
}
