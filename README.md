# AgronomiZ WhatsApp Bot

An automated WhatsApp assistant (in Bahasa Indonesia) for the AgronomiZ network of PT Safeeko Bio Indonesia. People message one WhatsApp number and can:

- **Register as an agent** – as an *Agronomis* or a *Toko Tani* – with name, shop name, province and regency/city.
- **Join under a referral code** – every agronomist gets a code (`AGZ-XXXXX`) and an invite link. Each agronomist can recruit **at most 5 agronomists**; shops can join under an agronomist without limit. Shop codes (`TKO-XXXXX`) cannot recruit.
- **Read product information** – composition, registration number, dose and university trial results for EkoRiza, SaiPower Plus, Pak-Teri, Aniso SC and Eko-BS SC.
- **Request a quote** – logged for your team, with an optional WhatsApp alert to admins.
- **See their profile and network** – status, code, remaining recruit slots, and who they've recruited.

Your team uses a password-protected **admin page** (`/admin`) to approve or reject sign-ups, see the network tree, follow up on quote requests and download everything as CSV (opens in Excel).

---

## 1. Try it first (no WhatsApp account needed)

Requires Node.js 20.12 or newer.

```bash
npm install
cp .env.example .env        # then set ADMIN_PASSWORD in .env
npm start
```

Open **http://localhost:3000/simulator** – a WhatsApp-style chat where you can type `halo` and click through the menus. Change the phone number at the top to act as a different person (for example, to register a recruit with someone's code). Open **http://localhost:3000/admin** to approve the sign-ups you made.

Without WhatsApp credentials the bot runs in *simulation mode*: nothing is sent to real WhatsApp.

## 2. Connect a real WhatsApp number (Meta WhatsApp Cloud API)

1. **Meta Business account** – at business.facebook.com, with PT Safeeko Bio Indonesia's details. Start *Business Verification* early (company documents such as NIB); it's needed to message beyond the test limits.
2. **Developer app** – at developers.facebook.com → *Create app* → type *Business* → add the **WhatsApp** product.
3. **Phone number** – Meta gives a free test number to start. For launch, add your own number under *WhatsApp → API Setup*. The number must **not** be active in the normal WhatsApp or WhatsApp Business app (remove it there first, or use a new SIM).
4. **Permanent access token** – in Business Settings → *System users*, create an admin system user, assign it the app and the WhatsApp account, and generate a token with `whatsapp_business_messaging` and `whatsapp_business_management`. (The token on the API Setup page expires after 24 hours – fine for a first test only.)
5. **Fill in `.env`**:
   - `WHATSAPP_TOKEN` – the token from step 4
   - `WHATSAPP_PHONE_NUMBER_ID` – from *API Setup* (this is an ID, not the phone number)
   - `WHATSAPP_APP_SECRET` – App settings → Basic → App secret (lets the bot reject fake requests)
   - `WHATSAPP_VERIFY_TOKEN` – any secret word you choose
   - `BOT_WHATSAPP_NUMBER` – the bot's number, digits only, e.g. `6281234567890` (used in invite links)
   - `ADMIN_WHATSAPP_NUMBERS` – your team's numbers for new sign-up and quote alerts
6. **Host the bot** on a public HTTPS address (section 3).
7. **Webhook** – in the app: *WhatsApp → Configuration → Webhook*: callback URL `https://YOUR-DOMAIN/webhook`, verify token = your `WHATSAPP_VERIFY_TOKEN`. Then subscribe to the **messages** field.
8. Send `halo` to the number from your phone.

`GRAPH_API_VERSION` defaults to `v23.0`; set it to the version shown in your Meta app if that's newer.

## 3. Hosting

Any server that runs Node.js and keeps files on disk works. The database is a single SQLite file (`data/agronomiz.db` by default, `DB_PATH` to change) – **back it up**.

- **Small VPS** (Jakarta or Singapore region): `npm install --omit=dev`, `npm start` behind a process manager (pm2 or systemd) and a reverse proxy with HTTPS (Caddy or nginx + Let's Encrypt).
- **Docker**: `docker build -t agronomiz-bot .` then `docker run -d -p 3000:3000 --env-file .env -v agronomiz-data:/data agronomiz-bot`.
- **Platforms like Railway or Render**: deploy the folder, set the `.env` values as environment variables, and attach a persistent disk/volume mounted where `DB_PATH` points.

## 4. Messages your team sends first (templates)

WhatsApp lets the bot reply freely within **24 hours** of a person's last message. These messages go out on the bot's own initiative and can fail if the person hasn't written recently:

- approval / rejection notices to new agents,
- "someone registered with your code" alerts to uplines,
- sign-up and quote alerts to admins.

The bot tries, and logs a warning if WhatsApp refuses – nothing breaks. Approving sign-ups the same day avoids most failures. For guaranteed delivery, create *message templates* in WhatsApp Manager (e.g. a "utility" template for approvals) and switch those calls to send the template. Template messages are charged per message by Meta; replies inside the 24-hour window are free – check Meta's current Indonesia rates.

## 5. Everyday use

- **What agents type**: `halo` or `menu` shows the menu; `batal` cancels registration; `DAFTAR AGZ-XXXXX` starts registration with that referral code (this is what invite links send). Any other message shows the menu.
- **Admin page** (`/admin`, username `admin` unless changed): approve/reject, deactivate/reactivate agents, mark quotes handled, CSV export.
- **Rules** in `.env`: `MAX_DIRECT_RECRUITS` (default 5), `REQUIRE_APPROVAL` (default true), `REQUIRE_REFERRAL` (default false – set true once your first agronomists are in, so everyone joins under someone).
- Pending sign-ups count toward an agronomist's 5 slots (so the slot is held while you review); rejecting frees it.

## 6. Editing product information

All product text is in `src/products.js`. Edit, save, restart. Keep product names ≤ 24 characters and `category · short` ≤ 72 characters (WhatsApp limits). Before launch, check every claim against the registration certificate and label, and add registration numbers for SaiPower Plus and Pak-Teri once issued. Only promote registered uses.

## 7. Files

```
src/server.js     web server and WhatsApp webhook
src/bot.js        conversation logic (all Bahasa Indonesia text except products)
src/products.js   product catalogue
src/db.js         database (agents, sessions, quote requests)
src/whatsapp.js   sending messages through the Cloud API
src/admin.js      admin page
src/simulator.js  browser simulator (only in simulation mode)
test/flow.test.js automated tests – run with: npm test
```

## Next steps this is ready for

Agent records already carry the upline link, so commission tracking and shop order links (agents sharing product links that shops buy through) can be built on the same database.
