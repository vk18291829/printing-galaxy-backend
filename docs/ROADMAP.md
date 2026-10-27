# Printing Galaxy — product roadmap

Audit of the website, admin panel and API (27 Oct 2026), written from four seats: a student
ordering notes on a phone, a school office ordering ID cards, the owner running the shop from a
phone, and a UI/UX review. Each item says what is wrong or missing, the standard way to do it,
and where it lands. ✅ = done, 🔨 = in progress, ⏳ = planned.

---

## 1. What is broken or out of date (fix first)

| # | Problem | Fix | Status |
|---|---|---|---|
| 1.1 | Home banners link to `/products?category=business-works` and `school-works`; the Products page no longer lists those, so visitors land on the wrong page. | Old category links redirect to their own page (Business Printing, Wedding Cards, School & College). Seed banners updated. | ✅ |
| 1.2 | Home banner "ID cards for the whole school, in one upload — Start bulk order" describes the removed spreadsheet flow. | New copy pointing to the Students & staff list and the order builder. | ✅ |
| 1.3 | Admin "Bulk card lists" page has nothing feeding it any more. | Hide from the menu; ID card work now comes from institution orders + the student list. | ✅ |
| 1.4 | Admin dashboard pipeline has no "Quote sent" column; quotes waiting for the customer are invisible. | Add the column. | ✅ |
| 1.5 | Admin uses a generic blue, not the logo colours; website and admin feel like two products. | Admin re-themed to navy `#142B4A` + orange `#F65B2A` + Inter. | ✅ |
| 1.6 | Website confirmations still show a success dialog; admin now uses toasts. | Same toast pattern on the website. | ✅ |

## 2. Admin as a phone app (the owner runs the shop from a phone)

Standard: an installable PWA with a bottom tab bar, large touch targets, list → detail screens,
sticky primary actions, and no horizontal tables on phones.

| # | Item | Status |
|---|---|---|
| 2.1 | Admin PWA: manifest, icons, theme colour, service worker (app shell cached, API never cached), "Install app" in the menu. | ✅ |
| 2.2 | Bottom tab bar on phones: Home · Orders · New order · Deliveries · More (the full menu in a sheet). | ✅ |
| 2.3 | Orders list as cards on phones (already) + segment tabs (see 3). | ✅ |
| 2.4 | Order detail on phones: status + next action pinned at the bottom; proof upload from camera. | ⏳ |
| 2.5 | Push notifications for new orders / proof replies (Web Push). | ⏳ |

## 3. Keep each business separate in admin

Orders from very different customers need different handling. Each order gets a **segment**,
set when it is created and back-filled for old orders:

- **Individual** — students, families, walk-ins (PVC cards, notes, photos, gifts)
- **School & College** — any institution order
- **Business** — visiting cards, flyers, banners, stationery
- **Wedding** — invitations and save-the-dates

| # | Item | Status |
|---|---|---|
| 3.1 | `segment` on every order (API), filter on the admin list, counts per tab. | ✅ |
| 3.2 | Segment tabs on the admin Orders page (phone: scrollable chips). | ✅ |
| 3.3 | Dashboard and reports split by segment. | ⏳ |

## 4. Staff, roles and permissions

Today a user has one role (`admin`, `staff`, `delivery`). Shops need several people with
overlapping jobs, e.g. one person at the counter who also designs.

Standard: **roles bundle permissions**, a person can hold several roles, and every API route
checks a permission (not a role). The owner (`admin`) always has everything.

| Role | Can |
|---|---|
| Manager | everything except settings, staff and money refunds |
| Counter | orders, walk-in orders, payments at the counter, hand over |
| Designer | orders (view), send proofs, student lists |
| Production | orders (view), move to printing / ready, materials |
| Delivery | own deliveries only |
| Accounts | payments, refunds, invoices, reports |
| Catalogue | products, prices, categories, banners |

| # | Item | Status |
|---|---|---|
| 4.1 | `staffRoles[]` on users + permission map + `requirePermission()` on routes. | ✅ |
| 4.2 | Staff page: pick several roles per person. | ✅ |
| 4.3 | Admin menu and actions shown by permission. | ✅ |
| 4.4 | Each staff member's own dashboard ("My work": orders assigned to me). | ⏳ |

## 5. Products

| # | Item | Status |
|---|---|---|
| 5.1 | **Demo / preview video** per product, set by admin (YouTube link or uploaded MP4), shown first in the product gallery with a play button. | ✅ |
| 5.2 | **Contact number per product** (falls back to the shop number): Call and WhatsApp buttons on the product page. | ✅ |
| 5.3 | **Ready-by date**: admin sets working days per product (exists); each order now carries a **due date** the customer sees, which staff can change with a note. | ✅ |
| 5.4 | Overdue orders highlighted in admin. | ✅ |

## 6. Proofs

| # | Item | Status |
|---|---|---|
| 6.1 | **Proof preview** inline (image or PDF) for the customer and staff, with version history (Proof 1, 2, 3…). | ✅ |
| 6.2 | Customer can approve or ask for changes from the preview, with a comment. | ✅ (existed) |
| 6.3 | Pinch-zoom / full-screen preview on phones. | ⏳ |

## 7. School & college journey

Already done: order builder (product → size/custom size → options → quantity → quote or order),
quote accept/decline, data sheet after confirmation, Students & staff list with camera photos and
codes, admin export (Excel + photos ZIP).

| # | Next | Status |
|---|---|---|
| 7.1 | Generate the ID card print PDF straight from the student list (renderer exists). | ⏳ |
| 7.2 | Order ID cards for "Class 5-A" or "all missing" directly from the list. | ⏳ |
| 7.3 | Share a photo-capture link with class teachers (no login, limited to one class). | ⏳ |

## 8. Website for individuals

| # | Item | Status |
|---|---|---|
| 8.1 | Products page by category rows. | ✅ |
| 8.2 | App-like phone view: bottom bar (Home · Products · Orders · Account) when installed or on phones. | ⏳ |
| 8.3 | Reorder from a past order in one tap. | ⏳ |

## 9. Trust, privacy and standards

| # | Item | Status |
|---|---|---|
| 9.1 | Terms, privacy, refund, shipping pages exist (Razorpay requirement). Privacy must also cover **student data and photos** (who sees them, retention, deletion on request). | ✅ |
| 9.2 | Cookie / storage notice is not needed (no tracking cookies). Keep it that way. | — |
| 9.3 | Accessibility: labels on icon buttons, focus rings, colour contrast of orange on white (3.3:1 — fine for large text, use navy for small text). | ongoing |

---

### Order of work

1. Broken links, admin theme, admin PWA + bottom bar (1, 2.1–2.2)
2. Order segments (3.1–3.2)
3. Product video, contact number, due dates (5)
4. Proof preview (6.1)
5. Staff roles and permissions (4.1–4.3)
6. Privacy text for student data (9.1)
7. Everything marked ⏳, in table order
