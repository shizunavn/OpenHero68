import {useEffect,useState} from 'react'
import {fetchLocalService} from './localServiceAccess'
export type ServiceUpdate={operationId?:string;phase:string;version?:string;downloaded?:number;total?:number;error?:string}
const base='http://127.0.0.1:16868'
const finished=(phase:string)=>['idle','completed','failed'].includes(phase)
export function useServiceUpdate(supported:boolean){
  const [update,setUpdate]=useState<ServiceUpdate>({phase:'idle'}),[waiting,setWaiting]=useState(false)
  useEffect(()=>{
    if(!supported&&!waiting)return
    let active=true
    const poll=async()=>{
      try{
        const response=await fetchLocalService(base+'/updates',{},1500)
        if(!response.ok)throw Error('Cannot read update status')
        const result=await response.json() as ServiceUpdate
        if(active){setUpdate(result);if(finished(result.phase))setWaiting(false)}
      }catch{/* The app can be offline while its independent worker installs/restarts it. */}
    }
    void poll();const timer=setInterval(()=>void poll(),1000)
    return()=>{active=false;clearInterval(timer)}
  },[supported,waiting])
  async function apply(){
    if(waiting||!finished(update.phase))return
    setWaiting(true);setUpdate({phase:'checking'})
    try{
      const response=await fetchLocalService(base+'/updates/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},5000)
      const result=await response.json()
      if(!response.ok)throw Error(result.error??'Update failed')
      setUpdate(result)
    }catch(error){setWaiting(false);setUpdate({phase:'failed',error:error instanceof Error?error.message:String(error)})}
  }
  return {update,busy:waiting||!finished(update.phase),apply}
}
export function updateMessage(update:ServiceUpdate,vi:boolean){
  const labels:Record<string,[string,string]>={idle:['Ready to update','Sẵn sàng cập nhật'],checking:['Checking for updates','Đang kiểm tra bản mới'],downloading:['Downloading setup','Đang tải bộ cài'],verifying:['Verifying setup','Đang xác minh bộ cài'],stopping:['Closing the app safely','Đang đóng app an toàn'],installing:['Installing update','Đang cài bản mới'],restarting:['Restarting the app','Đang mở lại app'],completed:['The app is up to date','Ứng dụng đã cập nhật'],'rolling-back':['Restoring the previous version','Đang khôi phục bản cũ'],failed:['Update failed','Cập nhật thất bại']}
  return (labels[update.phase]?.[vi?1:0]??update.phase)+(update.version?' · '+update.version:'')+(update.error?' — '+update.error:'')
}
