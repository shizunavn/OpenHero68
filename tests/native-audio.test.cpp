// Low-volume synthetic playback exercises the real Windows loopback endpoint.
#include "../service/native/rhythm_audio.h"
#include <mmsystem.h>
#include <iostream>
#include <vector>
#include <cassert>
int main(int argc,char** argv){
  const int seconds=argc>1?std::stoi(argv[1]):6;
  if(seconds<3||seconds>600)return 2;
  rhythm::Capture capture;capture.start("default");
  WAVEFORMATEX format{};format.wFormatTag=WAVE_FORMAT_PCM;format.nChannels=2;format.nSamplesPerSec=48000;format.wBitsPerSample=16;format.nBlockAlign=4;format.nAvgBytesPerSec=192000;
  HWAVEOUT output=nullptr;if(waveOutOpen(&output,WAVE_MAPPER,&format,0,0,CALLBACK_NULL)!=MMSYSERR_NOERROR){std::cerr<<"No playback endpoint\n";return 2;}
  std::vector<int16_t> pcm(size_t(seconds)*48000*2);
  for(size_t i=0;i<pcm.size()/2;++i){const double t=double(i)/48000,phase=std::fmod(t,1.);const double fade=phase<.12?std::sin(rhythm::pi*phase/.12):0;const auto sample=int16_t(655*fade*std::sin(2*rhythm::pi*(220+660*phase)*t));pcm[2*i]=pcm[2*i+1]=sample;}
  WAVEHDR header{};header.lpData=reinterpret_cast<LPSTR>(pcm.data());header.dwBufferLength=DWORD(pcm.size()*2);
  waveOutPrepareHeader(output,&header,sizeof(header));waveOutWrite(output,&header,sizeof(header));
  uint64_t previous=0,generation=0;std::vector<double> ages;bool staleAfterStop=false;
  while(!(header.dwFlags&WHDR_DONE)){
    auto state=capture.snapshot();if(state.audio.sequence!=previous){previous=state.audio.sequence;generation=state.audio.generation;if(state.audio.envelope>.0001&&state.audio.sampleQpcMs>0)ages.push_back(state.audio.receivedMs-state.audio.sampleQpcMs);}
    Sleep(5);
  }
  waveOutUnprepareHeader(output,&header,sizeof(header));waveOutClose(output);capture.stop();auto stopped=capture.snapshot();staleAfterStop=stopped.audio.sequence||stopped.audio.envelope;
  std::sort(ages.begin(),ages.end());std::cout<<"{\"activePackets\":"<<ages.size()<<",\"generation\":"<<generation<<",\"rawSampleToCaptureP95Ms\":"<<(ages.empty()?-1:ages[size_t(std::ceil(ages.size()*.95))-1])<<",\"futureTimestamps\":"<<std::count_if(ages.begin(),ages.end(),[](double age){return age<0;})<<",\"staleAfterStop\":"<<(staleAfterStop?"true":"false")<<"}\n";
  return ages.empty()||staleAfterStop?1:0;
}
