#pragma once
#include "hall_core.h"
#include <sstream>
#include <stdexcept>
#include <string>
namespace gamepad {
struct Point {double x,y;};
struct Binding {uint16_t pos;int action;double start,end;};
struct Config {int rate=200;bool snappy=true,square=false,angleEnabled=false;double angle=45;std::vector<Point> curve{{0,0},{1,1}};std::vector<Binding> bindings;};
struct Report {uint16_t buttons=0;int16_t lx=0,ly=0,rx=0,ry=0;uint8_t lt=0,rt=0;};
inline bool analog(int action){return action>=15&&action<25;}
inline std::vector<std::string> split(const std::string& value,char sep){std::vector<std::string> out;std::istringstream in(value);std::string p;while(std::getline(in,p,sep))out.push_back(p);return out;}
inline double number(const std::string& value){size_t used=0;double n=std::stod(value,&used);if(used!=value.size()||!std::isfinite(n))throw std::runtime_error("Invalid number");return n;}
inline Config parse(const std::string& payload){
  auto f=split(payload,';');if(f.size()==6&&payload.back()==';')f.push_back("");if(f.size()!=7)throw std::runtime_error("Invalid gamepad fields");Config c;
  const double rate=number(f[0]);if(rate!=50&&rate!=100&&rate!=200)throw std::runtime_error("Invalid rate");c.rate=int(rate);
  for(int i=1;i<=3;i++)if(f[i]!="0"&&f[i]!="1")throw std::runtime_error("Invalid toggle");c.snappy=f[1]=="1";c.square=f[2]=="1";c.angleEnabled=f[3]=="1";c.angle=number(f[4]);if(c.angle<30||c.angle>60)throw std::runtime_error("Invalid angle");
  c.curve.clear();for(auto& p:split(f[5],'|')){auto v=split(p,',');if(v.size()!=2)throw std::runtime_error("Invalid curve");Point point{number(v[0]),number(v[1])};if(point.x<0||point.x>1||point.y<0||point.y>1||(!c.curve.empty()&&(point.x<=c.curve.back().x||point.y<c.curve.back().y)))throw std::runtime_error("Non-monotonic curve");c.curve.push_back(point);}
  if(c.curve.size()<2||c.curve.size()>16||c.curve.front().x!=0||c.curve.front().y!=0||c.curve.back().x!=1||c.curve.back().y!=1)throw std::runtime_error("Invalid curve endpoints");
  std::array<bool,hall::Capacity> seen{};
  for(auto& p:split(f[6],'|')){auto v=split(p,',');if(v.size()!=4)throw std::runtime_error("Invalid binding");double pos=number(v[0]),action=number(v[1]),start=number(v[2]),end=number(v[3]);if(pos<1||pos>=hall::Capacity||pos!=std::floor(pos)||!hall::heroPosition(unsigned(pos))||action<0||action>=25||action!=std::floor(action)||start<0||end>3.4||end-start<.01-1e-9||seen[size_t(pos)])throw std::runtime_error("Invalid binding values");seen[size_t(pos)]=true;c.bindings.push_back({uint16_t(pos),int(action),start,end});}
  if(c.bindings.size()>68)throw std::runtime_error("Too many bindings");return c;
}
inline double curve(const Config& c,double value){double x=std::clamp(value,0.,1.);for(size_t i=1;i<c.curve.size();i++){auto a=c.curve[i-1],b=c.curve[i];if(x<=b.x)return a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x);}return 1;}
inline Report map(const Config& c,const std::array<hall::Sample,hall::Capacity>& samples,double now,bool& stale,bool& resting){
  static constexpr uint16_t buttons[]={4096,8192,16384,32768,16,32,1024,1,2,4,8,256,512,64,128};
  std::array<double,25> values{};Report out;stale=false;resting=true;
  for(const auto& b:c.bindings){const auto& s=samples[b.pos];if(!s.sequence||now-s.at>=50||now<s.at){stale=true;continue;}if(s.pressed||s.distance>8)resting=false;if(analog(b.action))values[b.action]=std::max(values[b.action],curve(c,(s.distance/100.-b.start)/(b.end-b.start)));else if(s.pressed)out.buttons|=buttons[b.action];}
  if(stale)return {};
  auto axis=[&](double p,double n){return c.snappy?(p==n?0.:p>n?p:-n):p-n;};
  auto stick=[&](int a,int16_t& ox,int16_t& oy){double x=axis(values[a+3],values[a+2]),y=axis(values[a],values[a+1]);if(c.angleEnabled){double magnitude=std::hypot(x,y);y*=std::tan(c.angle*3.141592653589793/180);double adjusted=std::hypot(x,y);if(adjusted){x*=magnitude/adjusted;y*=magnitude/adjusted;}}if(!c.square){double len=std::hypot(x,y);if(len>1){x/=len;y/=len;}}ox=int16_t(std::lround(std::clamp(x,-1.,1.)*32767));oy=int16_t(std::lround(std::clamp(y,-1.,1.)*32767));};
  stick(15,out.lx,out.ly);stick(19,out.rx,out.ry);out.lt=uint8_t(std::lround(values[23]*255));out.rt=uint8_t(std::lround(values[24]*255));return out;
}
}
