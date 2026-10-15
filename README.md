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

Requirements: Node.js 22+, Docker (for MongoDB and local S3 storage).

```bash
npm install                      # installs all three workspaces
docker compose up -d             # MongoDB :27017 + SeaweedFS S3 :8333
cp backend/.env.example backend/.env   # then set the two JWT secrets
npm run seed                     # catalogue, settings, owner + demo institution
npm run dev:backend              # terminal 1
npm run dev:website              # terminal 2
npm run dev:admin                # terminal 3
```

Already running MongoDB locally (e.g. the Windows MongoDB service)? Start only storage:
`docker compose up -d s3`. Running both on port 27017 splits your data between two databases.

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
- **Staff:** email + password on the admin panel, roles `admin`, `staff`, `delivery`.

Access tokens (15 min) are kept in memory; refresh tokens rotate on every use and are stored hashed,
in httpOnly cookies. The website and admin use separate cookies.

## Configuration

All backend settings are in [backend/.env.example](backend/.env.example). Optional integrations
switch on when their keys are set:

| Integration | Variables | Without it |
| --- | --- | --- |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Only pay-at-counter is offered |
| OTP SMS (MSG91) | `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID` | Code returned to the browser in development |
| WhatsApp updates | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Messages are logged to the console |

Razorpay webhook URL: `POST /api/v1/payments/razorpay/webhook` (events `payment.captured`,
`order.paid`, `payment.failed`).

### Production storage (AWS S3)

Create two buckets: private (uploads, proofs) and public (product images, logos). On both, add a CORS
rule allowing `PUT`, `GET` and `HEAD` from the website and admin origins, because browsers upload
straight to S3 with presigned URLs. Keep "Block public access" on for the private bucket. Leave
`S3_ENDPOINT` empty for AWS. Development creates the buckets and CORS rules automatically.

Identity documents (PVC card products marked *sensitive*) get 60-second download links, are visible
only to the owner and staff, and are deleted after the retention period set in Admin → Settings.

## Project layout

```
backend/src
  config/        env validation, logger, db
  middleware/    auth, validation, errors, rate limits
  modules/<feature>/   *.model.ts  *.schema.ts  *.service.ts  *.routes.ts  *.admin.routes.ts
  jobs/          file retention
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
| `npm run build` | Production builds (`backend/dist`, `website/dist`, `admin/dist`) |
| `npm run seed` | Re-runnable: upserts the catalogue by slug |
