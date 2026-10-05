#include "../service/native/rhythm_core.h"
#include "../service/native/rhythm_beat.h"
#include "../service/native/rhythm_pulse.h"
#include <cassert>
#include <iostream>
#include <numeric>
using namespace rhythm;
static double lum(const Frame& f){double s=0;for(auto& c:f.keys)s+=(c[0]*.2126+c[1]*.7152+c[2]*.0722)/255.;return s/68;}
int main(){
  PulseEffect fx;PulseEffect::Settings set;set.palette=0;set.color={255,255,255};
  BeatState st;
  // idle: nearly dark, never a full-board flash
  assert(lum(fx.render(1000,set))<.05);
  // kick: ring starts at the space bar, travels outward, then decays
  BeatEvent kick;kick.kind=BeatEvent::Kick;kick.timeMs=1000;kick.strength=1;kick.id=1;fx.feed({kick},st);
  auto at=[&](double ms){return fx.render(ms,set);};
  const auto early=at(1020);const auto gone=at(2500);
  // positions index of the space bar (row 4, the 6.25u key) is keys[64+3]; number row is 0..14
  assert(lum(early)>lum(at(900)));
  assert(lum(gone)<.05);
  // governor: a burst of 8 kicks within 400 ms must not exceed the single-hit peak by more than the 3-per-second rule allows
  PulseEffect burst;std::vector<BeatEvent> es;for(int i=0;i<8;++i){BeatEvent e;e.kind=BeatEvent::Kick;e.timeMs=1000+i*50;e.strength=1;es.push_back(e);}burst.feed(es,st);
  double peak=0;for(double t=1000;t<1600;t+=1000./60)peak=std::max(peak,lum(burst.render(t,set)));
  PulseEffect single;single.feed({kick},st);double one=0;for(double t=1000;t<1600;t+=1000./60)one=std::max(one,lum(single.render(t,set)));
  assert(peak<3.2*one);
  // retract removes the identified kick and its cross-talk, not a later event
  PulseEffect r;r.feed({kick},st);BeatEvent ret;ret.kind=BeatEvent::Kick;ret.retract=true;ret.id=kick.id;r.feed({ret},st);assert(lum(r.render(1030,set))<.05);
  // offset: positive delays the light
  PulseEffect d;d.feed({kick},st);PulseEffect::Settings late2=set;late2.offsetMs=100;assert(lum(d.render(1020,late2))<lum(d.render(1120,late2)));
  // encoding stays inside the hardware limits for every palette
  for(int palette=0;palette<4;++palette){PulseEffect e;PulseEffect::Settings s;s.palette=palette;
    std::vector<BeatEvent> all;for(int i=0;i<6;++i){BeatEvent a;a.kind=BeatEvent::Kind(i%3);a.timeMs=1000+i*30;a.strength=.9f;all.push_back(a);}e.feed(all,st);
    for(double t=1000;t<1800;t+=1000./60){auto enc=encode(e.render(t,s));assert(!enc.packets.empty()&&enc.packets.size()<=4);
      for(const auto& p:enc.packets)assert((std::accumulate(p.begin(),p.end(),0)&255)==255);}}
  // fixed red palette is capped (red flash rule)
  {PulseEffect e;PulseEffect::Settings s;s.palette=0;s.color={255,0,0};e.feed({kick},st);double mx=0;for(double t=1000;t<1300;t+=16)for(auto& c:e.render(t,s).keys)mx=std::max<double>(mx,c[0]);assert(mx<=255*.75*.80+1);}
  BeatState locked;locked.locked=true;locked.confidence=1;locked.periodMs=500;
  BeatEvent grid;grid.kind=BeatEvent::Beat;grid.timeMs=1000;grid.downbeat=true;grid.id=2;
  // A downbeat inserted between detection and correction must survive retraction.
  {PulseEffect actual,expected;actual.feed({kick,grid},locked);expected.feed({grid},locked);
    actual.render(1001,set);expected.render(1001,set);actual.feed({ret},locked);
    assert(actual.render(1030,set).keys==expected.render(1030,set).keys);}
  // Amendment updates its source even after another kick, including the faint slash.
  {BeatEvent weak=kick;weak.strength=.2f;BeatEvent later=kick;later.id=3;later.timeMs=1020;later.strength=.4f;
    PulseEffect actual,expected;actual.feed({weak,later},st);expected.feed({kick,later},st);
    BeatEvent amend=kick;amend.amend=true;amend.timeMs=1040;actual.feed({amend},st);
    assert(actual.render(1060,set).keys==expected.render(1060,set).keys);}
  // Reset clears the board lift and restores the deterministic sparkle sequence.
  {PulseEffect actual,fresh;actual.feed({grid},locked);actual.render(1010,set);actual.reset();
    assert(actual.render(1020,set).keys==fresh.render(1020,set).keys);
    BeatEvent hat;hat.kind=BeatEvent::Hat;hat.id=4;hat.timeMs=1100;hat.strength=1;
    actual.feed({hat},st);actual.render(1105,set);actual.reset();actual.feed({hat},st);fresh.feed({hat},st);
    assert(actual.render(1105,set).keys==fresh.render(1105,set).keys);}
  // A predicted downbeat must not fire after the tracker loses its lock.
  {PulseEffect actual,fresh;grid.timeMs=1100;actual.feed({grid},locked);actual.feed({},st);
    assert(actual.render(1101,set).keys==fresh.render(1101,set).keys);}
  // An amendment cannot bypass the gain reduction applied to a burst.
  {std::vector<BeatEvent> hits;for(int i=0;i<4;++i){auto e=kick;e.id=10+i;e.timeMs=1000+i*30;hits.push_back(e);}
    auto weak=hits;weak.back().strength=.25f;PulseEffect actual,expected;actual.feed(weak,st);expected.feed(hits,st);
    auto amend=hits.back();amend.amend=true;actual.feed({amend},st);
    assert(actual.render(1120,set).keys==expected.render(1120,set).keys);}
  std::cout<<"Native pulse tests passed (including correction, reset, unlock and burst regressions)\n";
}
