type Client = {
  destroyed:boolean
  write(value:string):boolean
  on(event:'drain'|'close', listener:()=>void):unknown
}

/** Keep at most one unsent preview. USB output never waits on the browser. */
export function latestSse(client:Client) {
  let blocked=false, pending:string|undefined
  function send(value:string) {
    if(client.destroyed)return
    if(blocked){pending=value;return}
    blocked=!client.write(value)
  }
  client.on('drain',()=>{blocked=false;if(pending!==undefined){const value=pending;pending=undefined;send(value)}})
  client.on('close',()=>{pending=undefined})
  return send
}
