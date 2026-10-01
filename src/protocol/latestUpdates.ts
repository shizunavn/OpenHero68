/** Send the latest value at a bounded rate, with one request in flight. Unlike a
 * debounce, continuous dragging still publishes intermediate changes. */
export function latestUpdates<T>(send:(value:T)=>Promise<unknown>,onError:(error:unknown)=>void,intervalMs=40) {
  let pending:T|undefined,hasPending=false,running=false,closed=false,lastSent=-Infinity
  let timer:ReturnType<typeof setTimeout>|undefined
  function pump(){
    if(closed||running||!hasPending||timer)return
    const wait=intervalMs-(performance.now()-lastSent)
    if(wait>0){timer=setTimeout(()=>{timer=undefined;pump()},wait);return}
    const value=pending!;pending=undefined;hasPending=false;running=true;lastSent=performance.now()
    void Promise.resolve().then(()=>closed?undefined:send(value)).catch(error=>{if(!closed)onError(error)}).finally(()=>{running=false;pump()})
  }
  return {
    stage(value:T){if(closed)return;pending=value;hasPending=true;pump()},
    close(){closed=true;pending=undefined;hasPending=false;if(timer){clearTimeout(timer);timer=undefined}},
  }
}
