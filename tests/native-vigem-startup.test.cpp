#define NOMINMAX
#include <Windows.h>
#include <cassert>
#include <iostream>
#include <unordered_map>

// Compile the actual SDK against a fake bus. No real driver is opened.
BOOL WINAPI fakeDeviceIoControl(HANDLE,DWORD,LPVOID,DWORD,LPVOID,DWORD,LPDWORD,LPOVERLAPPED);
BOOL WINAPI fakeGetOverlappedResult(HANDLE,LPOVERLAPPED,LPDWORD,BOOL);
VOID WINAPI fakeSleep(DWORD);
ULONGLONG WINAPI fakeGetTickCount64();
#define DeviceIoControl fakeDeviceIoControl
#define GetOverlappedResult fakeGetOverlappedResult
#define Sleep fakeSleep
#define GetTickCount64 fakeGetTickCount64
#include "../service/native/vendor/ViGEmClient/src/ViGEmClient.cpp"
#undef DeviceIoControl
#undef GetOverlappedResult
#undef Sleep
#undef GetTickCount64

static std::unordered_map<LPOVERLAPPED,DWORD> requests;
static DWORD readinessError=0,retryError=483,immediateRetryError=0;
static bool cleanupFails=false;
static unsigned unplugCount=0,pluginCount=0,waitCount=0;
static ULONGLONG ticks=0,readyAt=ULLONG_MAX;
static ULONG serial=0;
VOID WINAPI fakeSleep(DWORD milliseconds){ticks+=milliseconds;}
ULONGLONG WINAPI fakeGetTickCount64(){return ticks;}
BOOL WINAPI fakeDeviceIoControl(HANDLE,DWORD code,LPVOID input,DWORD,LPVOID,DWORD,LPDWORD,LPOVERLAPPED ol){
  requests[ol]=code;
  if(code==IOCTL_VIGEM_PLUGIN_TARGET){++pluginCount;serial=static_cast<PVIGEM_PLUGIN_TARGET>(input)->SerialNo;}
  if(code==IOCTL_VIGEM_WAIT_DEVICE_READY){
    ++waitCount;assert(static_cast<PVIGEM_WAIT_DEVICE_READY>(input)->SerialNo==serial);
    if(waitCount>1&&immediateRetryError){SetLastError(immediateRetryError);return FALSE;}
  }
  if(code==IOCTL_VIGEM_UNPLUG_TARGET){++unplugCount;SetLastError(ERROR_ACCESS_DENIED);}
  return TRUE;
}
BOOL WINAPI fakeGetOverlappedResult(HANDLE,LPOVERLAPPED ol,LPDWORD transferred,BOOL){
  *transferred=0;
  const auto code=requests.at(ol);
  if(code==IOCTL_VIGEM_WAIT_DEVICE_READY){
    const DWORD error=waitCount==1?readinessError:ticks<readyAt?retryError:ERROR_SUCCESS;
    if(error){SetLastError(error);return FALSE;}
  }
  if(code==IOCTL_VIGEM_UNPLUG_TARGET&&cleanupFails){SetLastError(ERROR_ACCESS_DENIED);return FALSE;}
  return TRUE;
}
static void reset(){unplugCount=pluginCount=waitCount=0;ticks=0;readyAt=ULLONG_MAX;retryError=483;immediateRetryError=0;cleanupFails=false;}
int main(){
  auto client=vigem_alloc();assert(client);
  client->hBusDevice=CreateEventW(nullptr,FALSE,FALSE,nullptr);assert(client->hBusDevice);
  // Persistent boot timeouts remain failures, with one child and bounded retries.
  for(bool failedCleanup:{false,true}){
    reset();readinessError=483;cleanupFails=failedCleanup;
    auto target=vigem_target_x360_alloc();assert(target);
    assert(vigem_target_add(client,target)==VIGEM_ERROR_WINAPI);
    assert(GetLastError()==483);
    assert(unplugCount==1&&pluginCount==1&&waitCount==101&&ticks==10000);
    assert(client->pTargetsList[target->SerialNo]==nullptr);
    assert(target->State==(failedCleanup?VIGEM_TARGET_CONNECTED:VIGEM_TARGET_DISCONNECTED));
    if(failedCleanup){cleanupFails=false;assert(VIGEM_SUCCESS(vigem_target_remove(client,target)));}
    vigem_target_free(target);
  }
  // Windows can finish after the original one-second wait and the HID watchdog.
  reset();readinessError=483;readyAt=3200;
  auto delayed=vigem_target_x360_alloc();assert(delayed);
  assert(VIGEM_SUCCESS(vigem_target_add(client,delayed)));
  assert(ticks==3200&&pluginCount==1&&waitCount==33&&unplugCount==0);
  assert(delayed->State==VIGEM_TARGET_CONNECTED&&delayed->SerialNo==serial);
  assert(client->pTargetsList[serial]==delayed);
  assert(VIGEM_SUCCESS(vigem_target_remove(client,delayed)));
  client->pTargetsList[serial]=nullptr;vigem_target_free(delayed);
  // Fatal asynchronous and immediate retry errors survive cleanup unchanged.
  for(bool immediate:{false,true})for(DWORD fatal:{DWORD(ERROR_ACCESS_DENIED),DWORD(ERROR_INVALID_HANDLE),DWORD(ERROR_INVALID_PARAMETER)}){
    reset();readinessError=483;
    if(immediate)immediateRetryError=fatal;else retryError=fatal;
    auto target=vigem_target_x360_alloc();assert(target);
    assert(vigem_target_add(client,target)==VIGEM_ERROR_WINAPI);
    assert(GetLastError()==fatal&&ticks==100&&waitCount==2&&unplugCount==1);
    assert(client->pTargetsList[target->SerialNo]==nullptr);vigem_target_free(target);
  }
  // Non-timeout errors and other controller types never enter Xbox recovery.
  reset();readinessError=ERROR_ACCESS_DENIED;
  auto denied=vigem_target_x360_alloc();
  assert(vigem_target_add(client,denied)==VIGEM_ERROR_WINAPI);
  assert(GetLastError()==ERROR_ACCESS_DENIED&&waitCount==1&&unplugCount==1);
  vigem_target_free(denied);
  reset();readinessError=483;
  auto ds4=vigem_target_ds4_alloc();
  assert(vigem_target_add(client,ds4)==VIGEM_ERROR_WINAPI);
  assert(GetLastError()==483&&waitCount==1&&unplugCount==1);vigem_target_free(ds4);
  // Warm startup and upstream pre-1.17 compatibility do not retry.
  for(DWORD code:{DWORD(ERROR_INVALID_PARAMETER),DWORD(ERROR_SUCCESS)}){
    reset();readinessError=code;
    auto target=vigem_target_x360_alloc();assert(target);
    assert(VIGEM_SUCCESS(vigem_target_add(client,target)));
    assert(target->State==VIGEM_TARGET_CONNECTED);
    assert(bool(target->IsWaitReadyUnsupported)==(code==ERROR_INVALID_PARAMETER));
    assert(client->pTargetsList[target->SerialNo]==target);
    assert(unplugCount==0&&waitCount==1);
    assert(VIGEM_SUCCESS(vigem_target_remove(client,target)));
    client->pTargetsList[target->SerialNo]=nullptr;vigem_target_free(target);
  }
  CloseHandle(client->hBusDevice);client->hBusDevice=INVALID_HANDLE_VALUE;vigem_free(client);
  std::cout<<"ViGEm delayed boot on one target, bounded timeout, fatal errors, cleanup and compatibility passed\n";
}
