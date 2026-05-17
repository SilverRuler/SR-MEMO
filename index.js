const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const http = require('http');
const session = require('express-session');
const admin = require('firebase-admin');
const rateLimit = require('express-rate-limit');

const app = express();
const apiPort = 6000;
const uiPort = 6001;

// Firebase 설정
const keyPath = path.resolve(__dirname, 'firebase-key.json');
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://sr-memo-default-rtdb.firebaseio.com/'
  });
}

const fbDB = admin.database();

// --- 보안 설정: Rate Limiting ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // IP당 최대 100번 요청
  message: "Too many requests, please try again later."
});

const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1시간
  max: 10, // 로그인 시도는 1시간에 10번만 가능
  message: "Too many login attempts, please try again after an hour."
});

app.use(limiter);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '.'))); // favicon.png 등을 서빙하기 위함

// 세션 비밀키를 Firebase나 랜덤 생성 방식으로 변경
app.use(session({
  secret: 'SR_' + (serviceAccount.private_key_id || 'default_secret_123'),
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true, // XSS 방지
    sameSite: 'lax'
  }
}));

const getAuthData = async () => {
  const snapshot = await fbDB.ref('/auth').once('value');
  return snapshot.val();
};

const authRequired = async (req, res, next) => {
  if (req.session.loggedIn) return next();
  const token = req.headers['x-sr-token'];
  if (token) {
    const auth = await getAuthData();
    if (auth && token === auth.pw) return next();
  }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/login');
};

const getDBData = async () => {
  const snapshot = await fbDB.ref('/').once('value');
  let data = snapshot.val() || {};
  if (!data.sections) data.sections = {};
  return data;
};

const saveDBData = async (data) => {
  await fbDB.ref('/').set(data);
};

// --- 라우팅 ---

app.get('/login', (req, res) => {
  res.send('<!DOCTYPE html><html><head><title>SR-MEMO</title>' +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<link rel="icon" type="image/png" href="/favicon.png">' +
    '<meta property="og:title" content="SR-MEMO">' +
    '<meta property="og:description" content="SilverRuler의 개인 메모 서버입니다.">' +
    '<meta property="og:image" content="/favicon.png">' +
    '<style>' +
    'body{font-family:sans-serif;background:#f0f2f5;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}' +
    '.box{background:#fff;padding:40px;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,0.1);width:320px;text-align:center;}' +
    'input{width:100%;padding:12px;margin-bottom:15px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;}' +
    'button{width:100%;padding:12px;background:#1a73e8;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:bold;}' +
    '@media(max-width:480px){.box{width:90%;padding:20px;}}' +
    '</style></head><body><div class="box"><h1>SR-MEMO</h1><form method="POST" action="/login">' +
    '<input name="id" placeholder="ID" required><input type="password" name="pw" placeholder="PW" required>' +
    '<button type="submit">Login</button></form></div></body></html>');
});

app.post('/login', loginLimiter, async (req, res) => {
  const { id, pw } = req.body;
  const auth = await getAuthData();
  if (auth && id === auth.id && pw === auth.pw) {
    req.session.loggedIn = true;
    res.redirect('/');
  } else {
    res.send('<script>alert("Login Failed");location.href="/login";</script>');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/api/data', authRequired, async (req, res) => res.json(await getDBData()));

app.post('/api/sections', authRequired, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).send('Name required');
  const db = await getDBData();
  const key = name.toLowerCase().trim();
  if (db.sections[key]) return res.status(400).send('Exists');
  db.sections[key] = { title: key, memos: [] };
  
  if (!db.sectionOrder) db.sectionOrder = Object.keys(db.sections).filter(k => k !== key);
  db.sectionOrder.push(key);
  
  await saveDBData(db);
  res.json({ success: true });
});

app.put('/api/sections/order', authRequired, async (req, res) => {
  const { order } = req.body;
  if (!order || !Array.isArray(order)) return res.status(400).send('Order array required');
  const db = await getDBData();
  db.sectionOrder = order;
  await saveDBData(db);
  res.json({ success: true });
});

app.delete('/api/sections/:key', authRequired, async (req, res) => {
  const db = await getDBData();
  const key = req.params.key;
  if (db.sections) delete db.sections[key];
  if (db.sectionOrder) db.sectionOrder = db.sectionOrder.filter(k => k !== key);
  await saveDBData(db);
  res.json({ success: true });
});

app.post('/api/memos/:key', authRequired, async (req, res) => {
  const db = await getDBData();
  const section = db.sections[req.params.key];
  if (!section) return res.status(404).send('Not found');
  if (!section.memos) section.memos = [];
  const id = section.memos.length > 0 ? Math.max(...section.memos.map(m => m.id)) + 1 : 1;
  section.memos.push({ id, content: req.body.content, date: new Date().toLocaleString() });
  await saveDBData(db);
  res.json({ success: true, id });
});

app.delete('/api/memos/:key/:id', authRequired, async (req, res) => {
  const db = await getDBData();
  const section = db.sections[req.params.key];
  if (section && section.memos) {
    section.memos = section.memos.filter(m => m.id != req.params.id);
    await saveDBData(db);
    res.json({ success: true });
  } else res.status(404).send('Not found');
});

app.get('/:section', async (req, res) => {
  const ua = req.headers['user-agent'] || '';
  if (ua.toLowerCase().includes('curl') || ua.toLowerCase().includes('powershell')) {
    const db = await getDBData();
    const s = db.sections[req.params.section.toLowerCase()];
    if (!s) return res.status(404).send('Section Not Found\n');
    let out = '=== [' + s.title.toUpperCase() + '] ===\n';
    (s.memos || []).slice().reverse().forEach(m => {
      out += '[' + m.id + '] ' + m.content.split('\n')[0].substring(0, 50) + ' (' + m.date + ')\n';
    });
    return res.type('text/plain').send(out);
  }
  res.redirect('/');
});

app.get('/:section/:id', async (req, res) => {
  const db = await getDBData();
  const s = db.sections[req.params.section.toLowerCase()];
  const m = s && s.memos ? s.memos.find(x => x.id == req.params.id) : null;
  if (!m) return res.status(404).send('Memo Not Found\n');
  res.type('text/plain').send('--- MEMO #' + m.id + ' ---\n' + m.content + '\n---');
});

app.get('/', authRequired, (req, res) => {
  const html = `<!DOCTYPE html><html><head><title>SR-MEMO</title><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/png" href="/favicon.png">
  <meta property="og:title" content="SR-MEMO">
  <meta property="og:description" content="SilverRuler의 개인 메모 서버입니다.">
  <meta property="og:image" content="/favicon.png">
  <style>
    :root{--p:#1a73e8;--bg:#f8f9fa;} body{font-family:sans-serif;background:var(--bg);margin:0;display:flex;height:100vh;overflow:hidden;}
    .side{width:260px;background:#fff;border-right:1px solid #ddd;display:flex;flex-direction:column;transition:0.3s;}
    .side-h{padding:20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;}
    .s-list{flex:1;overflow-y:auto;padding:10px;}
    .s-item{padding:12px;border-radius:8px;cursor:pointer;margin-bottom:5px;}
    .s-item:hover{background:#f1f3f4;}
    .s-item.active{background:#e8f0fe;color:var(--p);font-weight:bold;}
    .main{flex:1;display:flex;flex-direction:column;background:#fff;overflow:hidden;}
    .main-h{padding:15px 30px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;}
    .content{flex:1;overflow-y:auto;padding:30px;}
    textarea{width:100%;height:120px;border:1px solid #ddd;border-radius:12px;padding:15px;box-sizing:border-box;font-size:1rem;margin-bottom:10px;resize:none;}
    .m-item{background:#f8f9fa;border-radius:12px;padding:20px;margin-bottom:20px;border:1px solid #eee;max-width:800px;margin:10px auto;}
    .m-h{display:flex;justify-content:space-between;font-size:0.8rem;color:#70757a;}
    .m-b{white-space:pre-wrap;font-family:monospace;line-height:1.6;word-break:break-all;}
    .btn{border:none;border-radius:6px;cursor:pointer;padding:8px 15px;font-weight:bold;}
    .btn-p{background:var(--p);color:#fff;}
    .btn-d{background:#fce8e6;color:#d93025;}
    .btn-c{background:#e8f0fe;color:var(--p);margin-right:5px;}
    #mobile-menu{display:none;padding:10px;background:#fff;border-bottom:1px solid #ddd;justify-content:space-between;align-items:center;}

    @media(max-width:768px){
      body{flex-direction:column;}
      .side{width:100%;height:0;overflow:hidden;border-right:none;border-bottom:1px solid #ddd;position:fixed;top:50px;left:0;z-index:100;}
      .side.open{height:calc(100vh - 50px);}
      .main{height:calc(100vh - 50px);margin-top:50px;}
      #mobile-menu{display:flex;position:fixed;top:0;left:0;right:0;height:50px;box-sizing:border-box;z-index:101;}
      .main-h{padding:10px 20px;}
      .content{padding:15px;}
    }
  </style></head>
  <body>
    <div id="mobile-menu">
      <h2 style="margin:0;font-size:1.2rem;">SR-MEMO</h2>
      <button class="btn btn-p" onclick="toggleMenu()">Menu</button>
    </div>
    <div class="side" id="sidebar"><div class="side-h"><h2>SR-MEMO</h2><a href="/logout" style="font-size:0.8rem;color:#666;">Logout</a></div>
    <div class="s-list" id="s-list"></div><div style="padding:15px;"><button class="btn btn-p" style="width:100%" onclick="addS()">+ New Section</button></div></div>
    <div class="main"><div class="main-h"><h1 id="title" style="margin:0;font-size:1.4rem;">Select Section</h1>
    <div id="acts" style="display:none;gap:10px;"><button class="btn btn-d" onclick="delS()">Delete Section</button></div></div>
    <div class="content"><div id="ui" style="display:none"><div style="max-width:800px;margin:0 auto;">
    <textarea id="input" placeholder="Ctrl+Enter to Save"></textarea><button class="btn btn-p" onclick="saveM()">Save Memo</button></div><div id="list"></div></div></div></div>
    <script>
      let cur=null; let db=null;
      function toggleMenu(){ document.getElementById('sidebar').classList.toggle('open'); }
      async function load(){
        const r=await fetch('/api/data'); if(!r.ok) return; db=await r.json();
        const list=document.getElementById('s-list'); list.innerHTML='';
        if(db.sections){
          let keys = db.sectionOrder || Object.keys(db.sections);
          keys = keys.filter(k => db.sections[k]);
          Object.keys(db.sections).forEach(k => { if(!keys.includes(k)) keys.push(k); });
          
          keys.forEach(k=>{
            const d=document.createElement('div'); d.className='s-item'+(cur===k?' active':'');
            d.style.display='flex'; d.style.justifyContent='space-between'; d.style.alignItems='center';
            
            const txt=document.createElement('span'); 
            txt.innerText=k.toUpperCase(); txt.style.flex='1'; 
            txt.style.cursor='pointer';
            txt.onclick=(e)=>{ e.stopPropagation(); select(k); };
            d.appendChild(txt);
            
            const bBox=document.createElement('div'); bBox.style.display='flex'; bBox.style.gap='2px';
            
            const upBtn=document.createElement('button');
            upBtn.className='btn btn-c'; upBtn.style.padding='2px 5px'; upBtn.style.fontSize='0.6rem';
            upBtn.innerText='▲'; upBtn.onclick=(e)=>{ e.stopPropagation(); moveS(k,-1); };
            
            const dnBtn=document.createElement('button');
            dnBtn.className='btn btn-c'; dnBtn.style.padding='2px 5px'; dnBtn.style.fontSize='0.6rem';
            dnBtn.innerText='▼'; dnBtn.onclick=(e)=>{ e.stopPropagation(); moveS(k,1); };
            
            bBox.appendChild(upBtn); bBox.appendChild(dnBtn);
            d.appendChild(bBox);
            list.appendChild(d);
          });
        }
        if(cur) renderM();
      }
      async function moveS(k, dir){
        let keys = db.sectionOrder || Object.keys(db.sections);
        keys = keys.filter(key => db.sections[key]);
        Object.keys(db.sections).forEach(key => { if(!keys.includes(key)) keys.push(key); });
        const idx = keys.indexOf(k);
        const newIdx = idx + dir;
        if(newIdx < 0 || newIdx >= keys.length) return;
        const temp = keys[idx]; keys[idx] = keys[newIdx]; keys[newIdx] = temp;
        await fetch('/api/sections/order', {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ order: keys })
        });
        load();
      }
      function select(k){
        cur=k; document.getElementById('title').innerText=k.toUpperCase();
        document.getElementById('acts').style.display='flex'; document.getElementById('ui').style.display='block';
        if(window.innerWidth <= 768) toggleMenu();
        load();
      }
      function renderM(){
        const l=document.getElementById('list'); l.innerHTML='';
        const ms=db.sections[cur].memos || [];
        ms.slice().reverse().forEach(m=>{
          const d=document.createElement('div'); d.className='m-item';
          d.innerHTML='<div class="m-h"><span>#'+m.id+' | '+m.date+'</span><div>' +
                      '<button class="btn btn-c" style="padding:4px 8px;font-size:0.7rem;" onclick="copyM('+m.id+')">Copy</button>' +
                      '<button class="btn btn-d" style="padding:4px 8px;font-size:0.7rem;" onclick="delM('+m.id+')">Del</button></div></div>' +
                      '<div class="m-b">'+esc(m.content)+'</div>';
          l.appendChild(d);
        });
      }
      async function addS(){ const n=prompt('Name:'); if(!n)return; await fetch('/api/sections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n})}); load(); }
      async function delS(){ if(!confirm('Delete?'))return; await fetch('/api/sections/'+cur,{method:'DELETE'}); cur=null; document.getElementById('ui').style.display='none'; document.getElementById('acts').style.display='none'; load(); }
      async function saveM(){
        const c=document.getElementById('input').value.trim(); if(!c)return;
        await fetch('/api/memos/'+cur,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:c})});
        document.getElementById('input').value=''; load();
      }
      async function delM(id){ if(!confirm('Delete?'))return; await fetch('/api/memos/'+cur+'/'+id,{method:'DELETE'}); load(); }
      function copyM(id){
        const m = db.sections[cur].memos.find(x => x.id == id);
        if(!m) return;
        navigator.clipboard.writeText(m.content).then(() => alert('Copied to clipboard!')).catch(() => alert('Failed to copy'));
      }
      function esc(t){ const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }
      document.getElementById('input').onkeydown=(e)=>{ if(e.ctrlKey&&e.key==='Enter') saveM(); }; load();
    </script></body></html>`;
  res.send(html);
});

http.createServer(app).listen(apiPort, '0.0.0.0', () => console.log('API ON: ' + apiPort));
http.createServer(app).listen(uiPort, '0.0.0.0', () => console.log('UI ON: ' + uiPort));
