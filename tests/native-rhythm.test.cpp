#include "../service/native/rhythm_core.h"
#include <cassert>
#include <iostream>
#include <set>
#include <chrono>
#include <numeric>
using namespace rhythm;
int main() {
  assert(std::set<uint8_t>(positions.begin(),positions.end()).size()==68);
  assert(positions[62]==71); // AltRight is a real LED, not a layout placeholder.
  for(const auto& groups:bloomPatterns){std::set<uint8_t> seen;for(const auto& g:groups)seen.insert(g.begin(),g.end());for(auto p:positions)assert(seen.count(p));}
  float samples[]={-1,.5f,.2f};assert(std::abs(envelope(samples,3)-.6)<.00001);assert(envelope(nullptr,0)==0);
  const float stereo[]={.5f,-.25f},surround[]={1,.5f,.25f,0,-.25f,-.5f,-1,0};
  assert(monoSample(reinterpret_cast<const uint8_t*>(stereo),2,4,true)==.125);
  assert(monoSample(reinterpret_cast<const uint8_t*>(surround),8,4,true)==0);
  const int16_t pcm16[]={16384,-8192};assert(monoSample(reinterpret_cast<const uint8_t*>(pcm16),2,2,false)==.125);
  const uint8_t pcm24[]={0,0,0x40,0,0,0xe0};assert(monoSample(pcm24,2,3,false)==.125);
  const int32_t pcm32[]={1073741824,-536870912};assert(monoSample(reinterpret_cast<const uint8_t*>(pcm32),2,4,false)==.125);
  const float invalid[]={NAN,.5f};assert(monoSample(reinterpret_cast<const uint8_t*>(invalid),2,4,true)==.25);
  std::array<float,256> silence{};for(int window=0;window<3;++window)for(auto x:fft(silence,window,1050))assert(x==0&&std::isfinite(x));
  std::array<float,256> sine{};for(int i=0;i<256;++i)sine[i]=float(.001*std::sin(2*pi*8*i/256));
  for(int window=0;window<3;++window){auto bins=fft(sine,window,1050);assert(bins[8]>bins[2]&&bins[8]>bins[24]);for(auto x:bins)assert(std::isfinite(x)&&x>=0&&x<=1);}
  for(int frequency=1;frequency<64;++frequency){for(int i=0;i<256;++i)sine[i]=float(.001*std::sin(2*pi*frequency*i/256));auto bins=fft(sine,0,1050);assert(std::max_element(bins.begin(),bins.end())-bins.begin()==frequency);}
  sine.fill(0);sine[128]=1;for(auto x:fft(sine,0,1050))assert(std::isfinite(x)&&x>0);
  Frame rainbow;for(int i=0;i<68;++i)rainbow.keys[i]={uint8_t(i*3),uint8_t(i*7),uint8_t(i*13)};rainbow.keys[0]={};
  auto encoded=encode(rainbow);assert(encoded.packets.size()<=4);assert(encoded.keys[0]==Color{});
  std::vector<uint8_t> body;for(size_t i=0;i<encoded.packets.size();++i){const auto& p=encoded.packets[i];assert(p[0]==9&&p[1]==8&&p[2]==1&&p[4]==encoded.packets.size()&&p[5]==i&&p[6]<=56);assert((std::accumulate(p.begin(),p.end(),0)&255)==255);body.insert(body.end(),p.begin()+7,p.begin()+7+p[6]);}
  assert(body.size()<=196);std::set<int> transmitted;
  for(size_t i=0;i<body.size();){assert(body[i+3]>0);for(size_t j=0;j<body[i+3];++j)assert(transmitted.insert(body[i+4+j]).second);i+=4+body[i+3];assert(i<=body.size());}
  assert(transmitted.size()==68);assert(transmitted.count(71));
  for(int mode:{169,170,171,172,173,180,428}) {
    Engine engine;Config config;config.keyMode=mode;config.palette=0;config.releaseMs=80;engine.configure(config);
    Audio audio;audio.envelope=.8;audio.samples=sine;audio.sequence=1;audio.generation=1;audio.receivedMs=1000;
    auto frame=engine.render(audio,1000);assert(frame.level>.9);
    auto packets=encode(frame).packets;assert(!packets.empty());if(mode==171)assert(packets.size()==1&&packets[0][2]==2);
    for(const auto& p:packets)assert((std::accumulate(p.begin(),p.end(),0)&255)==255);
    audio.envelope=0;audio.samples={};audio.sequence++;audio.receivedMs=1017;
    assert(engine.render(audio,1017).level<frame.level);
    for(double t=1050;t<2200;t+=17){audio.receivedMs=t;audio.sequence++;frame=engine.render(audio,t);}
    assert(frame.level==0);for(auto c:frame.keys)assert(c==Color{});
    audio.envelope=1;audio.receivedMs=2200;audio.sequence++;assert(engine.render(audio,2200).level>.9);
    audio={};audio.generation=2;frame=engine.render(audio,2217);assert(frame.level==0);for(auto c:frame.keys)assert(c==Color{});
  }
  Engine stream;Config c;c.keyMode=172;c.palette=0;c.releaseMs=0;stream.configure(c);
  Audio a;a.sequence=1;a.receivedMs=1000;a.envelope=1;auto f=stream.render(a,1000);assert(f.keys[0]!=Color{});assert(f.keys[1]==Color{});
  a.sequence++;a.receivedMs=1030;a.envelope=0;f=stream.render(a,1030);assert(f.keys[0]==Color{});assert(f.keys[1]!=Color{});
  for(int mode:{500,501,502,503}){c.sideMode=mode;stream.configure(c);a.sequence++;a.envelope=.7;a.receivedMs=1060;f=stream.render(a,1060);const auto packets=encodeSide(f,mode);if(mode==500)assert(packets.empty());for(const auto& p:packets){assert(p[1]==14);assert((std::accumulate(p.begin(),p.end(),0)&255)==255);}}
  const auto begin=std::chrono::steady_clock::now();for(int i=0;i<1000;++i)encode(rainbow);
  const double ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-begin).count()/1000;
  std::cout<<"Native rhythm tests passed; worst-palette encode mean "<<ms<<" ms\n";
}
