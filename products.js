// Product catalogue shown in the bot. Edit text here to update what agents see.
// WhatsApp limits: list row title ≤ 24 characters, row description ≤ 72.
//
// Before going live: check every claim below against the registration
// certificate and label. Only registered uses should be promoted.

const products = [
  {
    key: 'ekoriza',
    name: 'EkoRiza',
    category: 'Pupuk hayati',
    short: 'Tablet mikoriza – hemat NPK 25%',
    detail: [
      '*EkoRiza* – Pupuk Hayati Mikoriza (tablet)',
      '',
      '*Kandungan:* mikoriza 1,1 × 10⁵ CFU/g, tablet 3,4 g. Tingkat infeksi akar jagung 70%.',
      '*No. pendaftaran:* 03.04.2026.44 (terbit 4 Feb 2026, berlaku 5 tahun)',
      '',
      '*Dosis uji:* 85 g/ha (25 tablet/ha), aplikasi pada 1 dan 5 minggu setelah tanam (MST).',
      '',
      '*Hasil uji lapang – Universitas Udayana*',
      'Jagung manis, Karangasem, Bali (Sep–Des 2025):',
      '• ¾ dosis NPK + EkoRiza: *16,28 t/ha*',
      '• NPK dosis penuh: 14,41 t/ha',
      '• Kontrol: 10,32 t/ha',
      '➜ Hasil naik ±13% walaupun NPK dikurangi 25%.',
    ].join('\n'),
  },
  {
    key: 'saipower',
    name: 'SaiPower Plus',
    category: 'Pupuk organik cair',
    short: 'Pupuk organik cair + unsur mikro',
    detail: [
      '*SaiPower Plus* – Pupuk Organik Cair',
      '',
      '*Kandungan:* C-organik 10,21%, N 2,06%, K₂O 1,65%, ditambah unsur mikro Fe, Cu, Zn, B.',
      '',
      '*Dosis uji:* 1 L/ha (2 ml per liter air), aplikasi pada 0, 2 dan 5 MST.',
      '',
      '*Hasil uji lapang – Universitas Udayana*',
      'Bawang merah, Denpasar (Mar–Jun 2026), umbi kering:',
      '• ¾ dosis NPK + SaiPower Plus: *8,53 t/ha*',
      '• NPK dosis penuh: 7,56 t/ha',
      '• NPK penuh + SaiPower Plus: 9,02 t/ha',
      '➜ Hasil naik ±12,8% walaupun NPK dikurangi 25%.',
    ].join('\n'),
  },
  {
    key: 'pakteri',
    name: 'Pak-Teri',
    category: 'Pupuk hayati',
    short: 'Bakteri penambat N, pelarut P + Trichoderma',
    detail: [
      '*Pak-Teri* – Pupuk Hayati',
      '',
      '*Kandungan:*',
      '• Bakteri penambat N 1,72 × 10¹¹ CFU/g',
      '• Bakteri pelarut P 3,02 × 10⁸ CFU/g',
      '• Trichoderma 2 × 10⁸ CFU/g',
      '',
      '*Dosis uji:* 1,5 kg/ha (3 g per liter air), aplikasi pada 0, 2 dan 5 MST.',
      '',
      '*Hasil uji lapang – Universitas Udayana*',
      'Bawang merah, Karangasem, Bali (Mei–Agu 2026):',
      '• ¾ dosis NPK + Pak-Teri: *9,22 t/ha*',
      '• NPK dosis penuh: 7,16 t/ha',
      '➜ Hasil naik ±28,8% walaupun NPK dikurangi 25%.',
    ].join('\n'),
  },
  {
    key: 'aniso',
    name: 'Aniso SC',
    category: 'Insektisida hayati',
    short: 'Pengendali kumbang tanduk kelapa sawit',
    detail: [
      '*Aniso SC* – Insektisida Hayati',
      '',
      '*Bahan aktif:* Metarhizium anisopliae + Beauveria bassiana, masing-masing 1 × 10⁸ cfu/ml.',
      '*No. pendaftaran:* RI.01010120269705 (berlaku s.d. 20 Okt 2031)',
      '',
      '*Sasaran terdaftar:* kumbang tanduk (Oryctes rhinoceros) pada kelapa sawit.',
      '*Cara pakai:* 12,5 ml/L, disiramkan di pangkal batang, per pohon.',
      '',
      '*Hasil uji lapang – Universitas Padjadjaran (Garut):* efikasi hingga *82%*.',
    ].join('\n'),
  },
  {
    key: 'ekobs',
    name: 'Eko-BS SC',
    category: 'Fungisida hayati',
    short: 'Pengendali Ganoderma pada bibit sawit',
    detail: [
      '*Eko-BS SC* – Fungisida Hayati',
      '',
      '*Bahan aktif:* Bacillus subtilis + Trichoderma harzianum, masing-masing 1 × 10⁸ cfu/ml.',
      '*No. pendaftaran:* RI.01020120269751 (berlaku s.d. 2031)',
      '',
      '*Sasaran terdaftar:* penyakit busuk pangkal batang (Ganoderma boninense) pada bibit kelapa sawit.',
      '*Cara pakai:* siram ke tanah 12,5 ml per pohon.',
      '',
      '*Hasil uji lapang – Universitas Padjadjaran:* efikasi *61,95%*.',
    ].join('\n'),
  },
];

const byKey = Object.fromEntries(products.map(p => [p.key, p]));

module.exports = { products, getProduct: key => byKey[key] };
