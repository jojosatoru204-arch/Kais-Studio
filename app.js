'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ST={draft:'Bản nháp',scheduled:'Đã lên lịch',processing:'Đang xử lý',published:'Đã xuất bản',failed:'Thất bại',cancelled:'Đã hủy'};
const PN={youtube:'YouTube',tiktok:'TikTok',facebook:'Facebook'};
const TZ=Intl.DateTimeFormat().resolvedOptions().timeZone;
const fmt=d=>d?new Date(d).toLocaleString('vi-VN'):'';
const kb=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.ceil(n/1024)+' KB';
let B={name:'KAIS STUDIO',product:'MultiPost Studio Pro',taglineVi:'',maxUploadMb:50},F={q:'',status:'',platform:''},DAYS=14,LIM={},cur={id:null},MEDIA=[],tm;
const JH={'Content-Type':'application/json'};
async function api(u,o={}){o.headers={'X-Requested-With':'kais-studio',...(o.headers||{})};let r;
 try{r=await fetch(u,o)}catch{throw new Error('Không kết nối được máy chủ')}
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Lỗi '+r.status);return d}
const post=(u,b)=>api(u,{method:'POST',headers:JH,body:JSON.stringify(b||{})});
function toast(m,e){const t=document.createElement('div');t.className='toast'+(e?' err':'');t.textContent=m;$('#toasts').append(t);setTimeout(()=>t.remove(),4500)}
function ask(msg){return new Promise(ok=>{const d=document.createElement('dialog');
 d.innerHTML=`<p>${esc(msg)}</p><div class="row"><button class="btn" value="0">Hủy</button><button class="btn pri" value="1">Xác nhận</button></div>`;
 d.onclose=()=>{d.remove();ok(d.returnValue==='1')};d.onclick=e=>{if(e.target.tagName==='BUTTON')d.close(e.target.value)};document.body.append(d);d.showModal()})}
async function busy(b,fn){b.disabled=true;const t=b.textContent;b.textContent='Đang xử lý…';try{await fn()}catch(e){toast(e.message,1)}finally{b.disabled=false;b.textContent=t}}
const card=p=>`<article class="card post"><div><span class="tag ${p.status}">${ST[p.status]}</span><h3>${esc(p.title||'(Chưa có tiêu đề)')}</h3><p class="mut">${esc(p.body.slice(0,140))}</p>
<small class="mut">${p.platforms.map(x=>PN[x]).join(', ')||'Chưa chọn nền tảng'}</small>${p.scheduled_at?`<br><small class="mut">Đăng lúc ${fmt(p.scheduled_at)}</small>`:''}${p.error?`<p class="errtxt">${esc(p.error)}</p>`:''}</div>
<div class="row"><a class="btn" href="#/editor/${p.id}">Sửa</a><button class="btn" data-act="dup" data-id="${p.id}">Nhân bản</button>${p.status==='scheduled'?`<button class="btn" data-act="cancel" data-id="${p.id}">Hủy lịch</button>`:''}<button class="btn dng" data-act="del" data-id="${p.id}">Xóa</button></div></article>`;

async function dashboard(){const s=await api('/api/stats?days='+DAYS),C=s.counts;
 const cards=[['Tổng bài viết',s.total],['Bản nháp',C.draft],['Đã lên lịch',C.scheduled],['Đang xử lý',C.processing],['Đã xuất bản',C.published],['Thất bại',C.failed],['Nền tảng đã kết nối',s.connected+'/'+s.platformCount]];
 const max=Math.max(1,...s.days.flatMap(x=>[x.published,x.failed])),has=s.days.some(x=>x.published||x.failed);
 $('#view').innerHTML=`<header class="ph"><div><h1>${esc(B.product)}</h1><span class="mut">${esc(B.taglineVi)}</span></div><a class="btn pri" href="#/editor">Tạo bài viết</a></header>
 <div class="grid">${cards.map(c=>`<div class="card stat"><b>${c[1]}</b><span>${c[0]}</span></div>`).join('')}</div>
 <section class="card" style="margin-top:12px"><div class="ph"><h3 style="margin:0">Hoạt động theo ngày (UTC)</h3><select id="fd" aria-label="Khoảng thời gian" style="width:auto">${[7,14,30].map(n=>`<option value="${n}" ${n===DAYS?'selected':''}>${n} ngày</option>`).join('')}</select></div>
 ${has?`<div class="bars">${s.days.map(x=>`<div class="bar" title="${x.d}: ${x.published} xuất bản, ${x.failed} thất bại"><i class="ok" style="height:${x.published/max*100}%"></i><i class="bad" style="height:${x.failed/max*100}%"></i><span>${x.d.slice(8)}</span></div>`).join('')}</div><p class="mut" style="margin-top:24px">Xanh là đã xuất bản, đỏ là thất bại.</p>`:'<p class="mut">Chưa có bài đã xuất bản hoặc thất bại trong khoảng này.</p>'}</section>
 <div class="row" style="margin:12px 0"><a class="btn" href="#/calendar">Mở lịch đăng</a><a class="btn" href="#/media">Thư viện media</a><a class="btn" href="#/platforms">Quản lý nền tảng</a><a class="btn" href="#/settings">Cài đặt</a></div>
 <section class="card"><h3 style="margin-top:0">Tác vụ gần đây</h3>${s.activity.length?s.activity.map(a=>`<p class="${a.level==='error'?'errtxt':'mut'}">${fmt(a.at)}: ${esc(a.action)} ${esc(a.detail)}</p>`).join(''):'<p class="mut">Chưa có hoạt động nào.</p>'}</section>`}

async function posts(){
 $('#view').innerHTML=`<header class="ph"><h1>Bài viết</h1><a class="btn pri" href="#/editor">Tạo bài viết</a></header>
 <div class="row" style="margin-bottom:12px"><input id="fq" type="search" aria-label="Tìm kiếm" placeholder="Tìm theo tiêu đề hoặc nội dung" value="${esc(F.q)}" style="flex:2;min-width:200px">
 <select id="fs" aria-label="Trạng thái" style="flex:1"><option value="">Mọi trạng thái</option>${Object.entries(ST).map(([k,v])=>`<option value="${k}" ${F.status===k?'selected':''}>${v}</option>`).join('')}</select>
 <select id="fp" aria-label="Nền tảng" style="flex:1"><option value="">Mọi nền tảng</option>${Object.entries(PN).map(([k,v])=>`<option value="${k}" ${F.platform===k?'selected':''}>${v}</option>`).join('')}</select></div><div id="plist" class="list"></div>`;
 await loadList()}
async function loadList(){const{items}=await api('/api/posts?'+new URLSearchParams(F));
 $('#plist').innerHTML=items.length?items.map(card).join(''):`<div class="empty">${F.q||F.status||F.platform?'Không có bài viết khớp bộ lọc.':'Chưa có bài viết nào.'} <a href="#/editor">Tạo bài viết</a></div>`}

const val=i=>$('#'+i).value;
const gather=()=>({title:val('f-title'),body:val('f-body'),description:val('f-desc'),hashtags:val('f-tags'),link:val('f-link'),notes:val('f-notes'),platforms:$$('[name=pl]:checked').map(x=>x.value),media:$$('[name=md]:checked').map(x=>x.value)});
async function saveDraft(){const b=JSON.stringify(gather()),r=cur.id?await api('/api/posts/'+cur.id,{method:'PUT',headers:JH,body:b}):await api('/api/posts',{method:'POST',headers:JH,body:b});cur.id=r.id;return r}
function preview(){const b=gather();
 $('#pv').innerHTML=`<strong>${esc(b.title||'(Chưa có tiêu đề)')}</strong><p style="white-space:pre-wrap">${esc(b.body)||'<span class="mut">Nội dung trống</span>'}</p>`+(b.hashtags?`<p class="mut">${esc(b.hashtags)}</p>`:'')+(b.link?`<p class="mut">${esc(b.link)}</p>`:'');
 $('#cnt').innerHTML=(!b.title&&!b.body?'<p class="errtxt">Cần nhập tiêu đề hoặc nội dung.</p>':'')+(b.platforms.length?b.platforms.map(k=>{const l=LIM[k],bad=b.body.length>l.body||(l.title&&b.title.length>l.title);
  return `<p class="${bad?'errtxt':'mut'}">${PN[k]}: nội dung ${b.body.length}/${l.body}${l.title?`, tiêu đề ${b.title.length}/${l.title}`:''}${bad?'. Vượt giới hạn':''}</p>`}).join(''):'<p class="mut">Chọn nền tảng để kiểm tra giới hạn ký tự.</p>')}
async function editor(id){
 const[pl,ml]=await Promise.all([api('/api/platforms'),api('/api/media')]);LIM=Object.fromEntries(pl.items.map(p=>[p.id,p.limits]));cur={id:id||null};
 let p={title:'',body:'',description:'',hashtags:'',link:'',notes:'',platforms:[],media:[],status:'draft',scheduled_at:null};if(id)p=await api('/api/posts/'+id);
 const d=p.scheduled_at?new Date(p.scheduled_at):null,when=d?new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,16):'';
 $('#view').innerHTML=`<header class="ph"><h1>${id?'Sửa bài viết':'Soạn bài viết'}</h1><span class="tag ${p.status}">${ST[p.status]}</span></header>
 <div id="editor" class="two"><section class="card">
 <label for="f-title">Tiêu đề</label><input id="f-title" maxlength="200" value="${esc(p.title)}">
 <label for="f-body">Nội dung bài đăng</label><textarea id="f-body" rows="7" maxlength="5000">${esc(p.body)}</textarea>
 <label for="f-desc">Mô tả</label><textarea id="f-desc" rows="2" maxlength="2000">${esc(p.description)}</textarea>
 <label for="f-tags">Hashtag</label><input id="f-tags" maxlength="500" value="${esc(p.hashtags)}" placeholder="#kaistudio #sangtao">
 <label for="f-link">Liên kết</label><input id="f-link" type="url" maxlength="500" value="${esc(p.link)}" placeholder="https://">
 <label for="f-notes">Ghi chú nội bộ (không đăng)</label><input id="f-notes" maxlength="1000" value="${esc(p.notes)}">
 <label>Nền tảng mục tiêu</label><div class="row">${pl.items.map(x=>`<label class="row"><input type="checkbox" name="pl" value="${x.id}" style="width:auto;min-height:0" ${p.platforms.includes(x.id)?'checked':''}>${esc(x.name)}</label>`).join('')}</div>
 <label>Ảnh và video đính kèm</label>${ml.items.length?`<div class="media">${ml.items.map(m=>`<label class="card"><input type="checkbox" name="md" value="${m.id}" style="width:auto;min-height:0" ${p.media.includes(m.id)?'checked':''}> <small>${esc(m.name)}</small>${m.mime.startsWith('image')?`<img src="/media/${m.file}" alt="" loading="lazy">`:'<small class="mut">Video</small>'}</label>`).join('')}</div>`:'<p class="mut">Thư viện trống. <a href="#/media">Tải tệp lên</a></p>'}
 <label for="f-when">Thời gian đăng (múi giờ ${esc(TZ)})</label><input id="f-when" type="datetime-local" value="${when}">
 <div class="row" style="margin-top:14px"><button class="btn" data-act="save">Lưu bản nháp</button><button class="btn pri" data-act="sched">Lên lịch đăng</button><button class="btn" data-act="copy">Sao chép nội dung</button></div></section>
 <section class="card"><h3 style="margin-top:0">Xem trước</h3><p class="mut">Bản xem trước mô phỏng. Giao diện thật trên từng nền tảng có thể khác.</p><div id="pv" class="card"></div><h3>Giới hạn ký tự</h3><div id="cnt"></div></section></div>`;
 preview()}

async function calendar(){const{items}=await api('/api/posts?status=scheduled&sort=scheduled'),g={};
 items.forEach(p=>{const d=new Date(p.scheduled_at).toLocaleDateString('vi-VN',{weekday:'long',day:'numeric',month:'numeric',year:'numeric'});(g[d]=g[d]||[]).push(p)});
 $('#view').innerHTML=`<header class="ph"><h1>Lịch đăng</h1><span class="mut">Múi giờ: ${esc(TZ)}</span></header>`+(items.length?Object.entries(g).map(([d,a])=>`<h3>${esc(d)}</h3><div class="list">${a.map(card).join('')}</div>`).join(''):'<div class="empty">Chưa có bài nào được lên lịch. <a href="#/editor">Soạn bài và chọn thời gian đăng</a></div>')}

const thumb=m=>m.mime.startsWith('image')?`<img src="/media/${m.file}" alt="${esc(m.name)}" loading="lazy">`:`<video src="/media/${m.file}" controls preload="metadata"></video>`;
function drawMedia(){const q=($('#ms')?.value||'').toLowerCase(),t=$('#mt')?.value||'',a=MEDIA.filter(m=>m.name.toLowerCase().includes(q)&&(!t||m.mime.startsWith(t)));
 $('#mg').innerHTML=a.length?a.map(m=>`<div class="card">${thumb(m)}<p style="margin:8px 0 2px;word-break:break-all">${esc(m.name)}</p><small class="mut">${esc(m.mime)}, ${kb(m.size)}</small><div style="margin-top:8px"><button class="btn dng" data-act="mdel" data-id="${m.id}">Xóa</button></div></div>`).join(''):`<div class="empty" style="grid-column:1/-1">${MEDIA.length?'Không có tệp khớp bộ lọc.':'Chưa có tệp nào. Tải ảnh hoặc video lên để bắt đầu.'}</div>`}
async function media(){MEDIA=(await api('/api/media')).items;
 $('#view').innerHTML=`<header class="ph"><h1>Thư viện media</h1></header><div class="card"><label for="up" class="btn pri" style="display:inline-flex;margin:0;color:#fff">Tải ảnh hoặc video lên</label>
 <input id="up" type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm" multiple hidden><p class="mut">Chấp nhận PNG, JPG, GIF, WEBP, MP4, WEBM. Tối đa ${B.maxUploadMb} MB mỗi tệp.</p></div>
 <div class="row" style="margin:12px 0"><input id="ms" type="search" aria-label="Tìm tệp" placeholder="Tìm theo tên tệp" style="flex:2"><select id="mt" aria-label="Loại tệp" style="flex:1"><option value="">Ảnh và video</option><option value="image">Ảnh</option><option value="video">Video</option></select></div><div id="mg" class="media"></div>`;
 drawMedia()}

async function platforms(){const{items}=await api('/api/platforms');
 $('#view').innerHTML=`<header class="ph"><h1>Nền tảng</h1></header><div class="list">${items.map(p=>`<article class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(p.name)}</h3><span class="tag ${p.configured?'scheduled':'failed'}">${esc(p.message)}</span></div>
 <p class="mut">Liên kết tài khoản: ${p.connected?'Đã xác minh':'Chưa xác minh (bấm Kiểm tra cấu hình)'}. Giới hạn nội dung: ${p.limits.body} ký tự.</p>${p.missing.length?`<p class="errtxt">Thiếu biến môi trường: ${p.missing.map(esc).join(', ')}</p>`:''}
 <div class="row"><button class="btn" data-act="check" data-id="${p.id}">Kiểm tra cấu hình</button><a class="btn" href="https://app.ayrshare.com" target="_blank" rel="noopener noreferrer">Liên kết tài khoản</a><a class="btn" href="${esc(p.docs)}" target="_blank" rel="noopener noreferrer">Tài liệu API</a></div></article>`).join('')}</div>`}

async function settings(){
 $('#view').innerHTML=`<header class="ph"><h1>Cài đặt</h1></header>
 <section class="card"><h3 style="margin-top:0">Giao diện</h3><div class="row"><button class="btn" data-act="theme" data-id="dark">Chế độ tối</button><button class="btn" data-act="theme" data-id="light">Chế độ sáng</button></div></section>
 <section class="card" style="margin-top:12px"><h3 style="margin-top:0">Thương hiệu</h3><p>${esc(B.name)}, ${esc(B.product)}</p><p class="mut">Đổi tên, khẩu hiệu, màu và chân trang trong tệp brand.config.json.</p></section>
 <section class="card" style="margin-top:12px"><h3 style="margin-top:0">Dữ liệu</h3><div class="row"><a class="btn" href="/api/export" download>Xuất dữ liệu (JSON)</a><button class="btn dng" data-act="reset">Xóa toàn bộ dữ liệu</button></div><p class="mut">Dữ liệu lưu trên máy chủ (SQLite). Không cần tạo tài khoản.</p></section>
 <section class="card" style="margin-top:12px"><h3 style="margin-top:0">API nền tảng</h3><p class="mut">Đặt khóa trong tệp .env trên máy chủ (xem .env.example) rồi khởi động lại. Khóa không bao giờ được gửi về trình duyệt. Xem trạng thái tại trang Nền tảng.</p></section>`}

const ACT={
 reload:()=>route(),
 dup:async b=>{await post(`/api/posts/${b.dataset.id}/duplicate`);toast('Đã nhân bản bài viết');route()},
 del:async b=>{if(await ask('Xóa bài viết này? Thao tác không thể hoàn tác.')){await api('/api/posts/'+b.dataset.id,{method:'DELETE'});toast('Đã xóa bài viết');route()}},
 cancel:async b=>{await post(`/api/posts/${b.dataset.id}/cancel`);toast('Đã hủy lịch đăng');route()},
 mdel:async b=>{if(await ask('Xóa tệp này khỏi thư viện?')){await api('/api/media/'+b.dataset.id,{method:'DELETE'});toast('Đã xóa tệp');route()}},
 check:async b=>{const s=await post(`/api/platforms/${b.dataset.id}/check`);toast(s.name+': '+s.message,!s.connected)},
 save:async()=>{const r=await saveDraft();toast('Đã lưu bản nháp');if(location.hash!=='#/editor/'+r.id)location.hash='#/editor/'+r.id},
 sched:async()=>{const w=val('f-when');if(!w)throw new Error('Chọn thời gian đăng trước khi lên lịch');const r=await saveDraft();await post(`/api/posts/${r.id}/schedule`,{scheduledAt:new Date(w).toISOString()});toast('Đã lên lịch đăng');location.hash='#/calendar'},
 copy:async()=>{const b=gather();try{await navigator.clipboard.writeText([b.title,b.body,b.hashtags].filter(Boolean).join('\n\n'));toast('Đã sao chép nội dung')}catch{throw new Error('Không sao chép được. Trình duyệt chỉ cho phép trên HTTPS hoặc localhost')}},
 theme:b=>{document.documentElement.dataset.theme=b.dataset.id;try{localStorage.setItem('theme',b.dataset.id)}catch{}},
 reset:async()=>{if(await ask('Xóa toàn bộ bài viết, media và nhật ký? Thao tác không thể hoàn tác.')){await post('/api/data/reset',{confirm:'XOA'});toast('Đã xóa dữ liệu');route()}}};
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b&&Object.hasOwn(ACT,b.dataset.act))busy(b,()=>ACT[b.dataset.act](b))});
document.addEventListener('input',e=>{const t=e.target;
 if(t.id==='fq'){clearTimeout(tm);tm=setTimeout(()=>{F.q=t.value;loadList().catch(x=>toast(x.message,1))},300)}
 if(t.id==='ms')drawMedia();if(t.closest('#editor'))preview()});
document.addEventListener('change',async e=>{const t=e.target;
 if(t.id==='fs'||t.id==='fp'){F[t.id==='fs'?'status':'platform']=t.value;loadList().catch(x=>toast(x.message,1))}
 if(t.id==='fd'){DAYS=+t.value;route()}if(t.id==='mt')drawMedia();
 if(t.id==='up'){for(const f of t.files){if(f.size>B.maxUploadMb*1048576){toast(`${f.name}: vượt ${B.maxUploadMb} MB`,1);continue}
  try{toast('Đang tải lên '+f.name);await api('/api/media',{method:'POST',headers:{'x-filename':encodeURIComponent(f.name)},body:f});toast('Đã tải lên '+f.name)}catch(x){toast(f.name+': '+x.message,1)}}route()}});

const R={dashboard,posts,editor,calendar,media,platforms,settings};
async function route(){const[n0,a]=location.hash.slice(2).split('/'),n=Object.hasOwn(R,n0)?n0:'dashboard';
 $$('nav a').forEach(x=>x.classList.toggle('on',x.dataset.r===n));$('#view').innerHTML='<div class="sk"></div><div class="sk"></div>';
 try{await R[n](a)}catch(e){$('#view').innerHTML=`<div class="empty"><p class="errtxt">${esc(e.message)}</p><button class="btn" data-act="reload">Thử lại</button></div>`}}
(async()=>{try{const t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch{}
 try{B=await api('/api/brand');document.title=B.name+' - '+B.product;const T={name:B.name,tagline:B.taglineEn,footer:B.footer};$$('[data-b]').forEach(e=>e.textContent=T[e.dataset.b]);
  document.documentElement.style.setProperty('--b1',B.colors.primary);document.documentElement.style.setProperty('--b2',B.colors.secondary)}catch{}
 addEventListener('hashchange',route);route()})();
