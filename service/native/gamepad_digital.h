#pragma once
#include "gamepad_core.h"
namespace gamepad {
struct DigitalSetting {bool configured=false,rt=false,deadzone=false;uint16_t ap=0,release=0,press=0,top=0,bottom=0;};
using DigitalSettings=std::array<DigitalSetting,hall::Capacity>;
inline DigitalSettings parseDigital(const std::string& payload){
  DigitalSettings settings{};
  for(const auto& record:split(payload,'|')){
    auto fields=split(record,',');if(fields.size()!=8)throw std::runtime_error("Invalid digital settings");
    std::array<unsigned,8> v{};for(size_t i=0;i<v.size();i++){double n=number(fields[i]);if(n<0||n>340||n!=std::floor(n))throw std::runtime_error("Invalid digital setting value");v[i]=unsigned(n);}
    if(v[0]>=hall::Capacity||!hall::heroPosition(v[0])||settings[v[0]].configured||v[2]>1||v[5]>1)throw std::runtime_error("Invalid digital key settings");
    settings[v[0]]={true,bool(v[2]),bool(v[5]),uint16_t(v[1]),uint16_t(v[3]),uint16_t(v[4]),uint16_t(v[6]),uint16_t(v[7])};
  }
  return settings;
}
struct DigitalState {
  bool down=false,activated=false;uint16_t extreme=0;double at=-1;uint64_t sequence=0;
  bool sample(const DigitalSetting& c,const hall::Sample& s){
    if(!c.configured){*this={};return false;}
    if(sequence&&s.sequence==sequence)return down;
    if(!sequence||s.at<at||s.at-at>=50){down=false;activated=false;extreme=s.distance;}
    at=s.at;sequence=s.sequence;
    const auto distance=s.distance;
    const unsigned top=c.deadzone?c.top:0;
    if(distance<=top){down=false;activated=false;extreme=distance;return false;}
    // AP starts each stroke. RT thereafter tracks the deepest pressed point
    // and shallowest released point, including reactivation below AP.
    if(!c.rt){down=distance>=c.ap;extreme=distance;return down;}
    if(!activated){down=distance>=c.ap;if(down)activated=true;extreme=distance;return down;}
    if(c.deadzone&&c.bottom&&distance>=340-c.bottom){extreme=down?std::max(extreme,distance):distance;down=true;return true;}
    if(down){extreme=std::max(extreme,distance);if(extreme>distance&&unsigned(extreme-distance)>=std::max(1u,unsigned(c.release))){down=false;extreme=distance;}}
    else {extreme=std::min(extreme,distance);if(distance>extreme&&unsigned(distance-extreme)>=std::max(1u,unsigned(c.press))){down=true;extreme=distance;}}
    return down;
  }
};
}
