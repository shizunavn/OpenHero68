#define NOMINMAX
#include <Windows.h>
#include <cassert>
#include <iostream>
#include <unordered_map>

// Compile the actual SDK against a fake bus. No driver or controller is opened.
BOOL WINAPI fakeDeviceIoControl(HANDLE,DWORD,LPVOID,DWORD,LPVOID,DWORD,LPDWORD,LPOVERLAPPED);
BOOL WINAPI fakeGetOverlappedResult(HANDLE,LPOVERLAPPED,LPDWORD,BOOL);
#define DeviceIoControl fakeDeviceIoControl
#define GetOverlappedResult fakeGetOverlappedResult
#include "../service/native/vendor/ViGEmClient/src/ViGEmClient.cpp"
#undef DeviceIoControl
#undef GetOverlappedResult

static std::unordered_map<LPOVERLAPPED,DWORD> requests;
static DWORD readinessError=0;
static bool cleanupFails=false;
static unsigned unplugCount=0;
BOOL WINAPI fakeDeviceIoControl(HANDLE,DWORD code,LPVOID,DWORD,LPVOID,DWORD,LPDWORD,LPOVERLAPPED ol){
  requests[ol]=code;
  if(code==IOCTL_VIGEM_UNPLUG_TARGET){++unplugCount;SetLastError(ERROR_ACCESS_DENIED);}
  return TRUE;
}
BOOL WINAPI fakeGetOverlappedResult(HANDLE,LPOVERLAPPED ol,LPDWORD transferred,BOOL){
  *transferred=0;
  const auto code=requests.at(ol);
  if(code==IOCTL_VIGEM_WAIT_DEVICE_READY&&readinessError){SetLastError(readinessError);return FALSE;}
  if(code==IOCTL_VIGEM_UNPLUG_TARGET&&cleanupFails){SetLastError(ERROR_ACCESS_DENIED);return FALSE;}
  return TRUE;
}
int main(){
  auto client=vigem_alloc();assert(client);
  client->hBusDevice=CreateEventW(nullptr,FALSE,FALSE,nullptr);assert(client->hBusDevice);
  for(bool failedCleanup:{false,true}){
    readinessError=483;cleanupFails=failedCleanup;unplugCount=0;
    auto target=vigem_target_x360_alloc();assert(target);
    assert(vigem_target_add(client,target)==VIGEM_ERROR_WINAPI);
    assert(GetLastError()==483);
    assert(unplugCount==1); // Previously no unplug IOCTL was issued at all.
    assert(client->pTargetsList[target->SerialNo]==nullptr);
    assert(target->State==(failedCleanup?VIGEM_TARGET_CONNECTED:VIGEM_TARGET_DISCONNECTED));
    if(failedCleanup){cleanupFails=false;assert(VIGEM_SUCCESS(vigem_target_remove(client,target)));}
    vigem_target_free(target);
  }
  for(DWORD code:{DWORD(ERROR_INVALID_PARAMETER),DWORD(ERROR_SUCCESS)}){
    readinessError=code;unplugCount=0;
    auto target=vigem_target_x360_alloc();assert(target);
    assert(VIGEM_SUCCESS(vigem_target_add(client,target)));
    assert(target->State==VIGEM_TARGET_CONNECTED);
    assert(bool(target->IsWaitReadyUnsupported)==(code==ERROR_INVALID_PARAMETER));
    assert(client->pTargetsList[target->SerialNo]==target);
    assert(unplugCount==0);
    assert(VIGEM_SUCCESS(vigem_target_remove(client,target)));
    client->pTargetsList[target->SerialNo]=nullptr;
    vigem_target_free(target);
  }
  CloseHandle(client->hBusDevice);client->hBusDevice=INVALID_HANDLE_VALUE;vigem_free(client);
  std::cout<<"ViGEm startup cleanup, original Windows error, cleanup failure and compatibility passed\n";
}
