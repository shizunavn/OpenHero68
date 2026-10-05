#pragma once
#include <array>
#include <vector>
#include <algorithm>
#include <cmath>
#include <complex>
#include <cstdint>
#include <string>
#include <stdexcept>
#include <cstring>
#include "rhythm_profile.h"

namespace rhythm {
constexpr double pi = 3.14159265358979323846;
using Color = std::array<uint8_t, 3>;
using Report = std::array<uint8_t, 64>;
constexpr std::array<uint8_t, 68> positions = {
  1,15,16,17,18,19,20,21,22,23,24,25,26,27,98,
  28,29,30,31,32,33,34,35,36,37,38,39,40,41,99,
  42,43,44,45,46,47,48,49,50,51,52,53,54,102,
  55,56,57,58,59,60,61,62,63,64,65,66,74,103,
  67,68,69,70,71,72,73,76,75,77
};
struct Key { double x, y; };
inline std::array<Key, 68> geometry() {
  std::array<Key, 68> keys{}; size_t k = 0;
  const std::vector<std::vector<double>> widths = {
    {1,1,1,1,1,1,1,1,1,1,1,1,1,2,1},
    {1.5,1,1,1,1,1,1,1,1,1,1,1,1,1.5,1},
    {1.75,1,1,1,1,1,1,1,1,1,1,1,2.25,1},
    {2.25,1,1,1,1,1,1,1,1,1,1,1.75,1,1},
    {1.25,1.25,1.25,6.25,1,1,1,1,1,1}
  };
  for (size_t row = 0; row < widths.size(); ++row) {
    double x = 0;
    for (double w : widths[row]) { keys[k++] = {x + w * .5, double(row)}; x += w; }
  }
  return keys;
}
struct Config {
  int keyMode = 428, sideMode = 500, palette = 1, window = 0, spatialRadius = 8;
  double brightness = 80, sensitivity = 4, releaseMs = 80, db = 35, syncOffsetMs = 0;
  Color color{246,17,165}; std::string endpoint = "default";
};
inline bool valid(const Config& c) {
  const auto has = [](int n, std::initializer_list<int> list) { return std::find(list.begin(), list.end(), n) != list.end(); };
  return has(c.keyMode,{169,170,171,172,173,180,428,430}) && has(c.sideMode,{500,501,502,503}) &&
    c.palette >= 0 && c.palette <= 3 && c.window >= 0 && c.window <= 2 && c.spatialRadius >= 0 && c.spatialRadius <= 16 &&
    std::isfinite(c.brightness) && c.brightness >= 0 && c.brightness <= 100 &&
    std::isfinite(c.sensitivity) && c.sensitivity >= .1 && c.sensitivity <= 10 &&
    std::isfinite(c.releaseMs) && c.releaseMs >= 0 && c.releaseMs <= 200 &&
    std::isfinite(c.db) && c.db >= 0 && c.db <= 100 && std::isfinite(c.syncOffsetMs) && c.syncOffsetMs >= -100 && c.syncOffsetMs <= 150 && !c.endpoint.empty() && c.endpoint.size() <= 512;
}
inline Color scale(Color c, double value) {
  for (auto& n : c) n = uint8_t(std::clamp(std::lround(n * value), 0L, 255L));
  return c;
}
inline Color hsv(double hue, double value = 1) {
  hue = std::fmod(hue + 3600, 360) / 60;
  double x = 1 - std::abs(std::fmod(hue, 2) - 1);
  std::array<double,3> c = hue < 1 ? std::array<double,3>{1,x,0} : hue < 2 ? std::array<double,3>{x,1,0} :
    hue < 3 ? std::array<double,3>{0,1,x} : hue < 4 ? std::array<double,3>{0,x,1} :
    hue < 5 ? std::array<double,3>{x,0,1} : std::array<double,3>{1,0,x};
  return {uint8_t(std::clamp(c[0]*value*255,0.,255.)),uint8_t(std::clamp(c[1]*value*255,0.,255.)),uint8_t(std::clamp(c[2]*value*255,0.,255.))};
}
struct Audio {
  std::array<float,256> samples{};
  double envelope = 0, sampleQpcMs = 0, receivedMs = 0;
  uint64_t generation = 0, sequence = 0;
};
inline double monoSample(const uint8_t* frame,unsigned channels,unsigned bytes,bool floating) {
  if(!channels)return 0;
  double mono=0;
  for(unsigned channel=0;channel<channels;++channel){
    const auto* p=frame+channel*bytes;double value=0;
    if(floating){float f;std::memcpy(&f,p,4);value=std::isfinite(f)?f:0;}
    else if(bytes==2){int16_t n;std::memcpy(&n,p,2);value=n/32768.;}
    else if(bytes==3){int32_t n=p[0]|p[1]<<8|p[2]<<16;if(n&0x800000)n|=~0xffffff;value=n/8388608.;}
    else {int32_t n;std::memcpy(&n,p,4);value=n/2147483648.;}
    mono+=value/channels;
  }
  return mono;
}
struct Frame { std::array<Color,68> keys{}; std::array<Color,18> side{}; Color global{}; bool direct = false; double level = 0; };
inline double envelope(const float* samples, size_t count) {
  if (!count) return 0;
  double peak = 0, sum = 0;
  for (size_t i=0;i<count;++i) { const double x=std::isfinite(samples[i])?samples[i]:0; peak=std::max(peak,x); sum+=x; }
  return peak == 0 ? 0 : std::max(0.,peak-sum/count);
}
inline std::array<double,64> fft(const std::array<float,256>& input, int window, double gain) {
  std::array<std::complex<double>,256> a{};
  for (int i=0;i<256;++i) {
    double angle=2*pi*i/256, w=window==1?.54-.46*std::cos(angle):window==2?.42-.5*std::cos(angle)+.08*std::cos(2*angle):.5-.5*std::cos(angle);
    a[i]={std::isfinite(input[i])?input[i]*w*gain:0,0};
  }
  for (unsigned i=1,j=0;i<256;++i) { unsigned bit=128; for (;j&bit;bit>>=1) j^=bit; j^=bit; if(i<j)std::swap(a[i],a[j]); }
  for(int len=2;len<=256;len*=2) {
    const auto root=std::polar(1.,-2*pi/len);
    for(int i=0;i<256;i+=len) { std::complex<double> w{1,0}; for(int j=0;j<len/2;++j) { auto u=a[i+j],v=a[i+j+len/2]*w;a[i+j]=u+v;a[i+j+len/2]=u-v;w*=root; } }
  }
  std::array<double,64> result{};
  for(int i=0;i<64;++i) { double mag=std::abs(a[i])/128; result[i]=mag>0?std::clamp(.9*mag+.5*std::log(1.1*mag),0.,1.):0; }
  return result;
}
class Engine {
  Config config_{}; const std::array<Key,68> keys_=geometry();
  double level_=0,lastMs_=0,phase_=0,lastLevel_=0,historyAt_=0,spectrumAt_=0,effectOrigin_=0;
  uint64_t generation_=0,sequence_=0;
  std::array<double,22> history_{};
  std::array<double,64> peaks_{};
  std::array<double,256> display_{};
  std::array<std::array<Color,256*64>,2> fields_{};size_t fieldIndex_=0;
  static int groupOf(uint8_t pos,const std::vector<std::vector<uint8_t>>& groups) {
    for(size_t i=0;i<groups.size();++i)if(std::find(groups[i].begin(),groups[i].end(),pos)!=groups[i].end())return int(i);return -1;
  }
  Color palette(double x,double now,double cadence=90) const {
    if(config_.palette==0)return config_.color;
    double hue=config_.palette==2?160+x*120:config_.palette==3?x*45:x*300;
    return hsv(hue+std::floor(now/cadence)*12);
  }
public:
  void reset() { level_=lastMs_=phase_=lastLevel_=historyAt_=spectrumAt_=effectOrigin_=0;history_.fill(0);peaks_.fill(0);display_.fill(0);generation_=sequence_=0; }
  void configure(const Config& c) { if(!valid(c))throw std::runtime_error("Invalid rhythm configuration");if(c.keyMode!=config_.keyMode||c.endpoint!=config_.endpoint)reset();config_=c; }
  const Config& config() const { return config_; }
  Frame render(const Audio& a,double now) {
    if(a.generation!=generation_) { reset();generation_=a.generation; }
    if(!effectOrigin_)effectOrigin_=now;
    const double elapsed=now-effectOrigin_;
    double dt=lastMs_?std::clamp(now-lastMs_,0.,100.):1000./60;lastMs_=now;
    bool active=a.sequence && now-a.receivedMs<100;
    double target=active?std::clamp(a.envelope*config_.sensitivity,0.,1.):0;
    double previous=level_;
    level_=target>=level_||config_.releaseMs==0?target:std::max(target,level_*std::exp(-dt/config_.releaseMs));
    if(level_<.001)level_=0;
    if(now-historyAt_>=30) { std::move_backward(history_.begin(),history_.end()-1,history_.end());history_[0]=level_;historyAt_=now; }
    if(config_.keyMode==428) {
      if(active && a.sequence!=sequence_) {
        auto bins=fft(a.samples,config_.window,config_.db*30);
        double decay=config_.releaseMs==0?0:std::exp(-std::max(0.,now-spectrumAt_)/config_.releaseMs);
        for(int i=0;i<64;++i)peaks_[i]=std::max(bins[i],peaks_[i]*decay);
        spectrumAt_=now;sequence_=a.sequence;
      } else if (!active) { for(auto& p:peaks_)p*=config_.releaseMs==0?0:std::exp(-dt/config_.releaseMs); }
      for(int x=0;x<256;++x) { double sum=0;int lo=std::max(0,x-config_.spatialRadius),hi=std::min(255,x+config_.spatialRadius);for(int j=lo;j<=hi;++j)sum+=peaks_[j/4];display_[x]=sum/(hi-lo+1); }
      auto& field=fields_[1-fieldIndex_];
      for(int x=0;x<256;++x){auto c=scale(palette(double(x)/255,elapsed,120),config_.brightness/100);for(int y=0;y<64;++y)field[y*256+x]=display_[x]>(64-y)/64.?c:Color{};}
      fieldIndex_=1-fieldIndex_;
    }
    Frame out;out.level=level_;double brightness=config_.brightness/100;
    if(config_.keyMode==171) {
      const bool rising=level_>lastLevel_;
      if(a.sequence!=sequence_) { phase_=rising?phase_+10:std::trunc(phase_*.6);lastLevel_=level_;sequence_=a.sequence; }
      auto byte=[](double n){return uint8_t(int64_t(n)&255);};
      auto base=palette(0,elapsed);
      out.global=scale({byte(base[0]+phase_),rising?base[1]:byte(base[2]+phase_),byte(base[2]+phase_)},brightness*std::min(1.,level_*4));out.direct=true;out.keys.fill(out.global);
    } else for(size_t i=0;i<keys_.size();++i) {
      const auto k=keys_[i];double nx=k.x/16,value=0;auto color=palette(nx,elapsed);
      if(config_.keyMode==169) {
        int ring=groupOf(positions[i],dazzlingRings),count=int(level_*dazzlingRings.size());
        value=ring>=0&&ring<count?1:0;if(value&&ring==count-1)color=count>1?Color{255,255,255}:scale(color,.3);
      } else if(config_.keyMode==170) {
        double span=level_*16,idx=std::fmod(k.x+elapsed/120,16.);
        if(idx<span) { value=1-idx/std::max(1.,span*2);if(span-idx<1)for(auto& c:color)c=uint8_t(std::max(0,int(c)-80)); }
      } else if(config_.keyMode==172) {
        color=config_.palette?palette(nx,elapsed,600):color;
        int column=groupOf(positions[i],gurglingColumns);
        if(column>=0){const auto& ids=gurglingColumns[column];auto index=std::find(ids.begin(),ids.end(),positions[i])-ids.begin();int h=int(history_[column]*ids.size());value=index<h?1:0;if(value&&index==h-1)color=scale(color,1.3);}
      } else if(config_.keyMode==173) {
        const auto& pattern=bloomPatterns[size_t(elapsed/330)%8];int shell=groupOf(positions[i],pattern);
        double edge=shell<0?0:level_*pattern.size()-shell;value=std::clamp(edge,0.,1.);color=palette(nx,elapsed,30);
        if(value>0&&value<1)for(auto& c:color)c=uint8_t(std::clamp(int(c*value+90),0,255));
        if(value>0)value=1;
      } else if(config_.keyMode==428) {
        int x=11*std::clamp(int(nx*21),0,21),y=17+10*int(k.y);
        out.keys[i]=fields_[fieldIndex_][y*256+x];continue;
      }
      out.keys[i]=scale(color,value*brightness);
    }
    // Implemented for preview/verification; live side output stays capability-gated.
    for(int i=0;i<18;++i) {
      bool lit=config_.sideMode==501?i<int(level_*18):config_.sideMode==502?std::abs(i-8)<int(level_*9):false;
      if(lit)out.side[i]=scale(palette(double(i)/18,elapsed),brightness);
    }
    if(config_.sideMode==503) {
      Color c{};int l=int(level_*18),s=18;
      if(level_>previous)for(int i=0;i<3;++i)c[i]=uint8_t(std::max(0,int(config_.color[i])-(int(config_.color[i])/s)*l));
      else if(level_<previous)c={uint8_t(std::max(0,int(config_.color[1])-(int(config_.color[1])/s)*l)),uint8_t(std::max(0,100+int(config_.color[2])-(int(config_.color[2])+100/s)*l)&255),uint8_t(std::max(0,int(config_.color[0])-(int(config_.color[0])/s)*l))};
      out.side.fill(scale(c,brightness));
    }
    return out;
  }
};
inline Report report(uint8_t command,uint8_t zone,uint8_t total,uint8_t sequence,const std::vector<uint8_t>& data) {
  if(data.size()>56)throw std::runtime_error("Report too long");
  Report p{};p[0]=9;p[1]=command;p[2]=zone;p[4]=total;p[5]=sequence;p[6]=uint8_t(data.size());std::copy(data.begin(),data.end(),p.begin()+7);
  unsigned sum=0;for(size_t i=0;i<63;++i)sum+=p[i];p[63]=uint8_t(255-sum);return p;
}
struct Encoded { std::array<Color,68> keys{};std::vector<Report> packets; };
inline Encoded encode(const Frame& f) {
  Encoded out;out.keys=f.keys;
  if(f.direct) { out.packets.push_back(report(8,2,1,0,{f.global[0],f.global[1],f.global[2]}));return out; }
  struct Group { Color color; std::vector<size_t> members; };
  std::vector<Group> groups;groups.reserve(68);
  for(size_t i=0;i<68;++i) { auto it=std::find_if(groups.begin(),groups.end(),[&](const Group& g){return g.color==f.keys[i];});if(it==groups.end())groups.push_back({f.keys[i],{i}});else it->members.push_back(i); }
  const size_t count=groups.size();std::array<bool,68> active{};active.fill(true);std::array<double,68*68> costs{};
  auto cost=[&](size_t i,size_t j){
    if(groups[i].color==Color{}||groups[j].color==Color{})return 1e30;
    double value=0;for(int c=0;c<3;++c){double d=double(groups[i].color[c])-groups[j].color[c];value+=d*d;}
    return value*double(groups[i].members.size())*groups[j].members.size()/(groups[i].members.size()+groups[j].members.size());
  };
  if(count>32)for(size_t i=0;i<count;++i)for(size_t j=i+1;j<count;++j)costs[i*68+j]=cost(i,j);
  size_t remaining=count;
  while(remaining>32) {
    size_t a=0,b=1;double best=1e30;
    for(size_t i=0;i<count;++i)if(active[i])for(size_t j=i+1;j<count;++j)if(active[j]) {
      double value=costs[i*68+j];if(value<best){best=value;a=i;b=j;}
    }
    auto& left=groups[a];auto& right=groups[b];double n=double(left.members.size()+right.members.size());
    for(int c=0;c<3;++c)left.color[c]=uint8_t(std::lround((left.color[c]*left.members.size()+right.color[c]*right.members.size())/n));
    left.members.insert(left.members.end(),right.members.begin(),right.members.end());active[b]=false;--remaining;
    for(size_t i=0;i<count;++i)if(active[i]&&i!=a){size_t lo=std::min(i,a),hi=std::max(i,a);costs[lo*68+hi]=cost(lo,hi);}
  }
  std::vector<uint8_t> body;
  // Include black explicitly: HERO68 firmware needs complete frames to clear old keys.
  for(size_t index=0;index<count;++index)if(active[index]){const auto& g=groups[index];body.insert(body.end(),g.color.begin(),g.color.end());body.push_back(uint8_t(g.members.size()));for(auto i:g.members){body.push_back(positions[i]);out.keys[i]=g.color;} }
  const size_t total=(body.size()+55)/56;
  for(size_t i=0;i<total;++i)out.packets.push_back(report(8,1,uint8_t(total),uint8_t(i),std::vector<uint8_t>(body.begin()+i*56,body.begin()+std::min(body.size(),(i+1)*56))));
  return out;
}
inline std::vector<Report> encodeSide(const Frame& f,int mode) {
  if(mode==500)return {};
  if(mode==503)return {report(14,2,1,0,{f.side[0][0],f.side[0][1],f.side[0][2]})};
  std::vector<uint8_t> body;
  // Color groups use the verified stock format. Index orientation needs hardware validation.
  for(size_t i=0;i<f.side.size();++i)body.insert(body.end(),{f.side[i][0],f.side[i][1],f.side[i][2],1,uint8_t(i)});
  std::vector<Report> packets;size_t total=(body.size()+55)/56;
  for(size_t i=0;i<total;++i)packets.push_back(report(14,1,uint8_t(total),uint8_t(i),std::vector<uint8_t>(body.begin()+i*56,body.begin()+std::min(body.size(),(i+1)*56))));
  return packets;
}
}
