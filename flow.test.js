// End-to-end tests of the conversation, referral limits, webhook and admin page.
process.env.DB_PATH = ':memory:';
process.env.ADMIN_PASSWORD = 'rahasia';
process.env.REQUIRE_APPROVAL = 'true';
process.env.BOT_WHATSAPP_NUMBER = '6281299990000';
process.env.ADMIN_WHATSAPP_NUMBERS = '6281100000000';
process.env.WHATSAPP_APP_SECRET = 'appsecret';
delete process.env.WHATSAPP_TOKEN;

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { handleIncoming, notifyStatusChange } = require('../src/bot');
const wa = require('../src/whatsapp');
const store = require('../src/db');
const app = require('../src/server');

let n = 0;
async function say(phone, input, name = 'Tester') {
  const message = typeof input === 'string'
    ? { id: `t${++n}`, type: 'text', text: { body: input } }
    : { id: `t${++n}`, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: input.id, title: input.id } } };
  await handleIncoming({ from: phone, profileName: name, message });
  return wa.takeOutbox(phone);
}
const allText = msgs => msgs.map(m => m.text || m.body || '').join('\n');
const ids = msgs => msgs.flatMap(m => (m.buttons || []).map(b => b.id).concat((m.sections || []).flatMap(s => s.rows.map(r => r.id))));

async function register(phone, { role, name, shop, province = 'Jawa Timur', city = 'Kab. Malang', code } = {}) {
  await say(phone, code ? `DAFTAR ${code}` : 'daftar');
  await say(phone, { id: `reg:role:${role}` });
  await say(phone, name);
  if (role === 'toko') await say(phone, shop);
  await say(phone, province);
  const afterCity = await say(phone, city);
  let out = afterCity;
  if (!code || !ids(afterCity).includes('reg:confirm:yes')) out = await say(phone, { id: 'reg:ref:skip' });
  const done = await say(phone, { id: 'reg:confirm:yes' });
  return { afterCity, out, done, agent: store.getAgentByPhone(phone) };
}

test('greeting shows main menu with register option', async () => {
  const msgs = await say('6281000000001', 'halo', 'Sari');
  assert.match(allText(msgs), /Halo Sari/);
  assert.ok(ids(msgs).includes('menu:daftar'));
  assert.ok(ids(msgs).includes('menu:produk'));
});

let leader;
test('agronomist registers without referral and is pending until approved', async () => {
  const r = await register('6281000000010', { role: 'agronomis', name: 'Andi Wijaya' });
  assert.equal(r.agent.status, 'pending');
  assert.match(r.agent.code, /^AGZ-[A-Z2-9]{5}$/);
  assert.match(allText(r.done), /sedang ditinjau/);
  assert.match(allText(wa.takeOutbox('6281100000000')), /Pendaftaran baru: Andi Wijaya/);

  leader = store.setAgentStatus(r.agent.id, 'active');
  await notifyStatusChange(leader);
  const note = allText(wa.takeOutbox(leader.phone));
  assert.match(note, /disetujui/);
  assert.match(note, /wa\.me\/6281299990000\?text=DAFTAR%20AGZ-/);
});

test('pending referral code cannot be used; then up to 5 agronomist recruits, 6th refused', async () => {
  for (let i = 1; i <= 5; i++) {
    const r = await register(`62812000000${i}0`, { role: 'agronomis', name: `Agronomis Nomor ${i}`, code: leader.code });
    assert.equal(r.agent.referrer_id, leader.id, `recruit ${i} linked to leader`);
    assert.match(allText(wa.takeOutbox(leader.phone)), new RegExp(`Kuota rekrut agronomis: ${i}/5`));
  }
  assert.equal(store.countDirectAgronomists(leader.id), 5);

  // 6th agronomist with the leader's link is told the quota is full and asked for another code
  const phone = '6281300000001';
  await say(phone, `DAFTAR ${leader.code}`);
  await say(phone, { id: 'reg:role:agronomis' });
  await say(phone, 'Keenam Orang');
  await say(phone, 'Jawa Barat');
  const out = await say(phone, 'Kab. Garut');
  assert.match(allText(out), /sudah merekrut 5 agronomis/);
  assert.ok(ids(out).includes('reg:ref:skip'));

  // a pending agent's code is not accepted
  const pendingRecruit = store.getAgentByPhone('6281200000010');
  const out2 = await say(phone, pendingRecruit.code);
  assert.match(allText(out2), /belum aktif/);
  await say(phone, 'batal');
  assert.equal(store.getAgentByPhone(phone), undefined);
});

test('shops can join under a full agronomist; shop codes cannot recruit', async () => {
  const r = await register('6281400000001', { role: 'toko', name: 'Ibu Rina', shop: 'Toko Tani Makmur', code: leader.code });
  assert.equal(r.agent.role, 'toko');
  assert.equal(r.agent.referrer_id, leader.id);
  assert.match(r.agent.code, /^TKO-/);
  store.setAgentStatus(r.agent.id, 'active');

  const phone = '6281400000002';
  await say(phone, 'daftar');
  await say(phone, { id: 'reg:role:agronomis' });
  await say(phone, 'Pak Joko');
  await say(phone, 'Lampung');
  await say(phone, 'Kab. Lampung Selatan');
  const out = await say(phone, r.agent.code.toLowerCase().replace('-', ' '));
  assert.match(allText(out), /Kode toko tidak bisa dipakai/);
});

test('network and profile screens', async () => {
  const net = allText(await say(leader.phone, { id: 'menu:jaringan' }));
  assert.match(net, /Agronomis \(5\/5\)/);
  assert.match(net, /Toko Tani Makmur/);
  const prof = allText(await say(leader.phone, { id: 'menu:profil' }));
  assert.match(prof, /sisa 0/);
  assert.ok(!ids(await say(leader.phone, 'menu')).includes('menu:daftar'), 'registered users do not see register option');
});

test('product info and quote request', async () => {
  const phone = '6281500000001';
  const list = await say(phone, { id: 'menu:produk' });
  assert.deepEqual(ids(list), ['prod:ekoriza', 'prod:saipower', 'prod:pakteri', 'prod:aniso', 'prod:ekobs']);
  const detail = await say(phone, { id: 'prod:aniso' });
  assert.match(allText(detail), /RI\.01010120269705/);
  assert.ok(ids(detail).includes('quote:aniso'));
  const q = await say(phone, { id: 'quote:aniso' });
  assert.match(allText(q), /sudah kami catat/);
  assert.equal(store.listInquiries()[0].product_key, 'aniso');
  assert.match(allText(wa.takeOutbox('6281100000000')), /Permintaan penawaran \*Aniso SC\*/);
});

test('WhatsApp limits respected in payloads', () => {
  const { products } = require('../src/products');
  for (const p of products) {
    assert.ok(p.name.length <= 24, p.name);
    assert.ok(`${p.category} · ${p.short}`.length <= 72, p.short);
  }
  const pl = wa.toPayload('1', { type: 'buttons', body: 'x', buttons: [{ id: 'a', title: 'x'.repeat(30) }] });
  assert.equal(pl.interactive.action.buttons[0].reply.title.length, 20);
});

test('webhook verification, signature check, duplicate handling; admin auth', async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const v = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=ganti-token-verifikasi&hub.challenge=42`);
    assert.equal(await v.text(), '42');

    const body = JSON.stringify({ entry: [{ changes: [{ value: {
      contacts: [{ wa_id: '6281600000001', profile: { name: 'Dewi' } }],
      messages: [{ id: 'wamid.X1', from: '6281600000001', type: 'text', text: { body: 'halo' } }] } }] }] });
    const sig = 'sha256=' + crypto.createHmac('sha256', 'appsecret').update(body).digest('hex');
    const bad = await fetch(`${base}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=00' }, body });
    assert.equal(bad.status, 401);
    for (let i = 0; i < 2; i++) {
      const ok = await fetch(`${base}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body });
      assert.equal(ok.status, 200);
    }
    await new Promise(r => setTimeout(r, 50));
    const out = wa.takeOutbox('6281600000001');
    assert.equal(out.length, 1, 'duplicate delivery answered once');
    assert.match(allText(out), /Halo Dewi/);

    assert.equal((await fetch(`${base}/admin`)).status, 401);
    const auth = { authorization: 'Basic ' + Buffer.from('admin:rahasia').toString('base64') };
    const page = await fetch(`${base}/admin`, { headers: auth });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Andi Wijaya/);
    const csrf = html.match(/name="csrf" value="([a-f0-9]+)"/)[1];

    const target = store.getAgentByPhone('6281200000010');
    const noToken = await fetch(`${base}/admin/agents/${target.id}/status`, { method: 'POST', redirect: 'manual',
      headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded' }, body: 'status=active' });
    assert.equal(noToken.status, 403);
    const approve = await fetch(`${base}/admin/agents/${target.id}/status`, { method: 'POST', redirect: 'manual',
      headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded' }, body: `status=active&csrf=${csrf}` });
    assert.equal(approve.status, 303);
    assert.equal(store.getAgentById(target.id).status, 'active');
    assert.match(allText(wa.takeOutbox(target.phone)), /disetujui/);

    const csvRes = await fetch(`${base}/admin/export/agents.csv`, { headers: auth });
    assert.match(await csvRes.text(), /Toko Tani Makmur/);
  } finally {
    server.close();
  }
});
