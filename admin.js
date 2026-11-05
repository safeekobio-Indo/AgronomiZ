// Password-protected admin page: approve agents, see the network, follow up on quote requests.
const crypto = require('crypto');
const config = require('./config');
const store = require('./db');
const { notifyStatusChange } = require('./bot');
const { getProduct } = require('./products');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE = { agronomis: 'Agronomis', toko: 'Toko Tani' };
const STATUS = { pending: 'Menunggu', active: 'Aktif', rejected: 'Ditolak' };
const csrfToken = () => crypto.createHmac('sha256', config.adminPassword || 'x').update('csrf').digest('hex').slice(0, 32);
const fmtTime = t => (t ? new Date(t.replace(' ', 'T') + 'Z').toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '');

function auth(req, res, next) {
  if (!config.adminPassword) return res.status(503).type('text').send('Admin page disabled. Set ADMIN_PASSWORD in .env.');
  const [type, b64] = (req.get('authorization') || '').split(' ');
  if (type === 'Basic' && b64) {
    const [u, ...p] = Buffer.from(b64, 'base64').toString().split(':');
    const ok = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    if (ok(u, config.adminUser) && ok(p.join(':'), config.adminPassword)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="AgronomiZ admin"').sendStatus(401);
}
function checkCsrf(req, res, next) {
  if (req.body?.csrf !== csrfToken()) return res.status(403).send('Invalid form token. Reload the page and try again.');
  next();
}

function csv(rows, cols) {
  const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [cols.map(c => c[0]).join(','), ...rows.map(r => cols.map(c => cell(c[1](r))).join(','))].join('\r\n');
}

function page(body) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AgronomiZ Admin</title><style>
:root{--bg:#f6f7f3;--card:#fff;--ink:#1d2a1f;--muted:#66705f;--line:#e2e5dc;--green:#2f6b3a;--green-soft:#e5f0e3;--amber:#9a6700;--amber-soft:#fff4d6;--red:#a33a2b;--red-soft:#fbe6e2}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--green);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
header h1{font-size:18px;margin:0}header a{color:#fff;opacity:.9;margin-left:14px}
main{max-width:1150px;margin:0 auto;padding:20px 16px 60px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.stat b{display:block;font-size:24px}.stat span{color:var(--muted)}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:20px;overflow-x:auto}
h2{font-size:16px;margin:0 0 12px}table{border-collapse:collapse;width:100%;min-width:720px}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.03em}
.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px}.active{background:var(--green-soft);color:var(--green)}.pending{background:var(--amber-soft);color:var(--amber)}.rejected{background:var(--red-soft);color:var(--red)}
button{font:inherit;border:0;border-radius:6px;padding:5px 10px;cursor:pointer}.ok{background:var(--green);color:#fff}.no{background:var(--red-soft);color:var(--red)}.plain{background:var(--line)}
form{display:inline}code{font-size:13px}.muted{color:var(--muted)}input[type=search]{padding:6px 10px;border:1px solid var(--line);border-radius:6px;width:260px;max-width:100%;margin-bottom:10px}
ul.tree{list-style:none;padding-left:18px;margin:4px 0;border-left:1px dashed var(--line)}ul.tree.root{border:0;padding-left:0}
</style></head><body><header><h1>AgronomiZ · Admin</h1><nav><a href="/admin/export/agents.csv">Unduh agen (CSV)</a><a href="/admin/export/inquiries.csv">Unduh penawaran (CSV)</a></nav></header><main>${body}</main>
<script>const q=document.getElementById('q');q&&q.addEventListener('input',()=>{const v=q.value.toLowerCase();document.querySelectorAll('#all tbody tr').forEach(tr=>tr.style.display=tr.textContent.toLowerCase().includes(v)?'':'none')});</script>
</body></html>`;
}

module.exports = function mountAdmin(app) {
  app.use('/admin', auth);

  app.get('/admin', (_req, res) => {
    const agents = store.listAgents();
    const inquiries = store.listInquiries();
    const token = csrfToken();
    const pending = agents.filter(a => a.status === 'pending');
    const count = (f) => agents.filter(f).length;
    const pill = s => `<span class="pill ${s}">${STATUS[s]}</span>`;
    const who = a => `${esc(a.name)}${a.shop_name ? `<br><span class="muted">${esc(a.shop_name)}</span>` : ''}`;
    const actionForm = (a, status, label, cls) =>
      `<form method="post" action="/admin/agents/${a.id}/status"><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="status" value="${status}"><button class="${cls}">${label}</button></form>`;

    // Network tree (active + pending agents, from top-level down)
    const children = new Map();
    for (const a of agents) if (a.status !== 'rejected') {
      const k = a.referrer_id || 0;
      if (!children.has(k)) children.set(k, []);
      children.get(k).push(a);
    }
    const tree = (pid, cls = 'tree') => {
      const kids = (children.get(pid) || []).slice().sort((x, y) => x.id - y.id);
      if (!kids.length) return '';
      return `<ul class="${cls}">${kids.map(a => `<li>${a.role === 'toko' ? '🏪' : '🌱'} <b>${esc(a.shop_name || a.name)}</b> <code>${esc(a.code)}</code> <span class="muted">${esc(a.city)}</span> ${a.status === 'pending' ? pill('pending') : ''}${tree(a.id)}</li>`).join('')}</ul>`;
    };

    const body = `
<div class="stats">
  <div class="stat"><b>${count(a => a.role === 'agronomis' && a.status === 'active')}</b><span>Agronomis aktif</span></div>
  <div class="stat"><b>${count(a => a.role === 'toko' && a.status === 'active')}</b><span>Toko tani aktif</span></div>
  <div class="stat"><b>${pending.length}</b><span>Menunggu persetujuan</span></div>
  <div class="stat"><b>${inquiries.filter(i => !i.handled).length}</b><span>Penawaran belum ditindaklanjuti</span></div>
</div>

<section><h2>Menunggu persetujuan (${pending.length})</h2>
${pending.length ? `<table><thead><tr><th>Nama</th><th>Peran</th><th>Lokasi</th><th>WhatsApp</th><th>Diajak oleh</th><th>Daftar</th><th></th></tr></thead><tbody>
${pending.map(a => `<tr><td>${who(a)}</td><td>${ROLE[a.role]}</td><td>${esc(a.city)}, ${esc(a.province)}</td><td>+${esc(a.phone)}</td>
<td>${a.referrer_name ? `${esc(a.referrer_name)} <code>${esc(a.referrer_code)}</code>` : '<span class="muted">-</span>'}</td><td>${fmtTime(a.created_at)}</td>
<td>${actionForm(a, 'active', 'Setujui', 'ok')} ${actionForm(a, 'rejected', 'Tolak', 'no')}</td></tr>`).join('')}
</tbody></table>` : '<p class="muted">Tidak ada pendaftaran yang menunggu.</p>'}</section>

<section><h2>Permintaan penawaran</h2>
${inquiries.length ? `<table><thead><tr><th>Waktu</th><th>Produk</th><th>Dari</th><th>WhatsApp</th><th>Status</th></tr></thead><tbody>
${inquiries.map(i => `<tr><td>${fmtTime(i.created_at)}</td><td>${esc(getProduct(i.product_key)?.name || i.product_key)}</td>
<td>${i.agent_name ? `${esc(i.agent_name)} <code>${esc(i.agent_code)}</code>` : esc(i.profile_name || '-')}</td><td><a href="https://wa.me/${esc(i.phone)}" target="_blank" rel="noopener">+${esc(i.phone)}</a></td>
<td>${i.handled ? '<span class="pill active">Sudah</span>' : `<form method="post" action="/admin/inquiries/${i.id}/handled"><input type="hidden" name="csrf" value="${token}"><button class="plain">Tandai selesai</button></form>`}</td></tr>`).join('')}
</tbody></table>` : '<p class="muted">Belum ada permintaan penawaran.</p>'}</section>

<section><h2>Jaringan</h2>${tree(0, 'tree root') || '<p class="muted">Belum ada agen.</p>'}</section>

<section><h2>Semua agen (${agents.length})</h2><input type="search" id="q" placeholder="Cari nama, kode, kota…">
<table id="all"><thead><tr><th>Nama</th><th>Peran</th><th>Kode</th><th>Status</th><th>Lokasi</th><th>WhatsApp</th><th>Upline</th><th>Rekrutan</th><th>Daftar</th><th></th></tr></thead><tbody>
${agents.map(a => `<tr><td>${who(a)}</td><td>${ROLE[a.role]}</td><td><code>${esc(a.code)}</code></td><td>${pill(a.status)}</td><td>${esc(a.city)}, ${esc(a.province)}</td>
<td>+${esc(a.phone)}</td><td>${a.referrer_code ? `<code>${esc(a.referrer_code)}</code>` : '<span class="muted">-</span>'}</td>
<td>${a.role === 'agronomis' ? `${a.agronomist_recruits}/${config.maxDirectRecruits} agr · ${a.shop_recruits} toko` : '-'}</td><td>${fmtTime(a.created_at)}</td>
<td>${a.status === 'active' ? actionForm(a, 'rejected', 'Nonaktifkan', 'no') : a.status === 'rejected' ? actionForm(a, 'active', 'Aktifkan', 'ok') : ''}</td></tr>`).join('')}
</tbody></table></section>`;
    res.send(page(body));
  });

  app.post('/admin/agents/:id/status', checkCsrf, async (req, res) => {
    const status = req.body.status;
    const id = parseInt(req.params.id, 10);
    if (!['active', 'rejected'].includes(status) || !store.getAgentById(id)) return res.sendStatus(400);
    const agent = store.setAgentStatus(id, status);
    await notifyStatusChange(agent);
    res.redirect(303, '/admin');
  });

  app.post('/admin/inquiries/:id/handled', checkCsrf, (req, res) => {
    store.markInquiryHandled(parseInt(req.params.id, 10));
    res.redirect(303, '/admin');
  });

  app.get('/admin/export/agents.csv', (_req, res) => {
    const out = csv(store.listAgents(), [
      ['Kode', a => a.code], ['Nama', a => a.name], ['Nama toko', a => a.shop_name], ['Peran', a => ROLE[a.role]],
      ['Status', a => STATUS[a.status]], ['Provinsi', a => a.province], ['Kab/Kota', a => a.city], ['WhatsApp', a => '+' + a.phone],
      ['Kode upline', a => a.referrer_code], ['Nama upline', a => a.referrer_name], ['Rekrutan agronomis', a => a.agronomist_recruits],
      ['Rekrutan toko', a => a.shop_recruits], ['Tanggal daftar', a => fmtTime(a.created_at)], ['Tanggal disetujui', a => fmtTime(a.approved_at)],
    ]);
    res.type('text/csv').attachment('agen-agronomiz.csv').send(out);
  });

  app.get('/admin/export/inquiries.csv', (_req, res) => {
    const out = csv(store.listInquiries(), [
      ['Waktu', i => fmtTime(i.created_at)], ['Produk', i => getProduct(i.product_key)?.name || i.product_key],
      ['Nama agen', i => i.agent_name], ['Kode agen', i => i.agent_code], ['Nama WhatsApp', i => i.profile_name],
      ['WhatsApp', i => '+' + i.phone], ['Sudah ditindaklanjuti', i => (i.handled ? 'Ya' : 'Belum')],
    ]);
    res.type('text/csv').attachment('penawaran-agronomiz.csv').send(out);
  });
};
