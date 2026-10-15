# Printing Galaxy — Delivery Plan

Monorepo with three apps:

| Folder      | What it is                                   | Stack                                                                                     |
| ----------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `backend/`  | REST API, pricing engine, payments, storage  | Node.js 22+, Express 5, TypeScript, MongoDB + Mongoose, Zod, Razorpay, AWS S3 SDK, Pino   |
| `website/`  | Customer + institution web app (EN / हिंदी)  | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query, Tabler Icons, i18next |
| `admin/`    | Staff / owner panel                          | Same as website                                                                           |

## Product decisions (beyond the requirements doc)

1. **Two audiences, two price books.** Every product carries two independent pricing blocks:
   `retail` (individuals, students, local businesses) and `institution` (schools, colleges,
   enterprises). Each block has its own minimum quantity and quantity tiers
   (e.g. ID cards: retail ₹60/card from 1, institution ₹28/card from 100, ₹24 from 500).
2. **Two separate sign-in flows.**
   - Individuals: phone number + OTP (no password, no install).
   - Institutions: email + password registration with organisation details. Accounts start as
     **pending** and the owner approves them in the admin panel before bulk prices unlock.
   - Staff / owner: email + password in the admin panel only.
3. **Price is always computed on the server** from the product's price book. The client shows
   a live estimate from the same `/pricing/quote` endpoint, so the number never disagrees.
4. **Page-based products** (notes, PPT) price by `pages × copies`. Option values can add a
   per-unit amount (colour, double side) or a fixed fee per copy (spiral binding), and can set
   their own minimum copies (spiral binding ≥ 3).
5. **Quote workflow** for products that cannot be auto-priced (project files / viva): the order
   is placed as `quote_pending`, staff sets the price, the customer pays afterwards.
6. **Identity documents** (Aadhaar, PAN, …) are uploaded as `sensitive` files: private bucket,
   short-lived signed URLs, staff-only access, auto-deleted after the retention window.
7. **Bilingual by design.** UI strings via i18next (`en`, `hi`); catalogue data stored as
   `{ en, hi }` so the owner edits both languages in the admin panel.

## Brand

- Colours taken from the logo: navy `#131A2B`, blue `#1D6CF0 → #33A8F5`, CMYK accents
  cyan `#12B5EA`, magenta `#D9138A`, yellow `#FFC20E`.
- Type: **Plus Jakarta Sans** (Latin) + **Noto Sans Devanagari** (Hindi), self-hosted via Fontsource.
- Light and dark themes (system default, user toggle, persisted).

---

## Phase 0 — Foundation

- [x] Root workspace (`npm` workspaces), `.gitignore`, `.editorconfig`, Prettier config, README
- [x] `docker-compose.yml` for local MongoDB + SeaweedFS (S3-compatible) so no cloud account is needed in dev; buckets + CORS auto-created in development
- [x] Backend skeleton: env validation (Zod), Mongo connection, Pino logger, Helmet, CORS, rate limit, cookie parser
- [x] Feature-module folder layout (`modules/<feature>/{model,schema,service,controller,routes}`)
- [x] Central error handling (`ApiError`, Zod → 422, Mongoose duplicate key → 409), `asyncHandler`, `validate` middleware
- [x] Health check `/api/v1/health`
- [x] Website + admin Vite apps: Tailwind v4, shadcn tokens + components, path alias `@/`
- [x] Theme provider (light / dark / system) and theme toggle in both apps
- [x] i18n setup (EN + HI) with language switcher and persisted choice
- [x] Axios client with access-token header + silent refresh on 401
- [x] TanStack Query client with sane defaults

## Phase 1 — MVP: catalogue, pricing, ordering, payments, staff dashboard

### Backend
- [x] Models: `User`, `Institution`, `Otp`, `Session`, `Category`, `Product`, `Order`, `FileObject`, `Payment`, `Settings`, `AuditLog`, `NotificationLog`
- [x] Auth
  - [x] OTP request / verify for customers (hashed codes, TTL index, attempt limit, resend cooldown, dev echo)
  - [x] Institution register (pending) / login (email + password, blocked until approved for bulk pricing)
  - [x] Staff / admin login
  - [x] JWT access token (15 min) + rotating refresh token in httpOnly cookie, stored hashed in `Session`
  - [x] `authenticate`, `requireRole`, `requireKind` middleware
- [x] Catalogue: public list / detail endpoints, filtered by audience
- [x] Pricing engine: tier lookup, option deltas, fixed fees, min qty, min copies, quote endpoint
- [x] Uploads: presigned PUT to S3, complete step verifies object and counts PDF pages server-side, signed GET for owner/staff
- [x] Orders: create from cart (re-prices on server), list mine, detail, cancel, proof approve / request changes
- [x] Payments: Razorpay order, signature verify, webhook (raw body + HMAC), COD / pay at counter
- [x] Notifications: WhatsApp Cloud API for status messages (console fallback), MSG91 for OTP SMS, fired on every status change, logged
- [ ] WhatsApp approved message templates (needed outside the 24-hour session window) and SMS fallback for status updates
- [x] Admin APIs: dashboard stats, orders (filter, status change, assign, proof upload, quote, record cash payment, walk-in order), categories CRUD, products CRUD, institutions approve / reject / suspend, customers, staff, settings, audit log
- [x] Audit log on status / price / product / institution changes
- [x] Seed script with the full catalogue from the requirements doc, both price books, and an admin user

### Website
- [x] Layout: sticky header (logo, nav, language, theme, cart, account), mobile drawer, footer
- [x] Home: hero, audience split (Individuals vs Institutions), categories, featured products, how it works, CTA
- [x] Products listing with category filter
- [x] Product page: option picker, page count / copies / quantity, file upload with automatic PDF page count, notes, live server quote, min-order errors, tier hint ("order 500+ for ₹X")
- [x] `?lang=hi` / `?lang=en` links open the site in that language
- [x] Pricing page with **Individuals / Institutions** tabs and tier tables
- [x] Institutions landing page + separate register / login
- [x] Customer OTP login
- [x] Cart (persisted), checkout (pickup / delivery + address, pay online / at counter), Razorpay checkout
- [x] Account: my orders, order detail with status timeline, proof approval, pay-now for quoted orders
- [x] Institution dashboard: overview, orders, account status banner (pending / approved)
- [x] 404, loading and error states, SEO title per page

### Admin
- [x] Staff login, protected routes, role-aware sidebar
- [x] Dashboard: today / month revenue, orders by status, pending institutions, recent orders
- [x] Orders: table with status filter + search, detail with items, files (signed download), status changer, assign staff, proof upload, quote pricing, record payment
- [x] Walk-in order entry
- [x] Products: list, create / edit with bilingual fields, options editor, retail + institution tier editors
- [x] Categories CRUD
- [x] Institutions: list by status, approve / reject / suspend with reason
- [x] Customers list, staff management (admin only)
- [x] Settings: shop info, GST, delivery fee, file retention
- [x] Audit log viewer

### Verification done
- [x] API smoke test (40 checks): every acceptance criterion from the requirements doc, OTP + refresh rotation, both price books, quote workflow, status rules, payments, audit
- [x] Upload test against S3-compatible storage: presign → PUT → server counts 120 PDF pages → order priced from counted pages; signed links; cross-customer access denied
- [x] All three apps typecheck and build; pages screenshotted in light/dark, desktop/mobile, English/Hindi
- [ ] Razorpay checkout with real test keys (code is in place; needs keys in `backend/.env`)
- [ ] Automated test suite (Vitest + Supertest) in CI

## Phase 2 — PVC cards, gifts, proofs, invoices
- [x] Sensitive-file flag and retention-based auto-delete job (runs hourly in the API process)
- [ ] Client-side crop tool to the 8.6 × 5.4 cm template (front / back)
- [ ] Design preview canvas for key chains, name slips, frames, visiting cards
- [ ] Printable invoice / receipt PDF with GST fields (`pdf-lib`)
- [ ] Low-stock material tracking + admin alert

## Phase 3 — Institution bulk jobs
- [ ] Saved institution templates (logo, colours, layout) for ID card / out pass / fee card
- [ ] CSV / Excel + photos ZIP upload, background validation report (missing photo, duplicate roll no., image size)
- [ ] Background job queue (BullMQ + Redis) generating print-ready PDF sheets at exact 86 × 54 mm with bleed
- [ ] Teacher ID flow on a separate template; medals / shields / ties / belts with proof approval

## Phase 4 — Reports and polish
- [ ] Reports: daily / monthly sales, top products, pending payments, per-institution totals, staff workload, CSV export
- [ ] Delivery person app view (assigned deliveries, mark done)
- [ ] Certificate services (only after the owner answers the open question)
- [ ] Hindi copy review by a native speaker, PWA install + offline counter note

## Open questions still owed by the owner
Copied from the requirements doc: certificate workflow, passport-photo minimum unit, largest
tie/belt size, delivery vs pickup, GST registration, the real price sheet, printer file formats.
Prices in the seed are **placeholders** and must be replaced in the admin panel.
