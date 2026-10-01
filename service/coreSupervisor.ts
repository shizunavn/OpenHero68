export type InstalledCore={file:string;version:string}
type CoreProcess={pid:number|undefined;exit:Promise<number>;kill:()=>void}
type Supervisor={
  launch:(core:InstalledCore)=>CoreProcess
  pending:()=>boolean
  prepare:()=>InstalledCore
  healthy:(process:CoreProcess,core:InstalledCore)=>Promise<boolean>
  rollback:(previous:InstalledCore)=>void
  quitting:()=>boolean
  error:(error:unknown)=>void
  wait:()=>Promise<void>
}

export async function superviseCore(initial:InstalledCore,runner:Supervisor){
  let current=initial,crashes=0
  while(!runner.quitting()){
    let exit=await runner.launch(current).exit
    // Consume every update exit immediately, including the second update in
    // the same tray session. Relaunching the old core here loses that request.
    while(exit===73&&runner.pending()&&!runner.quitting()){
      const previous=current
      let trial:CoreProcess|undefined
      try{
        const next=runner.prepare()
        trial=runner.launch(next)
        if(!await runner.healthy(trial,next))throw Error('Updated core did not become healthy')
        current=next;crashes=0
        exit=await trial.exit
        if(exit!==0&&exit!==73)throw Error(`Updated core exited: ${exit}`)
      }catch(error){
        if(trial){trial.kill();await trial.exit}
        runner.error(error);runner.rollback(previous);current=previous;exit=1
        break
      }
    }
    if(runner.quitting()||exit===0)break
    if(++crashes>=3)break
    await runner.wait()
  }
}
