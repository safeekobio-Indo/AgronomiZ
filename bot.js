// Conversation logic (Bahasa Indonesia): main menu, agent registration with referral, product info.
const config = require('./config');
const store = require('./db');
const wa = require('./whatsapp');
const { products, getProduct } = require('./products');

const ROLE_LABEL = { agronomis: 'Agronomis', toko: 'Toko Tani' };
const STATUS_LABEL = { pending: '⏳ Menunggu persetujuan', active: '✅ Aktif', rejected: '❌ Ditolak' };
const STALE_MS = 24 * 60 * 60 * 1000;

// ---------- helpers ----------
function readInput(message) {
  if (!message) return { unsupported: true };
  if (message.type === 'text') return { text: (message.text?.body || '').trim() };
  if (message.type === 'interactive') {
    const r = message.interactive?.button_reply || message.interactive?.list_reply;
    if (r) return { id: r.id, text: r.title };
  }
  if (message.type === 'button') return { text: (message.button?.text || '').trim() }; // template quick reply
  return { unsupported: true };
}

function normalizeCode(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = s.match(/^(AGZ|TKO)([A-Z0-9]{5})$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

function shareLink(code) {
  return config.botNumber
    ? `https://wa.me/${config.botNumber}?text=${encodeURIComponent('DAFTAR ' + code)}`
    : null;
}

function isStale(session) {
  if (!session.updatedAt) return false;
  const t = Date.parse(session.updatedAt.replace(' ', 'T') + 'Z');
  return Number.isFinite(t) && Date.now() - t > STALE_MS;
}

const text = t => ({ type: 'text', text: t });
const buttons = (body, btns) => ({ type: 'buttons', body, buttons: btns });

// ---------- screens ----------
function mainMenu(agent, intro = 'Silakan pilih menu di bawah ini 👇') {
  const rows = [];
  if (!agent) rows.push({ id: 'menu:daftar', title: 'Daftar jadi agen', description: 'Untuk agronomis dan toko tani' });
  rows.push({ id: 'menu:produk', title: 'Info produk', description: 'Kandungan, dosis dan hasil uji lapang' });
  if (agent) rows.push({ id: 'menu:profil', title: 'Profil & kode saya', description: 'Status pendaftaran dan kode referal' });
  if (agent?.role === 'agronomis') rows.push({ id: 'menu:jaringan', title: 'Jaringan saya', description: 'Agronomis & toko yang Anda rekrut' });
  rows.push({ id: 'menu:kontak', title: 'Hubungi tim Safeeko', description: 'Nomor dan email tim kami' });
  return { type: 'list', body: intro, button: 'Lihat menu', sections: [{ title: 'Menu AgronomiZ', rows }] };
}

function productList() {
  return {
    type: 'list',
    body: 'Produk unggulan PT Safeeko Bio Indonesia. Pilih produk untuk melihat kandungan, dosis dan hasil uji lapangnya.',
    button: 'Pilih produk',
    sections: [{
      title: 'Produk unggulan',
      rows: products.map(p => ({ id: `prod:${p.key}`, title: p.name, description: `${p.category} · ${p.short}` })),
    }],
  };
}

function productActions(p) {
  return buttons(`Ingin tahu harga atau stok *${p.name}*?`, [
    { id: `quote:${p.key}`, title: 'Minta penawaran' },
    { id: 'menu:produk', title: 'Produk lain' },
    { id: 'nav:menu', title: 'Menu utama' },
  ]);
}

function profileText(agent) {
  const lines = [
    '*Profil Anda*',
    `Nama: ${agent.name}`,
    `Peran: ${ROLE_LABEL[agent.role]}`,
  ];
  if (agent.shop_name) lines.push(`Toko: ${agent.shop_name}`);
  lines.push(`Lokasi: ${agent.city}, ${agent.province}`);
  lines.push(`Kode: *${agent.code}*`);
  lines.push(`Status: ${STATUS_LABEL[agent.status]}`);
  const up = agent.referrer_id && store.getAgentById(agent.referrer_id);
  lines.push(`Upline: ${up ? `${up.name} (${up.code})` : '-'}`);

  if (agent.role === 'agronomis' && agent.status === 'active') {
    const used = store.countDirectAgronomists(agent.id);
    const left = Math.max(0, config.maxDirectRecruits - used);
    lines.push('', `Kuota rekrut agronomis: ${used} dari ${config.maxDirectRecruits} terpakai (sisa ${left}). Toko tani bisa Anda rekrut tanpa batas.`);
    const link = shareLink(agent.code);
    lines.push('', link
      ? `Bagikan tautan ini untuk mengajak agronomis atau toko tani bergabung:\n${link}`
      : `Ajak agronomis atau toko tani bergabung: minta mereka mengirim *DAFTAR ${agent.code}* ke nomor WhatsApp ini.`);
  } else if (agent.status === 'pending') {
    lines.push('', 'Pendaftaran Anda sedang ditinjau tim Safeeko. Kami akan mengabari Anda di sini.');
  } else if (agent.status === 'rejected') {
    lines.push('', `Silakan hubungi ${config.contactName} di ${config.contactPhone} untuk informasi lebih lanjut.`);
  }
  return lines.join('\n');
}

function networkText(agent) {
  const recruits = store.listRecruits(agent.id);
  if (!recruits.length) {
    return `Anda belum punya rekrutan.\n\nAjak agronomis atau toko tani dengan kode *${agent.code}*. Lihat "Profil & kode saya" untuk tautan undangan.`;
  }
  const agr = recruits.filter(r => r.role === 'agronomis');
  const shops = recruits.filter(r => r.role === 'toko');
  const line = r => `• ${r.shop_name ? `${r.shop_name} (${r.name})` : r.name} – ${r.city} – ${STATUS_LABEL[r.status]}`;
  const out = [`*Jaringan Anda*`, '', `*Agronomis (${agr.length}/${config.maxDirectRecruits})*`];
  out.push(...(agr.length ? agr.map(line) : ['• belum ada']));
  out.push('', `*Toko tani (${shops.length})*`);
  out.push(...(shops.length ? shops.map(line) : ['• belum ada']));
  return out.join('\n');
}

function contactText() {
  return [
    `*${config.contactName}*`,
    `📞 WhatsApp/Telepon: ${config.contactPhone}`,
    `✉️ Email: ${config.contactEmail}`,
    '',
    'Kantor: My Republic Plaza Wing A, Green Office Park, BSD City, Tangerang, Banten 15345',
  ].join('\n');
}

// ---------- registration steps ----------
function askRole() {
  return buttons('*Pendaftaran Agen AgronomiZ*\n\nAnda mendaftar sebagai apa?\n(Ketik *batal* kapan saja untuk berhenti.)', [
    { id: 'reg:role:agronomis', title: 'Agronomis' },
    { id: 'reg:role:toko', title: 'Toko Tani' },
  ]);
}

function askReferral(data, prefix = '') {
  const body = `${prefix}Jika Anda diajak oleh agronomis AgronomiZ, ketik *kode referal* mereka (contoh: AGZ-7K2MP).`;
  if (config.requireReferral) return text(body + '\n\nKode referal wajib diisi.');
  return buttons(body + '\n\nTidak punya kode? Tekan tombol di bawah.', [{ id: 'reg:ref:skip', title: 'Tidak punya kode' }]);
}

/** Validates a referral code for the role being registered. Returns { referrer } or { error }. */
function checkReferral(code, role) {
  const norm = normalizeCode(code);
  if (!norm) return { error: 'Format kode tidak dikenali. Kode referal berbentuk *AGZ-XXXXX*.' };
  const ref = store.getAgentByCode(norm);
  if (!ref) return { error: `Kode *${norm}* tidak ditemukan. Mohon cek kembali.` };
  if (ref.role !== 'agronomis') return { error: 'Kode toko tidak bisa dipakai untuk mendaftar. Mintalah kode dari agronomis (AGZ-XXXXX).' };
  if (ref.status !== 'active') return { error: `Kode *${norm}* belum aktif. Mintalah kode dari agronomis lain atau lewati langkah ini.` };
  if (role === 'agronomis' && store.countDirectAgronomists(ref.id) >= config.maxDirectRecruits) {
    return { error: `${ref.name} sudah merekrut ${config.maxDirectRecruits} agronomis (batas maksimal). Mintalah kode dari agronomis lain di jaringannya.` };
  }
  return { referrer: ref };
}

function confirmScreen(data) {
  const ref = data.referrerId && store.getAgentById(data.referrerId);
  const lines = [
    '*Mohon periksa data Anda:*',
    '',
    `Peran: ${ROLE_LABEL[data.role]}`,
    `Nama: ${data.name}`,
  ];
  if (data.role === 'toko') lines.push(`Nama toko: ${data.shopName}`);
  lines.push(`Lokasi: ${data.city}, ${data.province}`);
  lines.push(`Diajak oleh: ${ref ? `${ref.name} (${ref.code})` : '-'}`);
  lines.push('', 'Apakah data ini sudah benar?');
  return buttons(lines.join('\n'), [
    { id: 'reg:confirm:yes', title: 'Ya, daftar' },
    { id: 'reg:confirm:edit', title: 'Ubah data' },
    { id: 'reg:confirm:cancel', title: 'Batal' },
  ]);
}

const validName = s => s.length >= 3 && s.length <= 60 && /\p{L}/u.test(s);
const validPlace = s => s.length >= 3 && s.length <= 50 && /\p{L}/u.test(s);

// ---------- main handler ----------
/**
 * Handles one incoming WhatsApp message.
 * @param {{from: string, profileName?: string, message: object}} evt
 */
async function handleIncoming({ from, profileName, message }) {
  const phone = String(from);
  const reply = msg => wa.send(phone, msg);
  const input = readInput(message);
  let session = store.getSession(phone);
  const firstContact = !session.updatedAt;
  let agent = store.getAgentByPhone(phone);

  if (session.state !== 'idle' && isStale(session)) {
    store.saveSession(phone, 'idle');
    session = { ...session, state: 'idle', data: {} };
  }

  const goMenu = async intro => {
    store.saveSession(phone, 'idle');
    await reply(mainMenu(store.getAgentByPhone(phone), intro));
  };

  if (input.unsupported) {
    await reply(text('Maaf, untuk saat ini saya hanya bisa membaca pesan teks dan pilihan menu.'));
    return goMenu();
  }

  const lower = (input.text || '').toLowerCase();

  // ----- global commands -----
  if (!input.id && ['batal', 'stop', 'keluar'].includes(lower)) {
    const wasRegistering = session.state.startsWith('reg_');
    return goMenu(wasRegistering ? 'Pendaftaran dibatalkan. Silakan pilih menu lain 👇' : undefined);
  }
  if (!input.id && ['menu', 'kembali', 'mulai', 'start'].includes(lower)) return goMenu();

  const daftar = !input.id && lower.match(/^daftar\b\s*(.*)$/);
  if (daftar) return startRegistration(normalizeCode(daftar[1]));

  // ----- menu & product buttons work from anywhere -----
  if (input.id) {
    const [kind, arg] = input.id.split(':');
    if (kind === 'nav') return goMenu();
    if (kind === 'menu') return handleMenu(arg);
    if (kind === 'prod') return showProduct(arg);
    if (kind === 'quote') return handleQuote(arg);
  }

  // ----- registration steps -----
  if (session.state.startsWith('reg_')) return handleRegistration();

  // ----- idle: greeting / fallback -----
  if (input.id) return goMenu('Tombol ini sudah tidak berlaku. Silakan pilih dari menu terbaru 👇');
  if (/\bproduk\b/.test(lower)) return reply(productList());
  if (firstContact || /^(halo|hallo|hai|hi|hello|p|pagi|siang|sore|malam|selamat)\b|^assalam/.test(lower)) {
    const name = profileName ? ` ${profileName}` : '';
    return goMenu(`Halo${name}! 👋 Selamat datang di *AgronomiZ* – jaringan agen produk hayati PT Safeeko Bio Indonesia.\n\nDi sini Anda bisa mendaftar sebagai agen dan mendapatkan info lengkap produk kami. Silakan pilih menu 👇`);
  }
  return goMenu('Maaf, saya belum mengerti pesan Anda. Silakan pilih dari menu di bawah ini 👇');

  // ===== handlers (hoisted) =====
  async function handleMenu(item) {
    store.saveSession(phone, 'idle');
    agent = store.getAgentByPhone(phone);
    switch (item) {
      case 'daftar':
        return startRegistration(null);
      case 'produk':
        return reply(productList());
      case 'profil':
        if (!agent) return goMenu('Anda belum terdaftar sebagai agen. Pilih *Daftar jadi agen* untuk mulai 👇');
        await reply(text(profileText(agent)));
        return reply(mainMenu(agent, 'Ada lagi yang bisa kami bantu?'));
      case 'jaringan':
        if (agent?.role !== 'agronomis') return goMenu('Menu jaringan hanya untuk agronomis terdaftar.');
        await reply(text(networkText(agent)));
        return reply(mainMenu(agent, 'Ada lagi yang bisa kami bantu?'));
      case 'kontak':
        await reply(text(contactText()));
        return reply(mainMenu(agent, 'Ada lagi yang bisa kami bantu?'));
      default:
        return goMenu();
    }
  }

  async function showProduct(key) {
    const p = getProduct(key);
    if (!p) return reply(productList());
    store.saveSession(phone, 'idle');
    await reply(text(p.detail));
    return reply(productActions(p));
  }

  async function handleQuote(key) {
    const p = getProduct(key);
    if (!p) return reply(productList());
    store.saveSession(phone, 'idle');
    agent = store.getAgentByPhone(phone);
    store.addInquiry({ phone, profileName, agentId: agent?.id, productKey: key });
    for (const admin of config.adminWhatsapp) {
      await wa.sendBestEffort(admin, text(
        `🔔 Permintaan penawaran *${p.name}*\nDari: ${agent ? `${agent.name} (${agent.code})` : profileName || '-'}\nWhatsApp: +${phone}`));
    }
    await reply(text(`Terima kasih! Permintaan penawaran *${p.name}* sudah kami catat. Tim kami akan menghubungi Anda di nomor ini dalam 1×24 jam kerja.`));
    return reply(buttons('Ada lagi yang ingin Anda lihat?', [
      { id: 'menu:produk', title: 'Produk lain' },
      { id: 'nav:menu', title: 'Menu utama' },
    ]));
  }

  async function startRegistration(prefillCode) {
    agent = store.getAgentByPhone(phone);
    if (agent) {
      await reply(text('Nomor ini sudah terdaftar.\n\n' + profileText(agent)));
      return reply(mainMenu(agent, 'Ada lagi yang bisa kami bantu?'));
    }
    store.saveSession(phone, 'reg_role', { prefillCode });
    return reply(askRole());
  }

  async function handleRegistration() {
    const data = session.data;
    const t = input.text || '';
    const next = (state, msg) => { store.saveSession(phone, state, data); return reply(msg); };

    switch (session.state) {
      case 'reg_role': {
        const role = input.id?.startsWith('reg:role:') ? input.id.split(':')[2]
          : /agronom/i.test(t) ? 'agronomis' : /toko/i.test(t) ? 'toko' : null;
        if (!ROLE_LABEL[role]) return reply(askRole());
        data.role = role;
        return next('reg_name', text('Siapa *nama lengkap* Anda?'));
      }
      case 'reg_name': {
        if (input.id || !validName(t)) return reply(text('Mohon ketik nama lengkap Anda (3–60 huruf).'));
        data.name = t.replace(/\s+/g, ' ');
        if (data.role === 'toko') return next('reg_shop', text('Apa *nama toko* Anda?'));
        return next('reg_province', text('Di *provinsi* mana Anda bekerja? (contoh: Jawa Timur)'));
      }
      case 'reg_shop': {
        if (input.id || !validName(t)) return reply(text('Mohon ketik nama toko Anda (3–60 huruf).'));
        data.shopName = t.replace(/\s+/g, ' ');
        return next('reg_province', text('Di *provinsi* mana toko Anda berada? (contoh: Jawa Timur)'));
      }
      case 'reg_province': {
        if (input.id || !validPlace(t)) return reply(text('Mohon ketik nama provinsi (contoh: Sumatera Utara).'));
        data.province = t.replace(/\s+/g, ' ');
        return next('reg_city', text('*Kabupaten/kota* apa? (contoh: Kab. Malang)'));
      }
      case 'reg_city': {
        if (input.id || !validPlace(t)) return reply(text('Mohon ketik nama kabupaten/kota (contoh: Kab. Malang).'));
        data.city = t.replace(/\s+/g, ' ');
        if (data.prefillCode) {
          const res = checkReferral(data.prefillCode, data.role);
          delete data.prefillCode;
          if (res.referrer) {
            data.referrerId = res.referrer.id;
            return next('reg_confirm', confirmScreen(data));
          }
          return next('reg_referral', askReferral(data, `⚠️ ${res.error}\n\n`));
        }
        return next('reg_referral', askReferral(data));
      }
      case 'reg_referral': {
        const skip = input.id === 'reg:ref:skip' || ['tidak', 'tidak ada', 'lewati', '-', 'skip'].includes(t.toLowerCase());
        if (skip) {
          if (config.requireReferral) return reply(askReferral(data, 'Kode referal wajib diisi.\n\n'));
          data.referrerId = null;
          return next('reg_confirm', confirmScreen(data));
        }
        const res = checkReferral(t, data.role);
        if (res.error) return reply(askReferral(data, `⚠️ ${res.error}\n\n`));
        data.referrerId = res.referrer.id;
        return next('reg_confirm', confirmScreen(data));
      }
      case 'reg_confirm': {
        const choice = input.id || (/^(ya|y|benar|ok)/i.test(t) ? 'reg:confirm:yes' : null);
        if (choice === 'reg:confirm:edit') {
          store.saveSession(phone, 'reg_role', {});
          return reply(askRole());
        }
        if (choice === 'reg:confirm:cancel') return goMenu('Pendaftaran dibatalkan. Silakan pilih menu lain 👇');
        if (choice !== 'reg:confirm:yes') return reply(confirmScreen(data));
        return finishRegistration(data);
      }
      default:
        return goMenu();
    }
  }

  async function finishRegistration(data) {
    const result = store.createAgent({
      phone, role: data.role, name: data.name, shopName: data.shopName,
      province: data.province, city: data.city, referrerId: data.referrerId,
    }, { maxDirectRecruits: config.maxDirectRecruits, requireApproval: config.requireApproval });

    if (result.error === 'already_registered') return startRegistration(null);
    if (result.error) {
      // Upline filled up or was deactivated while this person was registering.
      data.referrerId = null;
      store.saveSession(phone, 'reg_referral', data);
      return reply(askReferral(data, '⚠️ Kode referal tersebut sudah tidak bisa dipakai (kuota penuh atau tidak aktif). Mohon masukkan kode lain.\n\n'));
    }

    const a = result.agent;
    store.saveSession(phone, 'idle');
    if (a.status === 'pending') {
      await reply(text(`Terima kasih, ${a.name}! 🙏\n\nPendaftaran Anda sebagai *${ROLE_LABEL[a.role]}* sudah kami terima dan sedang ditinjau tim Safeeko.\n\nKode Anda: *${a.code}*\n\nKami akan mengabari Anda melalui WhatsApp ini setelah disetujui.`));
    } else {
      await reply(text(welcomeActiveText(a)));
    }

    // Tell the upline and the admins (best effort – see README about the 24-hour window).
    if (a.referrer_id) {
      const up = store.getAgentById(a.referrer_id);
      const quota = a.role === 'agronomis' ? `\nKuota rekrut agronomis: ${store.countDirectAgronomists(up.id)}/${config.maxDirectRecruits}` : '';
      await wa.sendBestEffort(up.phone, text(`🎉 ${a.shop_name || a.name} (${ROLE_LABEL[a.role]}, ${a.city}) baru saja mendaftar memakai kode Anda.${quota}`));
    }
    for (const admin of config.adminWhatsapp) {
      await wa.sendBestEffort(admin, text(`🆕 Pendaftaran baru: ${a.name} – ${ROLE_LABEL[a.role]} – ${a.city}, ${a.province} – ${a.code}. Status: ${STATUS_LABEL[a.status]}`));
    }
    return reply(mainMenu(a, 'Ada lagi yang bisa kami bantu?'));
  }
}

function welcomeActiveText(a) {
  const lines = [`Selamat bergabung di AgronomiZ, ${a.name}! 🎉`, '', `Kode Anda: *${a.code}*`];
  if (a.role === 'agronomis') {
    const link = shareLink(a.code);
    lines.push('', `Anda bisa merekrut hingga ${config.maxDirectRecruits} agronomis dan toko tani tanpa batas.`);
    lines.push(link ? `Bagikan tautan ini: ${link}` : `Minta mereka mengirim *DAFTAR ${a.code}* ke nomor ini.`);
  }
  return lines.join('\n');
}

/** Called from the admin page when an agent is approved or rejected. */
async function notifyStatusChange(agent) {
  if (agent.status === 'active') {
    return wa.sendBestEffort(agent.phone, text(`✅ Pendaftaran Anda sudah *disetujui*.\n\n${welcomeActiveText(agent)}\n\nKetik *menu* untuk melihat pilihan.`));
  }
  if (agent.status === 'rejected') {
    return wa.sendBestEffort(agent.phone, text(`Mohon maaf, pendaftaran Anda belum dapat kami setujui. Silakan hubungi ${config.contactName} di ${config.contactPhone} untuk informasi lebih lanjut.`));
  }
}

module.exports = { handleIncoming, notifyStatusChange, normalizeCode, readInput };
