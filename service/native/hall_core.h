#pragma once
#include <array>
#include <vector>
#include <algorithm>
#include <cmath>
#include <cstdint>
namespace hall {
constexpr size_t Capacity=256;
inline bool heroPosition(unsigned pos){return pos==1||(pos>=15&&pos<=77)||pos==98||pos==99||pos==102||pos==103;}
struct Sample {uint16_t distance=0,adc=0;bool pressed=false;double at=-1;uint64_t sequence=0;};
inline bool matchesReply(const uint8_t* packet,size_t length,const std::vector<uint16_t>& ids){
  if(length<64||ids.empty()||ids.size()>9||packet[0]!=9||packet[1]!=0x98||packet[2]!=1||packet[6]!=ids.size()*6)return false;
  unsigned checksum=0;for(size_t i=0;i<64;i++)checksum+=packet[i];if((checksum&255)!=255)return false;
  for(size_t i=0;i<ids.size();i++)if(packet[7+i*6]*256+packet[8+i*6]!=ids[i])return false;return true;
}
struct Scheduler {
  std::array<double,Capacity> hz{},due{};
  std::array<Sample,Capacity> samples{};
  std::array<uint64_t,Capacity> counts{};
  std::array<double,Capacity> first{},last{};
  std::array<std::vector<double>,Capacity> gaps{};
  // Bounded quarter-millisecond buckets retain p99 for the entire active demand.
  // The final bucket records gaps >= 1024 ms, without growing during long runs.
  std::array<std::vector<uint64_t>,Capacity> intervals{};
  uint64_t sequence=0,requests=0,timeouts=0;double retryAt=0;unsigned failures=0;
  void configure(const std::array<double,Capacity>& next,double now){for(size_t i=0;i<Capacity;i++){if(next[i]>0&&next[i]!=hz[i]){if(hz[i]==0){due[i]=now;samples[i]={};}else if(next[i]>hz[i])due[i]=std::min(due[i],now);counts[i]=0;gaps[i].clear();intervals[i].assign(4097,0);}if(!next[i])samples[i]={};hz[i]=next[i];}}
  bool active()const{return std::any_of(hz.begin(),hz.end(),[](double v){return v>0;});}
  double deadline()const{double d=1e30;for(size_t i=0;i<Capacity;i++)if(hz[i])d=std::min(d,due[i]);return std::max(d,retryAt);}
  std::vector<uint16_t> batch(double now)const{
    std::vector<uint16_t> ids;if(now<retryAt)return ids;
    for(uint16_t i=0;i<Capacity;i++)if(hz[i]>0&&due[i]<=now)ids.push_back(i);
    std::stable_sort(ids.begin(),ids.end(),[&](uint16_t a,uint16_t b){if(hz[a]!=hz[b])return hz[a]>hz[b];return due[a]<due[b];});
    if(ids.size()>9)ids.resize(9);return ids;
  }
  void received(uint16_t pos,uint16_t distance,uint16_t adc,bool pressed,double at){
    if(counts[pos]){const double gap=std::max(0.,at-last[pos]);gaps[pos].push_back(gap);if(gaps[pos].size()>512)gaps[pos].erase(gaps[pos].begin());if(intervals[pos].empty())intervals[pos].assign(4097,0);intervals[pos][size_t(std::min(4096.,std::ceil(gap*4))) ]++;}else first[pos]=at;last[pos]=at;counts[pos]++;
    samples[pos]={distance,adc,pressed,at,++sequence};
    // Advance to the next future deadline; never replay missed work.
    const double interval=1000/hz[pos];due[pos]+=interval;if(due[pos]<=at)due[pos]+=std::floor((at-due[pos])/interval+1)*interval;
  }
  double measuredHz(size_t pos,double now)const{return counts[pos]>1?(counts[pos]-1)*1000./std::max(1.,now-first[pos]):0;}
  double p99(size_t pos)const{auto g=gaps[pos];if(g.empty())return 0;std::sort(g.begin(),g.end());return g[size_t(std::ceil(g.size()*.99))-1];}
  double lifetimeP99(size_t pos)const{if(counts[pos]<2)return 0;const auto rank=uint64_t(std::ceil((counts[pos]-1)*.99));uint64_t cumulative=0;for(size_t i=0;i<intervals[pos].size();i++){cumulative+=intervals[pos][i];if(cumulative>=rank)return i*.25;}return 0;}
  void success(){failures=0;retryAt=0;}
  void failed(double now){timeouts++;retryAt=now+std::min(2000.,250.*std::pow(2.,std::min(3u,failures++)));for(auto& s:samples)s={};}
};
}
