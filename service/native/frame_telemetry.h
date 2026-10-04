#pragma once
#include <algorithm>
#include <cstdint>
#include <sstream>

namespace ipc {
struct FrameTelemetry {
  uint64_t frames=0,packets=0,rendered=0,longGaps=0,lastSubmission=0;
  double maxGap=0;
  void custom(uint64_t submission,size_t count,double gap){
    if(!frames||submission!=lastSubmission)++rendered;
    lastSubmission=submission;record(count,gap);
  }
  void record(size_t count,double gap){++frames;packets+=count;maxGap=(std::max)(maxGap,gap);if(gap>100)++longGaps;}
  void append(std::ostringstream& event) const {
    event<<",\"outputFrames\":"<<frames<<",\"outputPackets\":"<<packets
      <<",\"renderedFrames\":"<<rendered<<",\"outputMaxGapMs\":"<<maxGap<<",\"outputLongGaps\":"<<longGaps;
  }
};
}
