#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <functiondiscoverykeys_devpkey.h>
#include <avrt.h>
#include <wrl/client.h>
#include <atomic>
#include <mutex>
#include <thread>
#include <sstream>
#include "rhythm_core.h"

namespace rhythm {
using Microsoft::WRL::ComPtr;
inline double clockMs() { LARGE_INTEGER n,f;QueryPerformanceCounter(&n);QueryPerformanceFrequency(&f);return double(n.QuadPart)*1000/f.QuadPart; }
inline std::string utf8(const std::wstring& w) {
  if(w.empty())return {};int size=WideCharToMultiByte(CP_UTF8,0,w.data(),int(w.size()),nullptr,0,nullptr,nullptr);std::string s(size,0);WideCharToMultiByte(CP_UTF8,0,w.data(),int(w.size()),s.data(),size,nullptr,nullptr);return s;
}
inline std::wstring wide(const std::string& s) {
  if(s.empty())return {};int size=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,s.data(),int(s.size()),nullptr,0);std::wstring w(size,0);MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,s.data(),int(s.size()),w.data(),size);return w;
}
inline std::string jsonString(const std::string& text) {
  std::string out="\"";for(unsigned char c:text) { if(c=='"'||c=='\\'){out+='\\';out+=c;}else if(c<32){char b[7];sprintf_s(b,"\\u%04x",c);out+=b;}else out+=c; }return out+'"';
}
inline std::string deviceId(IMMDevice* device) { LPWSTR id=nullptr;if(FAILED(device->GetId(&id)))return {};auto result=utf8(id);CoTaskMemFree(id);return result; }
inline std::string audioDevices() {
  HRESULT init=CoInitializeEx(nullptr,COINIT_MULTITHREADED);
  ComPtr<IMMDeviceEnumerator> en;ComPtr<IMMDeviceCollection> devices;std::string out="[]";
  if(SUCCEEDED(CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&en)))&&SUCCEEDED(en->EnumAudioEndpoints(eRender,DEVICE_STATE_ACTIVE,&devices))) {
    ComPtr<IMMDevice> def;en->GetDefaultAudioEndpoint(eRender,eConsole,&def);const std::string current=def?deviceId(def.Get()):"";
    UINT count=0;devices->GetCount(&count);out="[";
    for(UINT i=0;i<count;++i) {
      ComPtr<IMMDevice> d;ComPtr<IPropertyStore> props;PROPVARIANT v;PropVariantInit(&v);
      if(FAILED(devices->Item(i,&d)))continue;
      std::string id=deviceId(d.Get()),name=id;
      if(SUCCEEDED(d->OpenPropertyStore(STGM_READ,&props))&&SUCCEEDED(props->GetValue(PKEY_Device_FriendlyName,&v))&&v.vt==VT_LPWSTR)name=utf8(v.pwszVal);
      PropVariantClear(&v);if(out.size()>1)out+=',';out+="{\"id\":"+jsonString(id)+",\"name\":"+jsonString(name)+",\"default\":"+(id==current?"true":"false")+"}";
    }
    out+=']';
  }
  devices.Reset();en.Reset();if(SUCCEEDED(init))CoUninitialize();return out;
}
struct CaptureState { Audio audio;std::string state="stopped",error,endpoint;unsigned sampleRate=0,channels=0;double packetIntervalMs=0; };
class Capture {
  std::mutex mutex_;CaptureState state_;
  std::thread thread_;HANDLE stop_=CreateEventW(nullptr,TRUE,FALSE,nullptr);HANDLE ready_=CreateEventW(nullptr,FALSE,FALSE,nullptr);
  std::string requested_;
  uint64_t generation_=0,sequence_=0;
  void state(const std::string& value,const std::string& error="") { {std::lock_guard<std::mutex> lock(mutex_);state_.state=value;state_.error=error;if(value=="connecting"||value=="unavailable"){state_.audio={};state_.audio.generation=++generation_;}} if(ready_)SetEvent(ready_); }
  void run() {
    HRESULT init=CoInitializeEx(nullptr,COINIT_MULTITHREADED);DWORD task=0;HANDLE mmcss=AvSetMmThreadCharacteristicsW(L"Audio",&task);if(mmcss)AvSetMmThreadPriority(mmcss,AVRT_PRIORITY_HIGH);
    while(WaitForSingleObject(stop_,0)!=WAIT_OBJECT_0) {
      state("connecting");
      try { stream(); }catch(const std::exception& e){state("unavailable",e.what());}
      if(WaitForSingleObject(stop_,500)==WAIT_OBJECT_0)break;
    }
    if(mmcss)AvRevertMmThreadCharacteristics(mmcss);if(SUCCEEDED(init))CoUninitialize();
  }
  static void check(HRESULT hr,const char* message) { if(FAILED(hr))throw std::runtime_error(message); }
  void stream() {
    ComPtr<IMMDeviceEnumerator> en;ComPtr<IMMDevice> device;ComPtr<IAudioClient> client;ComPtr<IAudioCaptureClient> capture;
    check(CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&en)),"Audio device enumeration failed");
    if(requested_=="default")check(en->GetDefaultAudioEndpoint(eRender,eConsole,&device),"No default playback device");
    else check(en->GetDevice(wide(requested_).c_str(),&device),"Selected playback device unavailable");
    const auto id=deviceId(device.Get());check(device->Activate(__uuidof(IAudioClient),CLSCTX_ALL,nullptr,reinterpret_cast<void**>(client.GetAddressOf())),"Cannot activate loopback audio");
    WAVEFORMATEX* raw=nullptr;check(client->GetMixFormat(&raw),"Cannot read audio mix format");
    std::unique_ptr<WAVEFORMATEX,decltype(&CoTaskMemFree)> format(raw,CoTaskMemFree);
    bool floating=raw->wFormatTag==WAVE_FORMAT_IEEE_FLOAT,pcm=raw->wFormatTag==WAVE_FORMAT_PCM;
    if(raw->wFormatTag==WAVE_FORMAT_EXTENSIBLE&&raw->cbSize>=22){const auto* ext=reinterpret_cast<WAVEFORMATEXTENSIBLE*>(raw);floating=ext->SubFormat.Data1==WAVE_FORMAT_IEEE_FLOAT;pcm=ext->SubFormat.Data1==WAVE_FORMAT_PCM;}
    if(!raw->nChannels||!raw->nSamplesPerSec||!(floating&&raw->wBitsPerSample==32)&&!(pcm&&(raw->wBitsPerSample==16||raw->wBitsPerSample==24||raw->wBitsPerSample==32)))throw std::runtime_error("Unsupported loopback sample format");
    HANDLE event=CreateEventW(nullptr,FALSE,FALSE,nullptr);if(!event)throw std::runtime_error("Cannot create audio event");
    struct Event {HANDLE h;~Event(){CloseHandle(h);}} cleanup{event};
    check(client->Initialize(AUDCLNT_SHAREMODE_SHARED,AUDCLNT_STREAMFLAGS_LOOPBACK|AUDCLNT_STREAMFLAGS_EVENTCALLBACK,0,0,raw,nullptr),"Cannot initialize event-driven loopback");
    check(client->SetEventHandle(event),"Cannot bind loopback event");check(client->GetService(IID_PPV_ARGS(&capture)),"Cannot open capture client");
    std::array<float,256> ring{};size_t offset=0;double lastDefaultCheck=clockMs(),lastPacketAt=0,packetIntervalMs=0;
    { std::lock_guard<std::mutex> lock(mutex_);state_={};state_.state="listening";state_.endpoint=id;state_.sampleRate=raw->nSamplesPerSec;state_.channels=raw->nChannels;state_.audio.generation=++generation_; }if(ready_)SetEvent(ready_);
    check(client->Start(),"Cannot start loopback capture");
    HANDLE events[]={stop_,event};
    try {
      while(WaitForMultipleObjects(2,events,FALSE,200)!=WAIT_OBJECT_0) {
        double now=clockMs();
        if(now-lastDefaultCheck>500){lastDefaultCheck=now;if(requested_=="default"){ComPtr<IMMDevice> current;check(en->GetDefaultAudioEndpoint(eRender,eConsole,&current),"Default playback device removed");if(deviceId(current.Get())!=id)break;}}
        UINT32 size=0;check(capture->GetNextPacketSize(&size),"Loopback capture interrupted");
        while(size) {
          BYTE* data=nullptr;UINT32 count=0;DWORD flags=0;UINT64 position=0,qpc=0;
          check(capture->GetBuffer(&data,&count,&flags,&position,&qpc),"Cannot read loopback buffer");
          double peak=0,sum=0;UINT32 peakIndex=0;const unsigned bytes=raw->wBitsPerSample/8;
          if(flags&AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY){ring.fill(0);offset=0;++generation_;}
          for(UINT32 i=0;i<count;++i) {
            double mono=0;
            if(!(flags&AUDCLNT_BUFFERFLAGS_SILENT))mono=monoSample(data+i*raw->nBlockAlign,raw->nChannels,bytes,floating);
            if(mono>peak){peak=mono;peakIndex=i;}sum+=mono;ring[offset]=float(mono);offset=(offset+1)%256;
          }
          Audio a;for(size_t i=0;i<256;++i)a.samples[i]=ring[(offset+i)%256];
          a.envelope=peak>0?std::max(0.,peak-(count?sum/count:0)):0;a.sampleQpcMs=(flags&AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR)?0:double(qpc)/10000+double(peakIndex)*1000/raw->nSamplesPerSec;
          a.receivedMs=clockMs();if(lastPacketAt>0){const double dt=a.receivedMs-lastPacketAt;if(dt>=1&&dt<=50)packetIntervalMs=packetIntervalMs?packetIntervalMs*.8+dt*.2:dt;}lastPacketAt=a.receivedMs;a.generation=generation_;a.sequence=++sequence_;
          check(capture->ReleaseBuffer(count),"Cannot release loopback buffer");
          {std::lock_guard<std::mutex> lock(mutex_);state_.audio=a;state_.packetIntervalMs=packetIntervalMs;state_.state=peak>.0001?"active":"silent";}if(ready_)SetEvent(ready_);
          check(capture->GetNextPacketSize(&size),"Loopback capture interrupted");
        }
      }
    }catch(...){client->Stop();throw;}
    client->Stop();
    {std::lock_guard<std::mutex> lock(mutex_);state_.audio={};state_.audio.generation=++generation_;}if(ready_)SetEvent(ready_);
  }
public:
  ~Capture(){stop();if(ready_)CloseHandle(ready_);CloseHandle(stop_);}
  void start(const std::string& endpoint) { if(thread_.joinable()&&requested_==endpoint)return;stop();requested_=endpoint;ResetEvent(stop_);thread_=std::thread([this]{run();}); }
  void stop(){SetEvent(stop_);if(thread_.joinable())thread_.join();{std::lock_guard<std::mutex> lock(mutex_);state_={};}if(ready_)SetEvent(ready_);}
  HANDLE readyEvent() const { return ready_; }
  CaptureState snapshot(){std::lock_guard<std::mutex> lock(mutex_);return state_;}
};
}
