export const serviceControlPanel=`<!doctype html><html lang="en"><meta charset="utf-8"><title>OpenHero68</title>
<style>body{font:16px system-ui;background:#171a1b;color:#eee;max-width:740px;margin:60px auto;padding:20px}button,input{padding:12px;margin:8px}pre{white-space:pre-wrap}button{cursor:pointer}</style>
<h1>OpenHero68</h1><input id="file" type="file" accept=".json">
<button onclick="start()">Start saved RGB</button><button onclick="post('/mode',{mode:'onboard'})">Onboard RGB</button>
<button id="apply" onclick="apply()">Update app / Cập nhật</button><button onclick="post('/shutdown')">Exit app</button>
<p id="update" role="status"></p><progress id="progress" hidden></progress><pre id="status"></pre>
<script>
const vi=navigator.language.startsWith('vi'),labels={idle:['Ready','Sẵn sàng'],checking:['Checking for updates','Đang kiểm tra'],downloading:['Downloading','Đang tải'],verifying:['Verifying','Đang xác minh'],stopping:['Closing app safely','Đang đóng app an toàn'],installing:['Installing','Đang cài đặt'],restarting:['Restarting app','Đang mở lại app'],completed:['App is up to date','Ứng dụng đã cập nhật'], 'rolling-back':['Restoring previous version','Đang khôi phục bản cũ'],failed:['Update failed','Cập nhật thất bại']};
let pending=false;
async function post(url,data={}){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw Error(result.error);return result}
async function start(){try{const f=document.getElementById('file').files[0];const p=f?JSON.parse(await f.text()):{};await post('/start',p.profile||p)}catch(e){alert(e.message)}}
async function apply(){pending=true;document.getElementById('apply').disabled=true;try{await post('/updates/apply')}catch(e){pending=false;document.getElementById('update').textContent=e.message}}
async function refresh(){try{
 const s=await(await fetch('/status')).json(),u=await(await fetch('/updates')).json();document.getElementById('status').textContent=JSON.stringify(s,null,2);
 const busy=!['idle','completed','failed'].includes(u.phase);pending=busy;document.getElementById('apply').disabled=busy||!s.supportsFullUpdate;
 document.getElementById('update').textContent=!s.supportsFullUpdate?(vi?'Chạy setup một lần để bật cập nhật tự động.':'Run setup once to enable automatic updates.'):(labels[u.phase]?.[vi?1:0]||u.phase)+(u.version?' '+u.version:'')+(u.error?' — '+u.error:'');
 const p=document.getElementById('progress');p.hidden=u.phase!=='downloading';p.max=u.total||1;p.value=u.downloaded||0;
 }catch{document.getElementById('status').textContent=pending?(vi?'Ứng dụng đang khởi động lại. Windows không khởi động lại.':'App is restarting. Windows is not restarting.'):'App is offline';}}
setInterval(refresh,1000);refresh();
</script></html>`
