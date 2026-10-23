'use strict';
const t=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'kais-'));
for(const k of ['AYRSHARE_API_KEY','PUBLIC_BASE_URL'])process.env[k]='';
const{server,tick,db}=require('../server');
let base;
t.before(()=>new Promise(r=>server.listen(0,'127.0.0.1',()=>{base='http://127.0.0.1:'+server.address().port;r()})));
t.after(()=>{server.closeAllConnections?.();server.close();db.close()});
const call=(m,u,b,h={})=>fetch(base+u,{method:m,redirect:'manual',headers:{'X-Requested-With':'kais-studio',...(b&&!Buffer.isBuffer(b)?{'Content-Type':'application/json'}:{}),...h},body:b?(Buffer.isBuffer(b)?b:JSON.stringify(b)):undefined});

t.test('mở / vào thẳng Dashboard: 200, không redirect, không có luồng đăng nhập',async()=>{
 const r=await call('GET','/');assert.equal(r.status,200);const h=await r.text();
 assert.doesNotMatch(h,/login|sign ?in|register|đăng nhập|đăng ký/i);
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),/login|signin|đăng nhập|jwt/i);
 const s=await call('GET','/api/stats');assert.equal(s.status,200);assert.equal((await s.json()).total,0)});
t.test('không có secret trong frontend',()=>{for(const f of fs.readdirSync(path.join(__dirname,'../public')))
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../public',f),'utf8'),/CLIENT_SECRET|APP_SECRET|process\.env/)});
t.test('chặn thao tác ghi thiếu X-Requested-With và path traversal',async()=>{
 const r=await fetch(base+'/api/posts',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{"title":"x"}'});assert.equal(r.status,403);
 assert.equal((await fetch(base+'/%2e%2e/server.js')).status,404)});
t.test('tạo, sửa, nhân bản, xóa bài viết và kiểm tra dữ liệu đầu vào',async()=>{
 let r=await call('POST','/api/posts',{title:'Bài 1',body:'Nội dung',platforms:['youtube','bogus']});assert.equal(r.status,201);const p=await r.json();
 assert.deepEqual(p.platforms,['youtube']);assert.equal(p.status,'draft');
 r=await call('PUT','/api/posts/'+p.id,{title:'Bài 1 sửa',body:'x'});assert.equal((await r.json()).title,'Bài 1 sửa');
 r=await call('POST',`/api/posts/${p.id}/duplicate`);const d=await r.json();assert.equal(r.status,201);assert.match(d.title,/bản sao/);
 assert.equal((await call('POST','/api/posts',{title:'',body:''})).status,400);
 assert.equal((await call('POST','/api/posts',{title:'a',link:'javascript:alert(1)'})).status,400);
 for(const i of[p.id,d.id])assert.equal((await call('DELETE','/api/posts/'+i)).status,200);
 assert.equal((await call('GET','/api/posts/'+p.id)).status,404)});
t.test('lịch đăng: từ chối giờ quá khứ, hủy lịch, và không bao giờ báo Published khi chưa có API',async()=>{
 let r=await call('POST','/api/posts',{title:'Lịch',body:'abc',platforms:['youtube']});const p=await r.json();
 r=await call('POST',`/api/posts/${p.id}/schedule`,{scheduledAt:new Date(Date.now()-36e5).toISOString()});assert.equal(r.status,400);
 r=await call('POST',`/api/posts/${p.id}/schedule`,{scheduledAt:new Date(Date.now()-5000).toISOString()});assert.equal(r.status,200);assert.equal((await r.json()).status,'scheduled');
 await tick();const q=await(await call('GET','/api/posts/'+p.id)).json();
 assert.equal(q.status,'failed');assert.match(q.error,/Chưa cấu hình API/);
 const c=await(await call('POST','/api/posts',{title:'Hủy',body:'abc',platforms:['tiktok']})).json();
 await call('POST',`/api/posts/${c.id}/schedule`,{scheduledAt:new Date(Date.now()+36e5).toISOString()});
 r=await call('POST',`/api/posts/${c.id}/cancel`);assert.equal((await r.json()).status,'cancelled');
 const s=await(await call('GET','/api/stats')).json();assert.equal(s.counts.published,0);assert.equal(s.connected,0)});
t.test('trạng thái nền tảng trung thực',async()=>{const{items}=await(await call('GET','/api/platforms')).json();
 assert.equal(items.length,3);for(const x of items){assert.equal(x.configured,false);assert.equal(x.connected,false);assert.equal(x.message,'Chưa cấu hình API')}});
t.test('tải media: từ chối tệp giả, nhận PNG hợp lệ, phục vụ và xóa',async()=>{
 assert.equal((await call('POST','/api/media',Buffer.from('đây không phải ảnh, chỉ là văn bản'),{'x-filename':'a.png'})).status,415);
 let r=await call('POST','/api/media',Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(32)]),{'x-filename':encodeURIComponent('ảnh.png')});
 assert.equal(r.status,201);const m=await r.json();assert.equal(m.mime,'image/png');
 r=await call('GET','/media/'+m.file);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');
 assert.equal((await call('DELETE','/api/media/'+m.id)).status,200);assert.equal((await call('GET','/media/'+m.file)).status,404)});
t.test('adapter Ayrshare: chỉ ok khi dịch vụ xác nhận success đúng nền tảng',async()=>{
 const A=require('../adapters'),real=global.fetch;process.env.AYRSHARE_API_KEY='k';process.env.PUBLIC_BASE_URL='https://x.test';
 try{let sent;
  global.fetch=async(u,o)=>{sent={u,o};return{ok:true,status:200,json:async()=>({status:'success',postIds:[{platform:'facebook',status:'success',id:'1'}]})}};
  const p={title:'T',body:'B',description:'',hashtags:'#h',link:'',files:[{file:'abc.png',mime:'image/png'}]};
  assert.equal((await A.publish('facebook',p)).ok,true);
  const b=JSON.parse(sent.o.body);assert.deepEqual(b.platforms,['facebook']);assert.deepEqual(b.mediaUrls,['https://x.test/media/abc.png']);assert.equal(sent.o.headers.Authorization,'Bearer k');
  global.fetch=async()=>({ok:true,status:200,json:async()=>({status:'error',errors:[{message:'Token hết hạn'}],postIds:[]})});
  const r=await A.publish('facebook',p);assert.equal(r.ok,false);assert.match(r.error,/Token hết hạn/);
  global.fetch=async()=>({ok:true,status:200,json:async()=>({status:'success',postIds:[]})});
  assert.equal((await A.publish('facebook',p)).ok,false);
  assert.match((await A.publish('tiktok',{...p,files:[]})).error,/cần đính kèm video/);
 }finally{global.fetch=real;process.env.AYRSHARE_API_KEY='';process.env.PUBLIC_BASE_URL=''}});
