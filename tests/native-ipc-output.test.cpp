#include "../service/native/ipc_output.h"
#include "../service/native/frame_telemetry.h"
#include <cassert>
#include <chrono>
#include <future>
#include <iostream>

int main(){
  ipc::OutputQueue queue;std::string value;
  queue.latest(ipc::Channel::CustomTick,"tick-old");queue.latest(ipc::Channel::CustomTick,"tick-new");
  queue.latest(ipc::Channel::Hall,"all-latest-key-samples");
  assert(queue.reply("ack-1"));assert(queue.reply("ack-2"));
  assert(queue.key("key-down"));assert(queue.key("key-up"));
  assert(queue.take(value)&&value=="ack-1");assert(queue.take(value)&&value=="ack-2");
  assert(queue.take(value)&&value=="key-down");assert(queue.take(value)&&value=="key-up");
  assert(queue.take(value)&&value=="all-latest-key-samples");assert(queue.take(value)&&value=="tick-new");
  assert(queue.stats().coalesced==1);
  for(size_t i=0;i<ipc::OutputQueue::ReplyCapacity;i++)assert(queue.reply(std::to_string(i)));
  assert(!queue.canReply()&&!queue.reply("overflow"));
  for(size_t i=0;i<10000;i++)queue.latest(ipc::Channel::CustomFrame,std::to_string(i));
  assert(queue.stats().replies==ipc::OutputQueue::ReplyCapacity&&queue.stats().telemetry==1);
  for(size_t i=0;i<ipc::OutputQueue::ReplyCapacity;i++)assert(queue.take(value)&&value==std::to_string(i));
  assert(queue.take(value)&&value=="9999");
  queue.latest(ipc::Channel::CustomFrame,"stale-session");queue.clear(ipc::Channel::CustomFrame);assert(queue.stats().telemetry==0);
  for(size_t i=0;i<ipc::OutputQueue::KeyCapacity;i++)assert(queue.key(std::to_string(i)));
  auto blocked=std::async(std::launch::async,[&]{return queue.key("next-key");});
  assert(blocked.wait_for(std::chrono::milliseconds(20))==std::future_status::timeout);
  queue.latest(ipc::Channel::CustomTick,"timer-still-produces");assert(queue.stats().telemetry==1);
  assert(queue.take(value)&&value=="0");assert(blocked.get());
  auto shutdown=std::async(std::launch::async,[&]{return queue.key("shutdown-key");});
  assert(shutdown.wait_for(std::chrono::milliseconds(20))==std::future_status::timeout);
  queue.close();assert(!shutdown.get());assert(!queue.take(value));
  ipc::FrameTelemetry telemetry;
  telemetry.custom(4,4,0);telemetry.custom(4,4,160);telemetry.custom(8,3,17);
  assert(telemetry.frames==3&&telemetry.packets==11&&telemetry.rendered==2&&telemetry.longGaps==1&&telemetry.maxGap==160);
  std::ostringstream json;telemetry.append(json);assert(json.str().find("\"outputFrames\":3")!=std::string::npos);
  std::cout<<"Bounded IPC queue, key ordering, shutdown and frame totals passed\n";
}
