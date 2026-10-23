'use strict';
// Đăng qua Ayrshare: tài khoản mạng xã hội được liên kết trên dashboard Ayrshare,
// app chỉ giữ MỘT khóa API ở máy chủ. Mỗi nền tảng là một lần gọi riêng để lỗi không lan sang nhau.
const API='https://api.ayrshare.com/api';
const K=['AYRSHARE_API_KEY'];
const defs={
 youtube:{name:'YouTube',keys:K,limits:{title:100,body:5000},docs:'https://developers.google.com/youtube/v3/guides/uploading_a_video'},
 tiktok:{name:'TikTok',keys:K,limits:{body:2200},docs:'https://developers.tiktok.com/doc/content-posting-api-get-started'},
 facebook:{name:'Facebook',keys:K,limits:{body:63206},docs:'https://developers.facebook.com/docs/pages-api/posts'}};
const linked={},key=()=>process.env.AYRSHARE_API_KEY;
function status(id){const d=defs[id],missing=d.keys.filter(k=>!process.env[k]);
 return{id,name:d.name,limits:d.limits,docs:d.docs,configured:!missing.length,missing,connected:linked[id]===true,publishSupported:!missing.length,
  message:missing.length?'Chưa cấu hình API':'Sẵn sàng đăng qua Ayrshare'}}
const all=()=>Object.keys(defs).map(status);
async function verify(id){if(!key())return status(id);
 try{const r=await fetch(API+'/user',{headers:{Authorization:'Bearer '+key()},signal:AbortSignal.timeout(15000)}),d=await r.json().catch(()=>({}));
  if(!r.ok)return{...status(id),message:'Ayrshare từ chối khóa API (HTTP '+r.status+')'};
  if(!Array.isArray(d.activeSocialAccounts))return{...status(id),message:'Khóa hợp lệ nhưng không đọc được danh sách tài khoản đã liên kết'};
  for(const x of Object.keys(defs))linked[x]=d.activeSocialAccounts.includes(x);
  return{...status(id),message:linked[id]?'Đã liên kết trên Ayrshare':'Chưa liên kết '+defs[id].name+' trên dashboard Ayrshare'}}
 catch(e){return{...status(id),message:'Không gọi được Ayrshare: '+e.message}}}
// ok=true CHỈ khi Ayrshare trả success cho đúng nền tảng này.
async function publish(id,post){
 if(!key())return{ok:false,error:'Chưa cấu hình API (AYRSHARE_API_KEY)'};
 const files=post.files||[],base=(process.env.PUBLIC_BASE_URL||'').replace(/\/+$/,'');
 if((id==='tiktok'||id==='youtube')&&!files.some(f=>f.mime.startsWith('video/')))return{ok:false,error:defs[id].name+' cần đính kèm video'};
 if(files.length&&!/^https:\/\//.test(base))return{ok:false,error:'Thiếu PUBLIC_BASE_URL dạng https:// để dịch vụ tải được media'};
 const text=[id==='youtube'?(post.description||post.body):(post.body||post.title),post.hashtags,post.link].filter(Boolean).join('\n\n');
 const body={post:text,platforms:[id],mediaUrls:files.map(f=>base+'/media/'+f.file)};
 if(id==='youtube')body.youTubeOptions={title:post.title||'Video'};
 let r,d;
 try{r=await fetch(API+'/post',{method:'POST',headers:{Authorization:'Bearer '+key(),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});d=await r.json().catch(()=>({}))}
 catch(e){return{ok:false,error:'Không gọi được Ayrshare ('+e.message+'). Kiểm tra lịch sử Ayrshare trước khi đăng lại để tránh trùng bài'}}
 const pid=(d.postIds||[]).find(x=>x.platform===id);
 if(r.ok&&pid?.status==='success')return{ok:true,url:pid.postUrl||null};
 const msg=d.errors?.[0]?.message||pid?.message||d.message||'HTTP '+r.status;
 return{ok:false,error:String(msg).slice(0,200)+(r.ok?'. Chưa được xác nhận, kiểm tra lịch sử Ayrshare trước khi đăng lại':'')}}
module.exports={defs,status,all,verify,publish};
