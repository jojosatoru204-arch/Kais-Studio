'use strict';
try{process.loadEnvFile()}catch{}
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {DatabaseSync}=require('node:sqlite');
const A=require('./adapters'),brand=require('./brand.config.json');
const ROOT=__dirname,PUB=path.join(ROOT,'public');
const DATA=path.resolve(process.env.DATA_DIR||path.join(ROOT,'data')),UP=path.join(DATA,'uploads');
const MAXUP=(+process.env.MAX_UPLOAD_MB||50)*1048576;
const STATUSES=['draft','scheduled','processing','published','failed','cancelled'];
fs.mkdirSync(UP,{recursive:true});
const db=new DatabaseSync(path.join(DATA,'kais.db'));
db.exec(fs.readFileSync(path.join(ROOT,'migrations','001_init.sql'),'utf8'));
const now=()=>new Date().toISOString(),newId=()=>crypto.randomBytes(8).toString('hex');
// Nhật ký chỉ ghi hành động, không bao giờ ghi token hay khóa bí mật.
const log=(a,d='',l='info')=>db.prepare('INSERT INTO activity(at,action,level,detail) VALUES(?,?,?,?)').run(now(),a,l,String(d).slice(0,300));
const out=r=>r&&{...r,platforms:JSON.parse(r.platforms),media:JSON.parse(r.media)};
const get=i=>out(db.prepare('SELECT * FROM posts WHERE id=?').get(i));
const fail=(s,m)=>Object.assign(new Error(m),{status:s});
const send=(res,s,o)=>{res.writeHead(s,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(o))};
const hits=new Map();setInterval(()=>hits.clear(),300000).unref();
const limited=(ip,k,max)=>{const t=Date.now(),a=(hits.get(ip+k)||[]).filter(x=>t-x<60000);a.push(t);hits.set(ip+k,a);return a.length>max};
const readBody=(req,max)=>new Promise((ok,no)=>{
 if(+req.headers['content-length']>max)return no(fail(413,'Dữ liệu vượt giới hạn cho phép'));
 const c=[];let n=0;
 req.on('data',d=>{n+=d.length;if(n>max){no(fail(413,'Dữ liệu vượt giới hạn cho phép'));req.destroy();return}c.push(d)});
 req.on('end',()=>ok(Buffer.concat(c)));req.on('error',no)});
const jbody=async req=>{const b=await readBody(req,102400);try{return JSON.parse(b.toString()||'{}')}catch{throw fail(400,'JSON không hợp lệ')}};
function clean(b){const s=(v,m)=>String(v??'').slice(0,m).trim(),e=[];
 const d={title:s(b.title,200),body:s(b.body,5000),description:s(b.description,2000),hashtags:s(b.hashtags,500),link:s(b.link,500),notes:s(b.notes,1000),
  platforms:(Array.isArray(b.platforms)?b.platforms:[]).filter(x=>A.defs[x]),
  media:(Array.isArray(b.media)?b.media:[]).filter(x=>typeof x==='string'&&/^[a-f0-9]{16}$/.test(x)).slice(0,10)};
 if(d.link&&!/^https?:\/\/\S+$/i.test(d.link))e.push('Liên kết phải bắt đầu bằng http:// hoặc https://');
 if(!d.title&&!d.body)e.push('Cần nhập tiêu đề hoặc nội dung');
 return{d,e}}
const over=d=>d.platforms.flatMap(k=>{const l=A.defs[k].limits,n=A.defs[k].name,o=[];
 if(l.title&&d.title.length>l.title)o.push(`${n}: tiêu đề tối đa ${l.title} ký tự`);
 if(d.body.length>l.body)o.push(`${n}: nội dung tối đa ${l.body} ký tự`);return o});
// Kiểm tra chữ ký tệp (magic bytes) thay vì tin vào phần mở rộng. Không phải quét mã độc.
function sniff(b){if(b.length<12)return null;const t=(i,j)=>b.toString('latin1',i,j);
 if(b[0]===0x89&&t(1,4)==='PNG')return['image/png','.png'];
 if(b[0]===0xFF&&b[1]===0xD8&&b[2]===0xFF)return['image/jpeg','.jpg'];
 if(t(0,3)==='GIF')return['image/gif','.gif'];
 if(t(0,4)==='RIFF'&&t(8,12)==='WEBP')return['image/webp','.webp'];
 if(t(4,8)==='ftyp')return['video/mp4','.mp4'];
 if(b[0]===0x1A&&b[1]===0x45&&b[2]===0xDF&&b[3]===0xA3)return['video/webm','.webm'];
 return null}
const ins=(i,d,t)=>db.prepare('INSERT INTO posts(id,title,body,description,hashtags,link,notes,platforms,media,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(i,d.title,d.body,d.description,d.hashtags,d.link,d.notes,d.platforms,d.media,'draft',t,t);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm'};
function file(res,fp,cache){fs.stat(fp,(e,s)=>{
 if(e||!s.isFile()){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Không tìm thấy trang')}
 res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream','Content-Length':s.size,'Cache-Control':cache});
 fs.createReadStream(fp).pipe(res)})}

// Hàng đợi: chỉ chuyển published khi adapter xác nhận thành công. Chuyển processing bằng UPDATE có điều kiện để tránh xử lý trùng.
async function tick(){
 for(const r of db.prepare("SELECT * FROM posts WHERE status='scheduled' AND scheduled_at<=?").all(now())){
  if(!db.prepare("UPDATE posts SET status='processing',updated_at=? WHERE id=? AND status='scheduled'").run(now(),r.id).changes)continue;
  const errs=[],pl=JSON.parse(r.platforms);if(!pl.length)errs.push('Chưa chọn nền tảng');const files=JSON.parse(r.media).map(i=>db.prepare('SELECT file,mime FROM media WHERE id=?').get(i)).filter(Boolean);
  for(const k of pl){let x;try{x=await A.publish(k,{...out(r),files})}catch(e){x={ok:false,error:e.message}}if(!x.ok)errs.push(A.defs[k].name+': '+x.error)}
  db.prepare('UPDATE posts SET status=?,error=?,updated_at=? WHERE id=?').run(errs.length?'failed':'published',errs.join('; ')||null,now(),r.id);
  log(errs.length?'publish_failed':'published',r.title+(errs.length?' - '+errs.join('; '):''),errs.length?'error':'info')}}

const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'");
 try{
  const u=new URL(req.url,'http://x'),m=req.method,ip=req.socket.remoteAddress;let p;
  try{p=decodeURIComponent(u.pathname)}catch{throw fail(400,'Đường dẫn không hợp lệ')}
  if(!p.startsWith('/api/')){
   if(m!=='GET'&&m!=='HEAD')throw fail(405,'Phương thức không được hỗ trợ');
   const md=p.match(/^\/media\/([a-f0-9]{16}\.(?:png|jpg|gif|webp|mp4|webm))$/);
   if(md)return file(res,path.join(UP,md[1]),'private, max-age=3600');
   const fp=path.join(PUB,p==='/'?'index.html':p);
   return file(res,fp.startsWith(PUB+path.sep)?fp:'/nonexistent','no-cache')}
  if(limited(ip,'r',120)||(m!=='GET'&&limited(ip,'w',40)))throw fail(429,'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút');
  if(m!=='GET'&&req.headers['x-requested-with']!=='kais-studio')throw fail(403,'Yêu cầu không hợp lệ (thiếu tiêu đề X-Requested-With)');

  if(m==='GET'&&p==='/api/brand')return send(res,200,{...brand,maxUploadMb:MAXUP/1048576});
  if(m==='GET'&&p==='/api/stats'){
   const days=Math.min(90,Math.max(1,+u.searchParams.get('days')||14)),counts=Object.fromEntries(STATUSES.map(s=>[s,0]));let total=0;
   for(const r of db.prepare('SELECT status,COUNT(*) n FROM posts GROUP BY status').all()){counts[r.status]=r.n;total+=r.n}
   const rows=db.prepare("SELECT substr(updated_at,1,10) d,status s,COUNT(*) n FROM posts WHERE status IN('published','failed') AND updated_at>=? GROUP BY d,s").all(new Date(Date.now()-days*864e5).toISOString());
   const ds=[...Array(days)].map((_,i)=>{const d=new Date(Date.now()-(days-1-i)*864e5).toISOString().slice(0,10),f=s=>rows.find(r=>r.d===d&&r.s===s)?.n||0;return{d,published:f('published'),failed:f('failed')}});
   const pl=A.all();
   return send(res,200,{total,counts,days:ds,platformCount:pl.length,configured:pl.filter(x=>x.configured).length,connected:pl.filter(x=>x.connected).length,
    activity:db.prepare('SELECT at,action,level,detail FROM activity ORDER BY id DESC LIMIT 8').all()})}

  if(p==='/api/posts'){
   if(m==='GET'){const w=[],a=[],q=u.searchParams.get('q'),st=u.searchParams.get('status'),pf=u.searchParams.get('platform');
    if(q){w.push("(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')");const l='%'+q.replace(/[\\%_]/g,'\\$&')+'%';a.push(l,l)}
    if(STATUSES.includes(st)){w.push('status=?');a.push(st)}
    if(A.defs[pf]){w.push('platforms LIKE ?');a.push(`%"${pf}"%`)}
    const o=u.searchParams.get('sort')==='scheduled'?'scheduled_at ASC':'created_at DESC';
    return send(res,200,{items:db.prepare(`SELECT * FROM posts${w.length?' WHERE '+w.join(' AND '):''} ORDER BY ${o} LIMIT 500`).all(...a).map(out)})}
   if(m==='POST'){const{d,e}=clean(await jbody(req));if(e.length)throw fail(400,e.join('. '));const i=newId();
    ins(i,{...d,platforms:JSON.stringify(d.platforms),media:JSON.stringify(d.media)},now());log('post_created',d.title);return send(res,201,get(i))}}
  const mm=p.match(/^\/api\/posts\/([a-f0-9]{16})(?:\/(duplicate|schedule|cancel))?$/);
  if(mm){const row=db.prepare('SELECT * FROM posts WHERE id=?').get(mm[1]);if(!row)throw fail(404,'Không tìm thấy bài viết');const act=mm[2];
   if(m==='GET'&&!act)return send(res,200,out(row));
   if(m==='DELETE'&&!act){if(row.status==='processing')throw fail(409,'Bài đang được xử lý, chưa thể xóa');db.prepare('DELETE FROM posts WHERE id=?').run(row.id);log('post_deleted',row.title);return send(res,200,{ok:true})}
   if(m==='PUT'&&!act){if(row.status==='processing')throw fail(409,'Bài đang được xử lý, chưa thể sửa');const{d,e}=clean(await jbody(req));if(e.length)throw fail(400,e.join('. '));
    db.prepare('UPDATE posts SET title=?,body=?,description=?,hashtags=?,link=?,notes=?,platforms=?,media=?,updated_at=? WHERE id=?').run(d.title,d.body,d.description,d.hashtags,d.link,d.notes,JSON.stringify(d.platforms),JSON.stringify(d.media),now(),row.id);
    log('post_updated',d.title);return send(res,200,get(row.id))}
   if(m==='POST'&&act==='duplicate'){const i=newId();ins(i,{...row,title:(row.title+' (bản sao)').slice(0,200)},now());log('post_duplicated',row.title);return send(res,201,get(i))}
   if(m==='POST'&&act==='schedule'){if(['processing','published'].includes(row.status))throw fail(409,'Bài này không thể lên lịch lại');
    const b=await jbody(req),t=new Date(b.scheduledAt);if(isNaN(t)||t.getTime()<Date.now()-60000)throw fail(400,'Thời gian đăng phải ở tương lai');
    const d=out(row),pr=[];if(!d.platforms.length)pr.push('Chọn ít nhất một nền tảng');if(!d.title&&!d.body)pr.push('Thiếu nội dung');pr.push(...over(d));if(pr.length)throw fail(400,pr.join('. '));
    db.prepare("UPDATE posts SET status='scheduled',scheduled_at=?,error=NULL,updated_at=? WHERE id=?").run(t.toISOString(),now(),row.id);log('post_scheduled',row.title+' '+t.toISOString());return send(res,200,get(row.id))}
   if(m==='POST'&&act==='cancel'){if(row.status!=='scheduled')throw fail(409,'Chỉ hủy được bài đang ở trạng thái đã lên lịch');
    db.prepare("UPDATE posts SET status='cancelled',updated_at=? WHERE id=?").run(now(),row.id);log('post_cancelled',row.title);return send(res,200,get(row.id))}}

  if(m==='GET'&&p==='/api/platforms')return send(res,200,{items:A.all()});
  const pc=p.match(/^\/api\/platforms\/(\w+)\/check$/);
  if(m==='POST'&&pc){if(!A.defs[pc[1]])throw fail(404,'Nền tảng không tồn tại');const s=await A.verify(pc[1]);log('platform_check',s.name+': '+s.message,s.connected?'info':'warn');return send(res,200,s)}

  if(p==='/api/media'&&m==='GET')return send(res,200,{items:db.prepare('SELECT id,name,file,mime,size,created_at FROM media ORDER BY created_at DESC').all()});
  if(p==='/api/media'&&m==='POST'){const buf=await readBody(req,MAXUP),t=sniff(buf);
   if(!t)throw fail(415,'Định dạng không được hỗ trợ (chỉ PNG, JPG, GIF, WEBP, MP4, WEBM)');
   const i=newId(),f=i+t[1];let name='tep'+t[1];try{name=path.basename(decodeURIComponent(req.headers['x-filename']||name)).slice(0,120)||name}catch{}
   fs.writeFileSync(path.join(UP,f),buf);db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?)').run(i,name,f,t[0],buf.length,now());
   log('media_uploaded',name);return send(res,201,{id:i,name,file:f,mime:t[0],size:buf.length})}
  const md2=p.match(/^\/api\/media\/([a-f0-9]{16})$/);
  if(md2&&m==='DELETE'){const r=db.prepare('SELECT file FROM media WHERE id=?').get(md2[1]);if(!r)throw fail(404,'Không tìm thấy tệp');
   fs.rmSync(path.join(UP,r.file),{force:true});db.prepare('DELETE FROM media WHERE id=?').run(md2[1]);log('media_deleted',md2[1]);return send(res,200,{ok:true})}

  if(m==='GET'&&p==='/api/activity')return send(res,200,{items:db.prepare('SELECT at,action,level,detail FROM activity ORDER BY id DESC LIMIT 100').all()});
  if(m==='GET'&&p==='/api/export'){res.setHeader('Content-Disposition','attachment; filename="kais-studio-export.json"');
   return send(res,200,{exportedAt:now(),posts:db.prepare('SELECT * FROM posts').all().map(out),media:db.prepare('SELECT * FROM media').all(),activity:db.prepare('SELECT * FROM activity').all()})}
  if(m==='POST'&&p==='/api/data/reset'){if((await jbody(req)).confirm!=='XOA')throw fail(400,'Cần xác nhận xóa dữ liệu');
   for(const f of fs.readdirSync(UP))fs.rmSync(path.join(UP,f),{force:true});db.exec('DELETE FROM posts;DELETE FROM media;DELETE FROM activity');return send(res,200,{ok:true})}
  throw fail(404,'Không tìm thấy API');
 }catch(e){if(!e.status)console.error(e.message);if(res.headersSent)return res.end();send(res,e.status||500,{error:e.status?e.message:'Lỗi máy chủ nội bộ'})}
});

if(require.main===module){
 db.prepare("UPDATE posts SET status='failed',error='Tác vụ bị gián đoạn khi máy chủ khởi động lại, kiểm tra trên nền tảng trước khi lên lịch lại',updated_at=? WHERE status='processing'").run(now());
 const port=+process.env.PORT||3000;
 server.listen(port,()=>console.log('KAIS STUDIO chạy tại http://localhost:'+port));
 setInterval(()=>tick().catch(e=>console.error(e.message)),15000);
}
module.exports={server,tick,db};
