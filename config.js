// Loads settings from .env (if present) and the environment.
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envPath);
}

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();

const config = {
  port: parseInt(env('PORT', '3000'), 10),
  dbPath: env('DB_PATH', path.join(__dirname, '..', 'data', 'agronomiz.db')),

  // Meta WhatsApp Cloud API
  whatsappToken: env('WHATSAPP_TOKEN'),
  phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
  verifyToken: env('WHATSAPP_VERIFY_TOKEN', 'ganti-token-verifikasi'),
  appSecret: env('WHATSAPP_APP_SECRET'),
  graphVersion: env('GRAPH_API_VERSION', 'v23.0'),
  // The bot's own WhatsApp number in international format without "+", e.g. 6281234567890.
  // Used to build share links like https://wa.me/62812...?text=DAFTAR%20AGZ-XXXXX
  botNumber: env('BOT_WHATSAPP_NUMBER'),

  // Business rules
  maxDirectRecruits: parseInt(env('MAX_DIRECT_RECRUITS', '5'), 10),
  requireApproval: env('REQUIRE_APPROVAL', 'true') !== 'false',
  requireReferral: env('REQUIRE_REFERRAL', 'false') === 'true',

  // Team contact shown in the bot and notified about new leads
  contactName: env('CONTACT_NAME', 'Tim AgronomiZ – PT Safeeko Bio Indonesia'),
  contactPhone: env('CONTACT_PHONE', '+62 811 1202 3909'),
  contactEmail: env('CONTACT_EMAIL', 'nikhil@safeeko.com'),
  adminWhatsapp: env('ADMIN_WHATSAPP_NUMBERS').split(',').map(s => s.trim()).filter(Boolean),

  // Admin page
  adminUser: env('ADMIN_USER', 'admin'),
  adminPassword: env('ADMIN_PASSWORD'),
};

// Simulation mode: no WhatsApp credentials → messages are captured locally
// and the browser simulator at /simulator is switched on.
config.simulation = !config.whatsappToken || !config.phoneNumberId;

module.exports = config;
