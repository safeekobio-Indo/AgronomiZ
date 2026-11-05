// HTTP server: WhatsApp webhook, admin page, local simulator.
const express = require('express');
const config = require('./config');
const wa = require('./whatsapp');
const { handleIncoming } = require('./bot');
const store = require('./db');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false }));

app.get('/', (_req, res) => res.type('text').send('AgronomiZ WhatsApp bot is running.'));
app.get('/health', (_req, res) => res.json({ ok: true, simulation: config.simulation }));

// Meta calls this once when you register the webhook URL.
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.verifyToken) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  return res.sendStatus(403);
});

// Every incoming WhatsApp message arrives here.
app.post('/webhook', (req, res) => {
  if (!wa.verifySignature(req.rawBody || Buffer.from(''), req.get('x-hub-signature-256'))) {
    return res.sendStatus(401);
  }
  res.sendStatus(200); // acknowledge fast; Meta retries if we take too long

  const entries = req.body?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const names = Object.fromEntries((value.contacts || []).map(c => [c.wa_id, c.profile?.name]));
      for (const message of value.messages || []) {
        if (!store.markProcessed(message.id)) continue; // duplicate delivery
        handleIncoming({ from: message.from, profileName: names[message.from], message })
          .catch(err => console.error('[bot] error handling message', message.id, err));
      }
      // value.statuses (sent/delivered/read receipts) are ignored.
    }
  }
});

require('./admin')(app);
if (config.simulation) require('./simulator')(app);

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`AgronomiZ bot listening on port ${config.port}`);
    if (config.simulation) {
      console.log(`SIMULATION MODE (no WhatsApp credentials). Try the bot at http://localhost:${config.port}/simulator`);
    }
    if (!config.adminPassword) console.log('Admin page disabled: set ADMIN_PASSWORD in .env to enable /admin');
    else console.log(`Admin page: http://localhost:${config.port}/admin`);
  });
}

module.exports = app;
