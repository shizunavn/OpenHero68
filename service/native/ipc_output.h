#pragma once
#include <array>
#include <atomic>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <string>
#include <utility>
#include <cstdint>
#include <thread>
#ifdef _WIN32
#include <windows.h>
#endif

namespace ipc {
enum class Channel { Hall, HallStats, Gamepad, GamepadInput, CustomFrame, RhythmFrame,
  CustomTick, Stats, HallError, CustomError, RhythmError, Power, Count };
struct QueueStats { size_t replies=0,keys=0,telemetry=0;uint64_t coalesced=0; };

// Replies have one producer (the command loop). Raw key edges have their own
// bounded FIFO: only the raw-input thread may wait, never the USB scheduler.
class OutputQueue {
public:
  static constexpr size_t ReplyCapacity=256,KeyCapacity=1024;
  bool canReply() {std::lock_guard<std::mutex> lock(mutex_);return !closed_&&replies_.size()<ReplyCapacity;}
  bool reply(std::string value) {
    std::lock_guard<std::mutex> lock(mutex_);
    if(closed_||replies_.size()>=ReplyCapacity)return false;
    replies_.push_back(std::move(value));ready_.notify_one();return true;
  }
  bool key(std::string value) {
    std::unique_lock<std::mutex> lock(mutex_);
    space_.wait(lock,[&]{return closed_||keys_.size()<KeyCapacity;});
    if(closed_)return false;
    keys_.push_back(std::move(value));ready_.notify_one();return true;
  }
  void latest(Channel channel,std::string value) {
    std::lock_guard<std::mutex> lock(mutex_);if(closed_)return;
    auto& pending=telemetry_[size_t(channel)];if(!pending.empty())++coalesced_;
    pending=std::move(value);ready_.notify_one();
  }
  void clear(Channel channel) {std::lock_guard<std::mutex> lock(mutex_);telemetry_[size_t(channel)].clear();}
  QueueStats stats() {
    std::lock_guard<std::mutex> lock(mutex_);QueueStats result{replies_.size(),keys_.size(),0,coalesced_};
    for(const auto& value:telemetry_)if(!value.empty())++result.telemetry;return result;
  }
  bool take(std::string& value) {
    std::unique_lock<std::mutex> lock(mutex_);
    ready_.wait(lock,[&]{if(closed_||!replies_.empty()||!keys_.empty())return true;for(const auto& s:telemetry_)if(!s.empty())return true;return false;});
    if(closed_)return false;
    if(!replies_.empty()){value=std::move(replies_.front());replies_.pop_front();}
    else if(!keys_.empty()){value=std::move(keys_.front());keys_.pop_front();space_.notify_one();}
    else for(size_t n=0;n<telemetry_.size();++n){const auto i=(next_+n)%telemetry_.size();if(!telemetry_[i].empty()){value=std::move(telemetry_[i]);telemetry_[i].clear();next_=(i+1)%telemetry_.size();break;}}
    return true;
  }
  void close(){std::lock_guard<std::mutex> lock(mutex_);closed_=true;replies_.clear();keys_.clear();for(auto& value:telemetry_)value.clear();ready_.notify_all();space_.notify_all();}
private:
  std::mutex mutex_;std::condition_variable ready_,space_;bool closed_=false;
  std::deque<std::string> replies_,keys_;
  std::array<std::string,size_t(Channel::Count)> telemetry_{};
  size_t next_=0;uint64_t coalesced_=0;
};

#ifdef _WIN32
class Output {
public:
  OutputQueue queue;
  Output():worker_([this]{
    const auto handle=GetStdHandle(STD_OUTPUT_HANDLE);std::string value;
    while(queue.take(value)) {
      value+='\n';size_t offset=0;
      while(offset<value.size()) {DWORD count=0;if(stopped_||!WriteFile(handle,value.data()+offset,DWORD(value.size()-offset),&count,nullptr)||!count){queue.close();return;}offset+=count;}
    }
  }){}
  ~Output(){stop();}
  void stop(){
    if(!worker_.joinable())return;stopped_=true;queue.close();
    // stdin EOF may arrive while the parent still holds an unread stdout pipe.
    // Cancel the writer, including the race between checking stopped_ and WriteFile.
    do {CancelSynchronousIo(worker_.native_handle());} while(WaitForSingleObject(worker_.native_handle(),50)==WAIT_TIMEOUT);
    worker_.join();
  }
private:
  std::atomic<bool> stopped_{false};std::thread worker_;
};
#endif
}
