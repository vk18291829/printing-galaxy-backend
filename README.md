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
| OTP SMS (MSG91) | `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID` | Code returned to the browser in development |
| WhatsApp updates | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_*` | Messages are logged to the console |
| WhatsApp delivery receipts | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Failures after sending are not noticed |
| Status SMS fallback (MSG91) | `MSG91_AUTH_KEY`, `MSG91_STATUS_TEMPLATE_ID` | No SMS when WhatsApp fails |
| Job queue (Redis / BullMQ) | `REDIS_URL` | Bulk jobs run one at a time inside the API process |

**WhatsApp templates.** Outside the 24-hour customer-service window WhatsApp only delivers approved
templates. Create three *Utility* templates in Meta Business Manager and put their names in `.env`:
order status `Your order {{1}} {{2}}. {{3}}` (in English and Hindi), account update
`Printing Galaxy: {{1}} {{2}}`, staff alert `Printing Galaxy alert: {{1}}`. Point the WhatsApp webhook at
`/api/v1/notifications/whatsapp/webhook` (field `messages`): if a message later fails to deliver, it is
re-sent once by SMS. The MSG91 status flow receives the same values as `var1`, `var2`, `var3`.

Razorpay webhook URL: `POST /api/v1/payments/razorpay/webhook` (events `payment.captured`,
`order.paid`, `payment.failed`).

### Production storage (AWS S3)

Create two buckets: private (uploads, proofs) and public (product images, logos). On both, add a CORS
rule allowing `PUT`, `GET` and `HEAD` from the website and admin origins, because browsers upload
straight to S3 with presigned URLs. Keep "Block public access" on for the private bucket. Leave
`S3_ENDPOINT` empty for AWS. Development creates the buckets and CORS rules automatically.

Identity documents (PVC card products marked *sensitive*) get 60-second download links, are visible
only to the owner and staff, and are deleted after the retention period set in Admin → Settings.

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
