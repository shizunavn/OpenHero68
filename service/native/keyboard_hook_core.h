#pragma once
#include <bitset>
namespace keyboard {
using Mask=std::bitset<512>;
// Thread-local policy: a delivered down always gets its matching up. A blocked
// down never becomes an injected down when stopping, changing profile or failing.
struct Policy {
  Mask delivered,blocked;
  bool event(unsigned scan,bool down,bool enabled,const Mask& mask,bool own=false){
    if(own||scan>=512)return false;
    if(blocked[scan]){if(!down)blocked.reset(scan);return true;}
    if(delivered[scan]){if(!down)delivered.reset(scan);return false;}
    if(enabled&&mask[scan]){if(down)blocked.set(scan);return true;}
    delivered.set(scan,down);return false;
  }
  Mask release(){auto keys=blocked;blocked.reset();return keys;}
};
}
