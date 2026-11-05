// Browser chat simulator – only mounted in simulation mode (no WhatsApp credentials set).
const crypto = require('crypto');
const wa = require('./whatsapp');
const { handleIncoming } = require('./bot');

module.exports = function mountSimulator(app) {
  app.post('/simulator/send', async (req, res) => {
    const { phone, name, text, id, title } = req.body || {};
    if (!/^\d{8,15}$/.test(String(phone || ''))) return res.status(400).json({ error: 'phone must be digits, e.g. 6281234567890' });
    const msgId = 'sim.' + crypto.randomUUID();
    const message = id
      ? { id: msgId, from: phone, type: 'interactive', interactive: id.startsWith('menu:') || id.startsWith('prod:')
          ? { type: 'list_reply', list_reply: { id, title } } : { type: 'button_reply', button_reply: { id, title } } }
      : { id: msgId, from: phone, type: 'text', text: { body: String(text || '') } };
    try {
      await handleIncoming({ from: phone, profileName: name, message });
      res.json({ messages: wa.takeOutbox(phone) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/simulator/inbox', (req, res) => res.json({ messages: wa.takeOutbox(String(req.query.phone || '')) }));

  app.get('/simulator', (_req, res) => res.type('html').send(PAGE));
};

const PAGE = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AgronomiZ Simulator</title><style>
:root{--bg:#efeae2;--me:#d9fdd3;--bot:#fff;--ink:#111b21;--muted:#667781;--accent:#008069;--line:#e9edef}
*{box-sizing:border-box}body{margin:0;font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;background:#d1d7db;color:var(--ink);display:flex;justify-content:center}
.app{width:100%;max-width:480px;height:100vh;display:flex;flex-direction:column;background:var(--bg)}
header{background:var(--accent);color:#fff;padding:10px 14px}header b{display:block}header small{opacity:.85}
.who{display:flex;gap:6px;padding:8px 10px;background:#f0f2f5;border-bottom:1px solid var(--line);flex-wrap:wrap}
.who input{flex:1;min-width:120px;padding:6px 8px;border:1px solid var(--line);border-radius:6px;font:inherit}
.who button{padding:6px 10px}
#chat{flex:1;overflow-y:auto;padding:12px 10px}
.msg{max-width:85%;margin:4px 0;padding:7px 10px;border-radius:8px;white-space:pre-wrap;word-wrap:break-word;box-shadow:0 1px .5px rgba(0,0,0,.13)}
.me{background:var(--me);margin-left:auto}.bot{background:var(--bot)}.note{text-align:center;color:var(--muted);font-size:12px;margin:10px 0}
.btns{display:flex;flex-direction:column;gap:4px;margin-top:6px}.btns button,.listbtn{background:#fff;border:0;border-top:1px solid var(--line);color:var(--accent);padding:8px;font:inherit;cursor:pointer}
.rows{margin-top:6px;border-top:1px solid var(--line)}.rows .sec{font-size:12px;color:var(--muted);padding:6px 0 2px}
.rows button{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);padding:7px 2px;font:inherit;cursor:pointer}.rows button small{display:block;color:var(--muted)}
form.send{display:flex;gap:6px;padding:8px;background:#f0f2f5}form.send input{flex:1;padding:10px 12px;border:0;border-radius:20px;font:inherit}
button{border:0;border-radius:6px;background:var(--accent);color:#fff;font:inherit;cursor:pointer}form.send button{border-radius:20px;padding:0 16px}
</style></head><body><div class="app">
<header><b>AgronomiZ · Simulator</b><small>Mode uji – pesan tidak dikirim ke WhatsApp asli</small></header>
<div class="who"><input id="phone" value="6281200000001" title="Nomor WhatsApp pengirim"><input id="name" value="Budi" title="Nama profil WhatsApp"><button id="switch">Ganti</button></div>
<div id="chat"></div>
<form class="send" id="f"><input id="t" placeholder="Ketik pesan… (coba: halo)" autocomplete="off"><button>Kirim</button></form>
</div><script>
const chat=document.getElementById('chat'),phone=document.getElementById('phone'),name=document.getElementById('name');
const el=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e};
const fmt=s=>s; // WhatsApp *bold* shown as-is
function add(m){
  const d=el('div','msg bot');
  if(m.type==='text'){d.textContent=fmt(m.text)}
  else if(m.type==='buttons'){d.append(el('div',null,m.body));const b=el('div','btns');m.buttons.forEach(x=>{const btn=el('button',null,x.title);btn.onclick=()=>send({id:x.id,title:x.title});b.append(btn)});d.append(b)}
  else if(m.type==='list'){d.append(el('div',null,m.body));const r=el('div','rows');r.append(el('div','sec','☰ '+m.button));m.sections.forEach(s=>{r.append(el('div','sec',s.title));s.rows.forEach(x=>{const b=el('button',null,x.title);if(x.description)b.append(el('small',null,x.description));b.onclick=()=>send({id:x.id,title:x.title});r.append(b)})});d.append(r)}
  chat.append(d);chat.scrollTop=chat.scrollHeight}
async function send(p){
  chat.append(el('div','msg me',p.title||p.text));chat.scrollTop=chat.scrollHeight;
  const r=await fetch('/simulator/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:phone.value.trim(),name:name.value.trim(),...p})});
  const j=await r.json();if(j.error){chat.append(el('div','note','Error: '+j.error));return}j.messages.forEach(add)}
document.getElementById('f').onsubmit=e=>{e.preventDefault();const t=document.getElementById('t');if(!t.value.trim())return;send({text:t.value.trim()});t.value=''};
document.getElementById('switch').onclick=async()=>{chat.innerHTML='';chat.append(el('div','note','Sekarang sebagai +'+phone.value.trim()+' ('+name.value.trim()+')'));
  const j=await (await fetch('/simulator/inbox?phone='+encodeURIComponent(phone.value.trim()))).json();j.messages.forEach(add)};
chat.append(el('div','note','Sebagai +'+phone.value+'. Ganti nomor untuk mencoba sebagai orang lain (misalnya rekrutan).'));
</script></body></html>`;
