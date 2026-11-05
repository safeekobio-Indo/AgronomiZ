// SQLite storage: agents, chat sessions, product inquiries.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const config = require('./config');

if (config.dbPath !== ':memory:') fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS agents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  phone        TEXT NOT NULL UNIQUE,
  role         TEXT NOT NULL CHECK (role IN ('agronomis','toko')),
  name         TEXT NOT NULL,
  shop_name    TEXT,
  province     TEXT NOT NULL,
  city         TEXT NOT NULL,
  code         TEXT NOT NULL UNIQUE,
  referrer_id  INTEGER REFERENCES agents(id),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_agents_referrer ON agents(referrer_id);

CREATE TABLE IF NOT EXISTS sessions (
  phone       TEXT PRIMARY KEY,
  state       TEXT NOT NULL DEFAULT 'idle',
  data        TEXT NOT NULL DEFAULT '{}',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inquiries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  phone        TEXT NOT NULL,
  profile_name TEXT,
  agent_id     INTEGER REFERENCES agents(id),
  product_key  TEXT NOT NULL,
  handled      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS processed_messages (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---------- sessions ----------
function getSession(phone) {
  const row = db.prepare('SELECT * FROM sessions WHERE phone = ?').get(phone);
  if (!row) return { phone, state: 'idle', data: {}, updatedAt: null };
  return { phone, state: row.state, data: JSON.parse(row.data || '{}'), updatedAt: row.updated_at };
}
function saveSession(phone, state, data = {}) {
  db.prepare(`INSERT INTO sessions (phone, state, data, updated_at) VALUES (?, ?, ?, datetime('now'))
              ON CONFLICT(phone) DO UPDATE SET state = excluded.state, data = excluded.data, updated_at = excluded.updated_at`)
    .run(phone, state, JSON.stringify(data));
}

// ---------- message de-duplication (Meta retries webhooks) ----------
function markProcessed(messageId) {
  if (!messageId) return true;
  const r = db.prepare('INSERT OR IGNORE INTO processed_messages (id) VALUES (?)').run(messageId);
  return r.changes === 1; // false → already handled
}

// ---------- agents ----------
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
function newCode(role) {
  const prefix = role === 'toko' ? 'TKO' : 'AGZ';
  for (;;) {
    let s = '';
    const bytes = crypto.randomBytes(5);
    for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
    const code = `${prefix}-${s}`;
    if (!db.prepare('SELECT 1 FROM agents WHERE code = ?').get(code)) return code;
  }
}

const getAgentByPhone = phone => db.prepare('SELECT * FROM agents WHERE phone = ?').get(phone);
const getAgentById = id => db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
const getAgentByCode = code => db.prepare('SELECT * FROM agents WHERE code = ?').get(String(code).toUpperCase());

function countDirectAgronomists(agentId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM agents
                     WHERE referrer_id = ? AND role = 'agronomis' AND status != 'rejected'`).get(agentId).n;
}
function listRecruits(agentId) {
  return db.prepare(`SELECT * FROM agents WHERE referrer_id = ? AND status != 'rejected' ORDER BY created_at`).all(agentId);
}

/**
 * Creates an agent inside a transaction so the recruit limit can't be exceeded
 * by two people registering at the same moment. Returns { agent } or { error }.
 */
const createAgent = db.transaction(({ phone, role, name, shopName, province, city, referrerId }, opts) => {
  if (getAgentByPhone(phone)) return { error: 'already_registered' };
  if (referrerId) {
    const ref = getAgentById(referrerId);
    if (!ref || ref.status !== 'active' || ref.role !== 'agronomis') return { error: 'invalid_referrer' };
    if (role === 'agronomis' && countDirectAgronomists(referrerId) >= opts.maxDirectRecruits) return { error: 'referrer_full' };
  }
  const status = opts.requireApproval ? 'pending' : 'active';
  const code = newCode(role);
  const info = db.prepare(`INSERT INTO agents (phone, role, name, shop_name, province, city, code, referrer_id, status, approved_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'active' THEN datetime('now') END)`)
    .run(phone, role, name, shopName || null, province, city, code, referrerId || null, status, status);
  return { agent: getAgentById(info.lastInsertRowid) };
});

function setAgentStatus(id, status) {
  db.prepare(`UPDATE agents SET status = ?, approved_at = CASE WHEN ? = 'active' THEN datetime('now') ELSE approved_at END WHERE id = ?`)
    .run(status, status, id);
  return getAgentById(id);
}

function listAgents() {
  return db.prepare(`
    SELECT a.*, r.name AS referrer_name, r.code AS referrer_code,
      (SELECT COUNT(*) FROM agents c WHERE c.referrer_id = a.id AND c.role = 'agronomis' AND c.status != 'rejected') AS agronomist_recruits,
      (SELECT COUNT(*) FROM agents c WHERE c.referrer_id = a.id AND c.role = 'toko' AND c.status != 'rejected') AS shop_recruits
    FROM agents a LEFT JOIN agents r ON r.id = a.referrer_id
    ORDER BY a.created_at DESC, a.id DESC`).all();
}

// ---------- inquiries ----------
function addInquiry({ phone, profileName, agentId, productKey }) {
  db.prepare('INSERT INTO inquiries (phone, profile_name, agent_id, product_key) VALUES (?, ?, ?, ?)')
    .run(phone, profileName || null, agentId || null, productKey);
}
function listInquiries() {
  return db.prepare(`SELECT i.*, a.name AS agent_name, a.code AS agent_code FROM inquiries i
                     LEFT JOIN agents a ON a.id = i.agent_id ORDER BY i.created_at DESC, i.id DESC`).all();
}
const markInquiryHandled = id => db.prepare('UPDATE inquiries SET handled = 1 WHERE id = ?').run(id);

module.exports = {
  db, getSession, saveSession, markProcessed,
  getAgentByPhone, getAgentById, getAgentByCode, countDirectAgronomists, listRecruits,
  createAgent, setAgentStatus, listAgents,
  addInquiry, listInquiries, markInquiryHandled,
};
