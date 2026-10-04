#define NOMINMAX
#include "../service/native/keyboard_hook.h"
#include <cassert>
#include <iostream>
// Installs only an EMPTY, INACTIVE hook: never suppresses or injects user input.
int main(){
  for(int i=0;i<12;i++){
    keyboard::Hook hook;keyboard::Mask empty;
    assert(hook.prepare(empty,true));assert(!hook.active());assert(hook.error().empty());
    hook.release();assert(hook.prepare(empty,false));hook.stop();
  }
  std::cout<<"Dedicated keyboard hook thread lifecycle passed (no input suppression or injection)\n";
}
