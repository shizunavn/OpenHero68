import {commitInstall,transactionFile,writeJson,type UpdateTransaction} from './installState'

export type TransactionActions={
  stop:()=>Promise<void>;backup:()=>Promise<void>;install:()=>Promise<void>;
  launch:(version:string,operationId?:string)=>Promise<void>;
  healthy:()=>Promise<boolean>;restore:()=>Promise<void>;
  phase:(phase:UpdateTransaction['phase'],error?:string)=>void
}
export async function rollbackTransaction(tx:UpdateTransaction,actions:TransactionActions){
  tx.phase='rolling-back';writeJson(transactionFile(tx.root),tx);actions.phase('rolling-back')
  await actions.stop()
  if(tx.backupReady)await actions.restore()
  if(tx.hadInstallation)commitInstall(tx.root,tx.previous)
  await actions.launch(tx.previous.active)
}
export async function executeTransaction(tx:UpdateTransaction,actions:TransactionActions){
  const phase=(next:UpdateTransaction['phase'])=>{tx.phase=next;writeJson(transactionFile(tx.root),tx);actions.phase(next)}
  try{
    phase('stopping');await actions.stop();await actions.backup()
    tx.backupReady=true;phase('installing');await actions.install()
    phase('restarting');await actions.launch(tx.target,tx.operationId)
    if(!await actions.healthy())throw Error('Updated app did not become healthy within 30 seconds')
    commitInstall(tx.root,{...tx.previous,active:tx.target,previous:tx.previous.active})
    phase('completed')
  }catch(error){
    try{await rollbackTransaction(tx,actions)}catch(rollbackError){
      actions.phase('failed',`${error}; rollback: ${rollbackError}`)
      // Retain the journal so the launcher can retry recovery.
      throw rollbackError
    }
    phase('failed');actions.phase('failed',error instanceof Error?error.message:String(error))
  }
}
