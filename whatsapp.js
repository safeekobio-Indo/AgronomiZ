// Sending messages through the WhatsApp Cloud API (or capturing them in simulation mode).
const crypto = require('crypto');
const config = require('./config');

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// In simulation mode every outgoing message lands here, keyed by phone.
const outbox = new Map();
function takeOutbox(phone) {
  const msgs = outbox.get(phone) || [];
  outbox.delete(phone);
  return msgs;
}

/** Turns our simple message shapes into Cloud API payloads. */
function toPayload(to, msg) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  if (msg.type === 'text') {
    return { ...base, type: 'text', text: { body: cut(msg.text, 4096), preview_url: !!msg.previewUrl } };
  }
  if (msg.type === 'buttons') {
    return {
      ...base, type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: cut(msg.body, 1024) },
        action: { buttons: msg.buttons.slice(0, 3).map(b => ({ type: 'reply', reply: { id: b.id, title: cut(b.title, 20) } })) },
      },
    };
  }
  if (msg.type === 'list') {
    return {
      ...base, type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: cut(msg.body, 1024) },
        action: {
          button: cut(msg.button, 20),
          sections: msg.sections.map(s => ({
            title: cut(s.title, 24),
            rows: s.rows.map(r => ({ id: r.id, title: cut(r.title, 24), ...(r.description ? { description: cut(r.description, 72) } : {}) })),
          })),
        },
      },
    };
  }
  throw new Error(`Unknown message type ${msg.type}`);
}

async function send(to, msg) {
  const payload = toPayload(to, msg);
  if (config.simulation) {
    if (!outbox.has(to)) outbox.set(to, []);
    outbox.get(to).push(msg);
    return { simulated: true };
  }
  const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whatsappToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`WhatsApp API ${res.status}: ${JSON.stringify(body.error || body)}`);
    err.response = body;
    throw err;
  }
  return body;
}

/**
 * For messages the user didn't just trigger (upline alerts, approval notices).
 * WhatsApp only allows free-form messages within 24h of the person's last message;
 * outside that window this fails, so we log instead of crashing. See README → "Templates".
 */
async function sendBestEffort(to, msg) {
  try { await send(to, msg); return true; }
  catch (e) { console.warn(`[notify] could not message ${to}: ${e.message}`); return false; }
}

/** Checks the X-Hub-Signature-256 header Meta adds to every webhook call. */
function verifySignature(rawBody, header) {
  if (!config.appSecret) return true; // not configured (development)
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', config.appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { send, sendBestEffort, verifySignature, toPayload, takeOutbox };
