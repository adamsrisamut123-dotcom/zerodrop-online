'use strict';
const el=id=>document.getElementById(id);
const state={ code:'', token:'', pin:'', role:'', room:null, qrUrl:null, busy:false, interval:null };
let toastTimer=null;
const fmtBytes=n=>n>=1024*1024?`${(n/1048576).toFixed(1)} MB`:n>=1024?`${(n/1024).toFixed(1)} KB`:`${n} bytes`;
function toast(message,bad=false){const node=el('toast');node.textContent=message;node.className='toast show'+(bad?' bad':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.className='toast',4000);}
function ready(btn, pending, work){btn.disabled=true;const prev=btn.textContent;btn.textContent=pending;return Promise.resolve().then(work).catch(e=>toast(e.message||'เกิดข้อผิดพลาด',true)).finally(()=>{btn.disabled=false;btn.textContent=prev;});}
async function request(url,method='GET',body,secured=true){
  const headers={};if(secured && state.token)headers.Authorization=`Bearer ${state.token}`;
  if(body!==undefined)headers['Content-Type']='application/json';
  const r=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const data=await r.json().catch(()=>({error:'Server returned an invalid response'}));
  if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);
  return data;
}
function save(){sessionStorage.setItem('zerodrop-session',JSON.stringify({code:state.code,token:state.token,pin:state.pin,role:state.role}));}
function reset(){state.code='';state.token='';state.pin='';state.role='';state.room=null;if(state.interval)clearInterval(state.interval);state.interval=null;sessionStorage.removeItem('zerodrop-session');if(state.qrUrl){URL.revokeObjectURL(state.qrUrl);state.qrUrl=null;}el('landing').classList.remove('hidden');el('roomView').classList.add('hidden');el('hero').classList.remove('hidden');}
function onRoom(data,role,token,pin=''){
  state.code=data.code;state.token=token;state.pin=pin;state.role=role;state.room=data;save();
  el('landing').classList.add('hidden');el('hero').classList.add('hidden');el('roomView').classList.remove('hidden');
  el('roleBadge').textContent=role==='owner'?'OWNER':'GUEST';el('roomSubtitle').textContent=role==='owner'?'แชร์รหัสห้อง + PIN กับคนที่ต้องการส่งไฟล์':'เชื่อมต่อห้องสำเร็จ! เริ่มส่งหรือดาวน์โหลดไฟล์ได้เลย';
  document.querySelectorAll('.owner-only').forEach(n=>n.classList.toggle('hidden',role!=='owner'));
  el('activeCode').textContent=data.code;el('activePin').textContent=pin||'------';
  const link=`${location.origin}/?room=${data.code}`;el('shareLink').textContent=link;
  renderRoom(data);void loadQr();if(state.interval)clearInterval(state.interval);
  state.interval=setInterval(()=>{if(!state.busy)void refresh(true);},5000);
}
function renderRoom(room){
  state.room=room;const until=room.expiresAt-Date.now();
  el('expiresText').textContent=until>0?`หมดอายุในประมาณ ${Math.ceil(until/60000)} นาที (ไฟล์จะถูกลบเมื่อห้องหมดอายุ)`:'ห้องหมดอายุแล้ว';
  el('fileLimitLabel').textContent=`สูงสุด ${fmtBytes(room.maxFileBytes)} ต่อไฟล์`;
  el('roomCapacity').textContent=`${fmtBytes(room.totalBytes)} / ${fmtBytes(room.maxRoomBytes)}`;
  el('capacityFill').style.width=`${Math.min(100,100*room.totalBytes/room.maxRoomBytes)}%`;
  const list=el('fileList');list.replaceChildren();el('fileCount').textContent=String(room.files.length);
  if(!room.files.length){const div=document.createElement('div');div.className='empty-files';div.textContent='ยังไม่มีไฟล์ในห้อง ลองอัปโหลดไฟล์แรกเลย ✨';list.appendChild(div);return;}
  for(const f of [...room.files].reverse()){
    const item=document.createElement('div');item.className='file-item';
    const symbol=document.createElement('div');symbol.className='file-symbol';symbol.textContent='▤';
    const text=document.createElement('div');text.className='file-text';
    const strong=document.createElement('strong');strong.textContent=f.name;
    const small=document.createElement('small');small.textContent=`${fmtBytes(f.bytes)} · ${new Date(f.addedAt).toLocaleString('th-TH')}`;
    text.append(strong,small);const actions=document.createElement('div');actions.className='file-actions';
    const down=document.createElement('button');down.textContent='↓ ดาวน์โหลด';down.addEventListener('click',()=>void downloadFile(f,down));actions.appendChild(down);
    if(state.role==='owner'){
      const del=document.createElement('button');del.className='remove';del.textContent='ลบ';del.addEventListener('click',()=>void removeFile(f,del));actions.appendChild(del);
    }
    item.append(symbol,text,actions);list.appendChild(item);
  }
}
async function refresh(silent=false){
  if(!state.token)return;
  try{const data=await request(`/api/rooms/${state.code}`);renderRoom(data.room);}
  catch(e){if(!silent)toast(e.message,true);if(/expired|invalid|Rejoin/.test(e.message)){toast('ห้องหมดอายุหรือเซสชันสิ้นสุดแล้ว',true);reset();}}
}
async function loadQr(){
  try{const r=await fetch(`/api/rooms/${state.code}/qr`,{headers:{Authorization:`Bearer ${state.token}`}});
    if(!r.ok)throw new Error('QR unavailable');const blob=await r.blob();
    if(state.qrUrl)URL.revokeObjectURL(state.qrUrl);state.qrUrl=URL.createObjectURL(blob);el('roomQr').src=state.qrUrl;
  }catch{el('roomQr').alt='QR ไม่พร้อมใช้งาน สามารถแชร์ลิงก์แทนได้';}
}
async function copy(value){try{await navigator.clipboard.writeText(value);toast('คัดลอกแล้ว ✓');}catch{toast('ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาเลือกข้อความด้วยตนเอง',true);}}
function putFile(file){return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();const url=`/api/rooms/${state.code}/files?name=${encodeURIComponent(file.name)}`;
  xhr.open('PUT',url);xhr.setRequestHeader('Authorization',`Bearer ${state.token}`);
  const progress=el('progressBox');progress.classList.remove('hidden');el('progressName').textContent=`กำลังส่ง ${file.name}`;
  xhr.upload.onprogress=e=>{if(e.lengthComputable){const n=Math.round(100*e.loaded/e.total);el('progressPct').textContent=`${n}%`;el('progressFill').style.width=`${n}%`;}};
  xhr.onerror=()=>reject(new Error('เชื่อมต่อไม่สำเร็จ ลองอีกครั้ง'));
  xhr.ontimeout=()=>reject(new Error('ใช้เวลาส่งนานเกินไป'));
  xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText)}catch{data={}};
    if(xhr.status===201)resolve(data);else reject(new Error(data.error||`Upload failed (${xhr.status})`));};
  xhr.timeout=175000;xhr.send(file);
});}
async function uploadFiles(files){if(state.busy)return;
  const arr=[...files];if(!arr.length)return;state.busy=true;
  try{let done=0;for(const file of arr){if(file.size>state.room.maxFileBytes){toast(`${file.name}: ใหญ่เกินกำหนด`,true);continue;}
    try{await putFile(file);done++;}catch(e){toast(`${file.name}: ${e.message}`,true);}}
    if(done)toast(`อัปโหลดสำเร็จ ${done} ไฟล์`);await refresh();
  }finally{state.busy=false;el('fileInput').value='';setTimeout(()=>el('progressBox').classList.add('hidden'),1000);}}
async function downloadFile(file,button){
  return ready(button,'กำลังโหลด…',async()=>{
    const r=await fetch(`/api/rooms/${state.code}/files/${file.id}`,{headers:{Authorization:`Bearer ${state.token}`}});
    if(!r.ok){const body=await r.json().catch(()=>({}));throw new Error(body.error||'ดาวน์โหลดไม่สำเร็จ');}
    const blob=await r.blob();const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=file.name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);
    toast(`ดาวน์โหลด ${file.name} แล้ว`);
  });
}
async function removeFile(file,button){if(!confirm(`ลบ ${file.name} จากห้องนี้หรือไม่?`))return;
  await ready(button,'กำลังลบ…',async()=>{await request(`/api/rooms/${state.code}/files/${file.id}`,'DELETE');await refresh();toast('ลบไฟล์แล้ว');});}
el('createBtn').addEventListener('click',()=>void ready(el('createBtn'),'กำลังสร้างห้อง...',async()=>{
  const data=await request('/api/rooms','POST',{createKey:el('createKey').value},false);onRoom(data.room,'owner',data.token,data.pin);toast('สร้างห้องเรียบร้อยแล้ว แชร์ลิงก์และ PIN เพื่อเริ่มต้น');
}));
el('joinForm').addEventListener('submit',ev=>{ev.preventDefault();void ready(el('joinForm').querySelector('button'),'กำลังตรวจสอบ...',async()=>{
  const data=await request('/api/join','POST',{code:el('joinCode').value.trim().toUpperCase(),pin:el('joinPin').value.trim()},false);
  onRoom(data.room,'guest',data.token);toast('เข้าร่วมห้องสำเร็จ');
});});
el('copyCodeBtn').addEventListener('click',()=>void copy(state.code));el('copyPinBtn').addEventListener('click',()=>void copy(state.pin));
el('copyLinkBtn').addEventListener('click',()=>void copy(`${location.origin}/?room=${state.code}`));
el('refreshBtn').addEventListener('click',()=>void refresh());
el('rotateBtn').addEventListener('click',()=>void ready(el('rotateBtn'),'กำลังเปลี่ยน...',async()=>{
  if(!confirm('เปลี่ยน PIN? ผู้เข้าร่วมเดิมจะถูกตัดการเชื่อมต่อ'))return;
  const data=await request(`/api/rooms/${state.code}/rotate`,'POST',{});state.pin=data.pin;el('activePin').textContent=data.pin;save();toast('เปลี่ยน PIN แล้ว');
}));
el('closeRoomBtn').addEventListener('click',()=>void ready(el('closeRoomBtn'),'กำลังปิดห้อง...',async()=>{
  if(!confirm('ยืนยันปิดห้องและลบไฟล์ทั้งหมด?'))return;
  await request(`/api/rooms/${state.code}`,'DELETE');reset();toast('ปิดห้องแล้ว');
}));
el('leaveBtn').addEventListener('click',()=>{if(confirm('ออกจากหน้าเว็บนี้หรือไม่? ห้องจะยังอยู่จนหมดอายุ'))reset();});
el('dropZone').addEventListener('click',()=>el('fileInput').click());
el('dropZone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el('fileInput').click();}});
el('fileInput').addEventListener('change',e=>void uploadFiles(e.target.files));
for(const event of ['dragenter','dragover'])el('dropZone').addEventListener(event,e=>{e.preventDefault();el('dropZone').classList.add('over');});
for(const event of ['dragleave','drop'])el('dropZone').addEventListener(event,e=>{e.preventDefault();el('dropZone').classList.remove('over');});
el('dropZone').addEventListener('drop',e=>{if(e.dataTransfer?.files)void uploadFiles(e.dataTransfer.files);});
(async()=>{
  try{const config=await request('/api/config','GET',undefined,false);if(config.creationLocked)el('createLock').classList.remove('hidden');}catch{}
  const room=new URLSearchParams(location.search).get('room');if(room)el('joinCode').value=room.toUpperCase().slice(0,8);
  try{const cached=JSON.parse(sessionStorage.getItem('zerodrop-session')||'null');
    if(!cached?.code||!cached?.token)return;
    state.code=cached.code;state.token=cached.token;
    const data=await request(`/api/rooms/${cached.code}`);onRoom(data.room,data.role,cached.token,cached.pin||'');
  }catch{reset();}
})();
