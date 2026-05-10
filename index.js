const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const http = require('http');
const session = require('express-session');
const admin = require('firebase-admin');

const app = express();
const apiPort = 1111;
const uiPort = 2096;

const AUTH_ID = 'aa';
const AUTH_PW = 'bb'; // 이 값이 CLI의 API TOKEN 역할도 수행합니다.

const keyPath = path.resolve(__dirname, 'firebase-key.json');
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://sr-memo-default-rtdb.firebaseio.com/'
  });
}

const fbDB = admin.database();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'sr-memo-cli-ready-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// 인증 미들웨어 (세션 또는 API 헤더 체크)
const authRequired = (req, res, next) => {
  const token = req.headers['x-sr-token'];
  if (req.session.loggedIn || token === AUTH_PW) {
    return next();
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
  res.send('<!DOCTYPE html><html><head><title>Login</title><style>' +
    'body{font-family:sans-serif;background:#f0f2f5;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}' +
    '.box{background:#fff;padding:40px;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,0.1);width:320px;text-align:center;}' +
    'input{width:100%;padding:12px;margin-bottom:15px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;}' +
    'button{width:100%;padding:12px;background:#1a73e8;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:bold;}' +
    '</style></head><body><div class="box"><h1>SR Memo</h1><form method="POST">' +
    '<input name="id" placeholder="ID" required><input type="password" name="pw" placeholder="PW" required>' +
    '<button type="submit">Login</button></form></div></body></html>');
});

app.post('/login', async (req, res) => {
  const { id, pw } = req.body;
  const snapshot = await fbDB.ref('/auth').once('value');
  const auth = snapshot.val();
  if (auth && id === auth.id && pw === auth.pw) {
    req.session.loggedIn = true;
    res.redirect('/');
  } else {
    res.send('<script>alert("FAIL");location.href="/login";</script>');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// 관리 API (인증 필요 - 헤더 또는 세션)
app.get('/api/data', authRequired, async (req, res) => res.json(await getDBData()));

app.post('/api/sections', authRequired, async (req, res) => {
  const { name } = req.body;
  const db = await getDBData();
  const key = name.toLowerCase().trim();
  if (db.sections[key]) return res.status(400).send('Exists');
  db.sections[key] = { title: key, memos: [] };
  await saveDBData(db);
  res.json({ success: true });
});

app.delete('/api/sections/:key', authRequired, async (req, res) => {
  const db = await getDBData();
  delete db.sections[req.params.key];
  await saveDBData(db);
  res.json({ success: true });
});

// 메모 추가 (CLI에서도 사용 가능)
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

// 메모 삭제 (CLI에서도 사용 가능)
app.delete('/api/memos/:key/:id', authRequired, async (req, res) => {
  const db = await getDBData();
  const section = db.sections[req.params.key];
  if (section && section.memos) {
    section.memos = section.memos.filter(m => m.id != req.params.id);
    await saveDBData(db);
    res.json({ success: true });
  } else res.status(404).send('Not found');
});

// 터미널 전용 조회 (1111 포트 주력)
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
  res.send(`<!DOCTYPE html><html><head><title>SR Server</title>
  <style>
    :root{--p:#1a73e8;--bg:#f8f9fa;} body{font-family:sans-serif;background:var(--bg);margin:0;display:flex;height:100vh;overflow:hidden;}
    .side{width:260px;background:#fff;border-right:1px solid #ddd;display:flex;flex-direction:column;}
    .side-h{padding:20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;}
    .s-list{flex:1;overflow-y:auto;padding:10px;}
    .s-item{padding:12px;border-radius:8px;cursor:pointer;margin-bottom:5px;}
    .s-item:hover{background:#f1f3f4;}
    .s-item.active{background:#e8f0fe;color:var(--p);font-weight:bold;}
    .main{flex:1;display:flex;flex-direction:column;background:#fff;}
    .main-h{padding:15px 30px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;}
    .content{flex:1;overflow-y:auto;padding:30px;}
    textarea{width:100%;height:120px;border:1px solid #ddd;border-radius:12px;padding:15px;box-sizing:border-box;font-size:1rem;margin-bottom:10px;}
    .m-item{background:#f8f9fa;border-radius:12px;padding:20px;margin-bottom:20px;border:1px solid #eee;max-width:800px;margin:10px auto;}
    .m-h{display:flex;justify-content:space-between;font-size:0.8rem;color:#70757a;}
    .m-b{white-space:pre-wrap;font-family:monospace;line-height:1.6;}
    .btn{border:none;border-radius:6px;cursor:pointer;padding:8px 15px;font-weight:bold;}
    .btn-p{background:var(--p);color:#fff;}
    .btn-d{background:#fce8e6;color:#d93025;}
  </style></head>
  <body>
    <div class="side"><div class="side-h"><h2>SR Server</h2><a href="/logout">Logout</a></div>
    <div class="s-list" id="s-list"></div><div style="padding:15px;"><button class="btn btn-p" style="width:100%" onclick="addS()">+ New Section</button></div></div>
    <div class="main"><div class="main-h"><h1 id="title">Select Section</h1>
    <div id="acts" style="display:none;gap:10px;"><button class="btn btn-d" onclick="delS()">Delete Section</button></div></div>
    <div class="content"><div id="ui" style="display:none"><div style="max-width:800px;margin:0 auto;">
    <textarea id="input" placeholder="Ctrl+Enter to Save"></textarea><button class="btn btn-p" onclick="saveM()">Save Memo</button></div><div id="list"></div></div></div></div>
    <script>
      let cur=null; let db=null;
      async function load(){
        const r=await fetch('/api/data'); db=await r.json();
        const list=document.getElementById('s-list'); list.innerHTML='';
        Object.keys(db.sections).forEach(k=>{
          const d=document.createElement('div'); d.className='s-item'+(cur===k?' active':'');
          d.innerText=k.toUpperCase(); d.onclick=()=>select(k); list.appendChild(d);
        });
        if(cur) renderM();
      }
      function select(k){
        cur=k; document.getElementById('title').innerText=k.toUpperCase();
        document.getElementById('acts').style.display='flex'; document.getElementById('ui').style.display='block';
        load();
      }
      function renderM(){
        const l=document.getElementById('list'); l.innerHTML='';
        const ms=db.sections[cur].memos || [];
        ms.slice().reverse().forEach(m=>{
          const d=document.createElement('div'); d.className='m-item';
          d.innerHTML='<div class="m-h"><span>#'+m.id+' | '+m.date+'</span><button class="btn btn-d" style="padding:4px 8px;font-size:0.7rem;" onclick="delM('+m.id+')">Del</button></div>' +
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
      function esc(t){ const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }
      document.getElementById('input').onkeydown=(e)=>{ if(e.ctrlKey&&e.key==='Enter') saveM(); }; load();
    </script></body></html>`);
});

http.createServer(app).listen(apiPort, '0.0.0.0', () => console.log('API ON: ' + apiPort));
http.createServer(app).listen(uiPort, '0.0.0.0', () => console.log('UI ON: ' + uiPort));
