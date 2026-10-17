# Printing Galaxy

Online ordering for a print and customisation shop: notes and PPT printing, PVC ID cards,
school ID cards and stationery, visiting cards, gifts and frames.

| Folder     | App                                     | Dev URL                        |
| ---------- | --------------------------------------- | ------------------------------ |
| `backend/` | REST API (Express 5, MongoDB, S3, Razorpay) | http://localhost:4000/api/v1 |
| `website/` | Customer + institution site, English / हिंदी | http://localhost:5173        |
| `admin/`   | Staff and owner panel                   | http://localhost:5174          |

The delivery plan and what is done vs. still open is in [PLAN.md](PLAN.md).

## Quick start

Requirements: Node.js 22+, MongoDB 7 on `localhost:27017` (e.g. the Windows MongoDB service) and
S3-compatible object storage for uploads.

For local storage, run [SeaweedFS](https://github.com/seaweedfs/seaweedfs/releases) from its single
binary — in development the API creates the buckets and CORS rules itself:

```bash
weed server -s3 -s3.port=8333 -dir=./.s3-data -volume.max=0 -master.volumeSizeLimitMB=1024
```

Or point the `S3_*` variables in `backend/.env` at AWS S3, Cloudflare R2 or any S3-compatible service.

```bash
npm install                      # installs all three workspaces
cp backend/.env.example backend/.env   # then set the two JWT secrets
npm run seed                     # catalogue, settings, owner + demo institution
npm run dev:backend              # terminal 1
npm run dev:website              # terminal 2
npm run dev:admin                # terminal 3
```

### Seeded accounts (development only — change them)

| Where   | Login                                                   |
| ------- | ------------------------------------------------------- |
| Admin   | `owner@printinggalaxy.in` / `ChangeMe@123`              |
| Website, institution | `demo-school@printinggalaxy.in` / `School@123` (approved) |
| Website, individual  | any 10-digit mobile number; without an SMS provider the OTP is shown on screen and in the API log |

**Prices in the seed are placeholders.** Replace them in Admin → Products & prices.

## How pricing works

Every product has two price books, `retail` (individuals) and `institution` (approved schools,
colleges, coaching centres, businesses). Each book has a minimum order and quantity tiers.
Options add a per-unit amount (colour, larger size) or a fixed fee per copy (spiral binding), and
can require minimum copies (spiral ≥ 3). Page-based products price by `pages × copies`; when a PDF is
uploaded the server counts the pages itself.

The server is the only place prices are calculated (`backend/src/modules/pricing/pricing.service.ts`).
The website's live price and order creation both call it, and the audience comes from the signed-in
account, never from the browser. A newly registered institution gets individual prices until the owner
approves it in Admin → Institutions.

## Sign-in

- **Individuals:** phone + OTP (MSG91 when configured).
- **Institutions:** email + password, separate register/login pages, owner approval.
- **Staff:** email + password on the admin panel, roles `admin`, `staff`, `delivery`. Delivery riders
  only see "My deliveries" (phone-friendly: call, open in Maps, start, delivered with cash collected,
  could not deliver).

Access tokens (15 min) are kept in memory; refresh tokens rotate on every use and are stored hashed,
in httpOnly cookies. The website and admin use separate cookies.

## Configuration

All backend settings are in [backend/.env.example](backend/.env.example). Optional integrations
switch on when their keys are set:

| Integration | Variables | Without it |
| --- | --- | --- |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Only pay-at-counter is offered |
| Email (Gmail), the default | `MESSAGING_CHANNEL=email`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `WEBSITE_URL` | Codes and emails are printed in the API log (development only) |
| SMS (MSG91), switched off | `MESSAGING_CHANNEL=sms`, `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID`, `MSG91_TEMPLATE_*` | Messages are logged to the console |
| Job queue (Redis / BullMQ) | `REDIS_URL` | Bulk jobs run one at a time inside the API process |

**Messages: email or SMS.** `MESSAGING_CHANNEL` picks one channel for everything: sign-in codes,
order updates with pickup / delivery codes, refunds, institution approvals, shop alerts and
promotions. With `email` (the default) customers sign in with their email address and give a
mobile number once at checkout so the shop and rider can call. Mail goes out through a Gmail
account with an App Password (Google Account → Security → 2-Step Verification → App passwords).
A normal Gmail account sends about 500 emails a day, Google Workspace about 2,000.
Emails go out in the customer's language (English or हिंदी, from the site language at sign-up and
their profile). New customers get a welcome email, new institutions a "registration received"
email, and the invoice PDF is attached to the "delivered" / "picked up" email. The wording lives in
`backend/src/modules/notifications/email-copy.ts`.

**SMS templates (SMS channel).** With `MESSAGING_CHANNEL=sms` all messages are SMS through MSG91, and India's DLT rules need every SMS text
registered first. Register one *Service Implicit* template per message on your DLT portal, add each
to MSG91 (SMS → Templates, variables written `##var1##`, `##var2##`, …) and put the MSG91 template
ids in `.env`; the exact texts are in `backend/.env.example`. Each variable holds at most 30
characters. SMS are sent in English.

**Promotions.** In **Admin → Promotions** write an email (subject, message, optional button), send
yourself a test, then send it to every customer who has not turned offers off. Each email has a
signed "Stop offer emails" link. On the SMS channel the same page sends DLT-approved promotional
templates instead, only between 10 AM and 9 PM.

The website's WhatsApp chat button opens a chat with the shop's WhatsApp number (Settings), or the
shop phone when that is empty. It does not send messages.

Razorpay webhook URL: `POST /api/v1/payments/razorpay/webhook` (events `payment.captured`,
`order.paid`, `payment.failed`, `refund.processed`, `refund.failed`). Each event is stored with
Razorpay's event id, so a repeated delivery is acknowledged and skipped.

### Production storage (AWS S3)

Create two buckets: private (uploads, proofs) and public (product images, logos). On both, add a CORS
rule allowing `PUT`, `GET` and `HEAD` from the website and admin origins, because browsers upload
straight to S3 with presigned URLs. Keep "Block public access" on for the private bucket. Leave
`S3_ENDPOINT` empty for AWS. Development creates the buckets and CORS rules automatically.

Identity documents (PVC card products marked *sensitive*) get 60-second download links, are visible
only to the owner and staff, and are deleted after the retention period set in Admin → Settings.

## Order lifecycle

```
quote_pending ─┐
               ├─> received ─> proof_sent ⇄ approved ─> printing ─> ready ─┬─> picked_up      (pickup code)
awaiting_payment┘                                                          └─> out_for_delivery ─> delivered (delivery code)
any open step ─> cancelled (refund if paid)
```

- **Pay first.** Individuals who choose online payment get `awaiting_payment`; staff do not see it in the
  production queue. Once Razorpay confirms, it moves to `received`. Unpaid orders are cancelled after
  *Settings → Unpaid online orders cancel after* (default 30 min); before cancelling, the API asks
  Razorpay whether a payment went through. A payment that arrives after the cancel brings the order back.
  Approved institutions are billed on account and start straight away.
- **Allowed moves.** The status control only offers the next valid steps. The owner can override with a
  written reason (saved in the history as `Override: …`).
- **Handover codes.** When a pickup order is ready, or a delivery goes out, the customer gets a 4-digit code
  by email (or SMS) and on their order page. Staff (Hand over) or the rider (Delivered) must enter it; five
  wrong codes lock the handover until the owner confirms it. Riders never see the code.
- **Balance at handover.** Anything still due must be collected when the order is handed over (except
  institutions). Failed delivery attempts message the customer; after three, the shop is alerted.
- **Refunds.** Customers can cancel until work starts; money paid online is refunded automatically. The owner
  can refund any amount from the order page (Razorpay or cash). Refund status updates arrive by webhook.

### Idempotency

Retries never create duplicates: checkout and walk-in orders, counter payments, cash on delivery,
handovers and refunds send an `Idempotency-Key` header (a UUID per action) and the API returns the first
result for a repeated key. Money is moved with atomic, guarded updates (never more than the total, never
more refunded than paid), a file can belong to one order only, Razorpay webhooks are de-duplicated by
event id, customer messages by order + step, and simultaneous edits to one order fail with *"This was just
updated, refresh"* instead of overwriting each other.

### Logs and monitoring

- One readable line per request: `POST /api/v1/orders 201 · 143ms` with the request id, user and role.
  Slow requests (> 1 s) are marked `(slow)`. Business events are logged as `order.created`,
  `order.status`, `payment.captured`, `payment.refunded`, `handover.wrong_code`, `delivery.failed`…
- Every response has an `X-Request-Id` header; server errors show it to the user as *Ref: …*, so a
  customer's screenshot leads to the exact log line (`pm2 logs pg-api | grep <ref>`).
- Phone numbers are masked (`98****3210`); tokens, codes and signatures are redacted. Login codes are
  never written to the log in production.
- `/api/v1/health` returns 503 when the database is down (use it for uptime monitoring).
- **Admin → System activity** (owner): server health, setup warnings, failed emails / SMS with
  a Retry button, all payments and refunds, and every webhook received.
- In production the API refuses to start with the example JWT secrets and prints warnings for missing
  integrations. Rotate logs with `pm2 install pm2-logrotate`.

## Institution bulk ID cards

1. The institution saves a **card template** (student ID, teacher ID, out pass, fee card): logo, colours,
   orientation and which details to print. "Sample print PDF" renders the real sheet with dummy people.
2. It uploads the **list** (`.xlsx` or `.csv`, one person per row; common headings like "Roll No.",
   "Father's Name", "Emp Code" are recognised) and a **photos ZIP** named by roll no. / employee ID or
   listed in a Photo column.
3. A background job checks every row and photo (missing columns and values, duplicate IDs, missing or
   tiny photos, the product's minimum order) and reports problems with Excel row numbers.
4. A clean list becomes a print-ready PDF: exact trim size (86 × 54 mm; fee cards A6) plus 3 mm bleed,
   ganged on A4 with crop marks, backs mirrored for long-edge duplex.
5. Placing the order attaches that sheet as the **proof**; nothing is printed until it is approved.

Staff see every upload in Admin → Bulk card lists and can re-check or rebuild a sheet. Lists and photos
are private and deleted after the retention period once the order is completed. With `REDIS_URL` set,
`npm run worker -w backend` runs extra job workers.

## Tests

`npm test` runs the API suite (Vitest + Supertest) against a throwaway database
(`printing-galaxy-test` on the local MongoDB, or `TEST_MONGODB_URI`); object storage is replaced by an
in-memory fake. Before pushing, run `npm run typecheck`, `npm test` and `npm run build`.

## Project layout

```
backend/src
  config/        env validation, logger, db
  middleware/    auth, validation, errors, rate limits
  modules/<feature>/   *.model.ts  *.schema.ts  *.service.ts  *.routes.ts  *.admin.routes.ts
  jobs/          file retention, job queue (BullMQ or in-process)
  worker.ts      standalone job worker (Redis only)
backend/tests    API tests and helpers
website/src, admin/src
  app/           router, providers
  components/    ui (shadcn), layout, common
  features/<feature>/  api hooks (TanStack Query), stores, components
  pages/         route components (lazy-loaded)
  locales/       en.json, hi.json   (website)
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Type-checks all three apps |
| `npm test` | API tests (needs MongoDB) |
| `npm run build` | Production builds (`backend/dist`, `website/dist`, `admin/dist`) |
| `npm run seed` | Re-runnable: upserts the catalogue by slug |
