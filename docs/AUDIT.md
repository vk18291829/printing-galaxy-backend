# Order & payment audit — most critical workflow

I audited one workflow: a customer's online order, from cart through payment to handover. It's where the money is and where most of the code is. Everything below was read from the code in the current working tree, including this session's uncommitted changes, and checked against the existing tests. I changed no files and ran no new code. Test results I mention come from runs earlier in this session; nothing was executed for this audit.

## 1. How the system is built

| Part | What it does |
|---|---|
| `website/` (React + Vite) | Customer and school site: catalogue, cart, checkout, Razorpay payment window, my orders, school dashboard |
| `admin/` (React) | Staff panel: orders queue, walk-in and school orders, proofs, payments and refunds, deliveries, stock, settings |
| `backend/` (Express + MongoDB/Mongoose) | API, prices worked out on the server, order state machine, payments, uploads, notifications, background jobs |
| Outside services | Razorpay (payments, webhooks, refunds), file storage (presigned uploads), email (Gmail) and SMS (off) |

Who uses it:
- **Customers** (individuals)
- **Schools** (approved first, billed on account)
- **Staff**, with role-based permissions: orders, walk-in, refunds, payments, and so on
- **Delivery riders**
- **The owner** (admin, who can override)

## 2. The workflow, step by step

1. **Checkout.** [checkout-page.tsx](website/src/pages/checkout-page.tsx) `placeOrder` sends `POST /orders` with an `Idempotency-Key`.
2. **Order created.** [orders.routes.ts](backend/src/modules/orders/orders.routes.ts):
   - A repeated key returns the earlier order.
   - Old unpaid checkouts holding the same files are closed.
   - `buildItems` re-prices everything on the server and checks the files belong to the customer.
   - `computeTotals` adds delivery and GST.
   - The order is saved by `persistOrder` as a **draft** with status `awaiting_payment` and a payment deadline.
3. **Payment window.** `payWithRazorpay`, then `POST /payments/razorpay/order`, which `razorpayOrderFor` handles by reusing an open Razorpay order or creating one.
4. **Payment confirmed.** Either the browser handler calls `POST /payments/razorpay/verify` (signature check), or the Razorpay webhook (signature check, event-ID dedupe) arrives. Both go to `applyCapture`:
   - The Payment row is unique per Razorpay payment ID.
   - The money is added to the order in one atomic update that also sets its payment status.
   - `afterPayment` → `confirmDraft` alerts staff, and `changeStatus('received')` emails the customer.
5. **Unpaid.** `cancelUnpaidOrders` checks with Razorpay once more, then quietly closes the draft and frees its files. A payment that arrives later brings the order back.
6. **Production.** Staff moves are limited by `assertTransition`. Design items need an approved proof before printing.
7. **Handover.** [handover.service.ts](backend/src/modules/orders/handover.service.ts) `completeHandover`: customer code check (limited tries), balance must be settled, status changes, then any cash collected is recorded.
8. **Cancel and refund.** `refundOrder` reserves the refund amount atomically first, refunds Razorpay payments newest first, and puts back any part that fails.

## 3. Workflow verification

| Workflow | Starts at | Evidence | What's wrong | Status |
|---|---|---|---|---|
| Server-side pricing | Checkout | `buildItems` / `computeTotals`; test "counts PDF pages on the server and re-prices" | — | Verified |
| Order created once per checkout | Double tap or retry | Unique `idempotencyKey`; tests for retries and parallel requests | — | Verified |
| Paid → order confirmed | Razorpay handler | Tests "reuses the payment window and starts the order once paid", "is not an order until it is paid" | Payment that confirms after the customer gave up: **F1** | Bug found |
| Webhook repeated or out of order | Razorpay | Unique `eventId` and payment ID; test "records a webhook once…" | — | Verified |
| Unpaid timeout, late payment | Background job | Tests for timeout and late payment | Customer never told when a late payment brings the order back: **F2** | Bug found |
| Production steps | Staff | Tests "blocks skipped steps…", "refuses automatic steps…" | — | Verified |
| Cancel with refund | Staff or customer | Tests for customer cancel refund and owner-only refund | Refund possible without the refund permission: **F3** | Bug found |
| Pickup handover with cash | Counter | Code read only; delivery cash is tested | Cash can go unrecorded after a failure: **F4** | Partly verified |
| Walk-in, school, quote orders | Staff or school | Several tests each | — | Verified (happy paths) |

## 4. Findings, most serious first

**F1 — High — Business logic: a payment that confirms after the customer gave up can lead to a second paid order**
- **Where:**
  - [checkout-page.tsx](website/src/pages/checkout-page.tsx) `placeOrder`: the checkout key is made fresh each time the page opens (`useRef(newIdempotencyKey())`).
  - [razorpay.ts](website/src/features/orders/razorpay.ts): a closed window resolves `false`, and a failed verify call rejects.
  - [orders.routes.ts](backend/src/modules/orders/orders.routes.ts) `discardStaleDrafts`: only looks at old checkouts that hold the same files.
- **Should happen:** a payment that goes through is never charged twice for the same cart.
- **Actually happens, step by step:**
  1. The customer pays by UPI and closes the window while the payment is still pending, or the verify call times out after Razorpay took the money.
  2. Checkout says "Payment not completed" and keeps the cart.
  3. The webhook or the 15-minute check later records the payment, and the draft becomes a real `received` order.
  4. The cart is still full. The customer comes back to checkout, gets a new key and a new draft, and pays again.
  5. Result: two paid orders. Items with files are partly protected, because the file check fails with a confusing "please re-upload". Items without files get no protection.
- **Root cause:** the website has no way to ask "did this checkout actually get paid?". The key doesn't survive leaving the page, and a key replay that returns an already-paid order isn't treated as success (see F5).
- **Impact:** customers charged twice, refunds to process, complaints.
- **Fix:**
  - Keep the checkout key with the cart (session storage, reset when the cart changes).
  - When the payment window closes, ask the server to check with Razorpay before saying it failed. `reconcileRazorpayOrder` already exists.
  - Treat a replay that returns a paid order as "order placed".
- **Regression tests:** a payment confirmed by webhook after the window closed, then checkout again, must return the paid order and not create a new draft.

**F2 — Medium — Flow: a late payment brings the order back but nobody tells the customer**
- **Where:** [payment.service.ts](backend/src/modules/payments/payment.service.ts) `afterPayment`, the branch for orders cancelled because payment didn't arrive in time.
- **Actually happens:** it saves `status: 'received'` and logs it, but never calls `notifyStatus`. Combined with drafts, the customer was never shown this order, then got charged, and receives no confirmation. Staff do get an alert.
- **Fix:** call `notifyStatus(order, 'Payment received')` after the save.
- **Test:** a notification log entry exists after a late webhook.

**F3 — Medium — Security (who's allowed): refund without the "refunds" permission**
- **Where:** [orders.admin.routes.ts](backend/src/modules/orders/orders.admin.routes.ts) `PATCH /:id/status`.
- **Actually happens:** the route needs only the router-wide "orders" permission. With `{status:'cancelled', refund:true}` it calls `refundOrder`, while the dedicated `/refunds` route requires "refunds". So any staff member with order access can send money back by cancelling.
- **Fix:** when `refund` is true, check the "refunds" permission (or refuse and point to the refund route).
- **Test:** staff without "refunds" who cancel with `refund:true` get 403 and the money isn't moved.

**F4 — Medium/Low — Reliability: cash at handover can go unrecorded**
- **Where:** `completeHandover` sets the terminal status first, then calls `recordPayment`. A retry returns at once (`if (order.status === to) return order`).
- **Scenario:** the database write for the payment fails after the status was saved. The order shows "picked up" with a balance still due, and retrying never records the cash.
- **Fix:** on a repeat with `collected > 0` and the same idempotency key, try `recordPayment` again. The key already prevents counting it twice.

**F5 — Low — Flow: a checkout retry that returns an already-paid order shows an "already paid" error**
- **Where:** checkout `onSuccess`, the non-draft branch. It calls `payWithRazorpay` for any online order that isn't a quote, and the server answers "already paid".
- **Fix:** part of F1. Skip the payment window when nothing is due.

**F6 — Low (depends on the server) — Data: timezone mismatch**
- **Where:** `generateOrderNumber` and `addWorkingDays` (due dates, Sundays skipped) in [order.service.ts](backend/src/modules/orders/order.service.ts) use the server's local time. Reports and invoices use IST explicitly.
- **Impact:** on a server running in UTC, orders placed between 00:00 and 05:30 IST get the previous day's date in the order number and may get the wrong due date around Sundays.
- **Fix:** compute these in Asia/Kolkata, or set `TZ=Asia/Kolkata` for the process.

**F7 — Low (risk) — Payments: the browser confirmation trusts the signature without checking capture**
- **Where:** `/razorpay/verify` records the expected amount as captured. That's fine with Razorpay auto-capture, which is the default. If the account is ever set to manual capture, a payment that is only authorised would be booked as paid.
- **Fix:** document that auto-capture is required, or fetch the payment's status first.

## 5. Data integrity

What's done well:
- Money moves are atomic and version-bumped.
- Payment status is always worked out from the amounts.
- Unique indexes on Razorpay payment, refund and webhook IDs, and on idempotency keys.
- Optimistic locking on orders, and a version conflict is returned as an error (handled in `error-handler.ts`).
- Totals come only from the server.
- Invoice numbers are permanent and in sequence.

Risks:
- Multi-step operations without a transaction: F4, and cancel-then-refund. Cancel-then-refund is recoverable because refunds can be retried.
- F6 (timezone).

## 6. Missing tests

- F1: payment confirmed by webhook after the window closed, then checkout again.
- F2: customer notified after a late payment.
- F3: refund through status change without the permission.
- F4: cash recorded when a handover is retried.
- Pickup handover with cash (only delivery cash is tested).
- Website end-to-end tests: none exist. All 96 tests are backend tests.

## 7. Is it production-ready?

The money core (pricing, recording payments, refunds, webhooks, rechecking with Razorpay) is built carefully and tested well above average.

- **Should fix before taking real online payments:** F1.
- **Fix soon:** F2 and F3.
- **Not a code bug:** the Razorpay keys in your local `.env` are currently rejected by Razorpay. That needs fixing before you can test payments end to end.

**Not reviewed yet:**
- sign-in, OTP and sessions
- rate limiting
- upload storage and access beyond file ownership
- school bulk/roster
- stock
- notification delivery
- marketing and reports
- admin pages other than orders
- deployment config

I won't call the whole application audited until those are covered.

## 8. Suggested fix order

1. **F1:** persist the checkout key, check with Razorpay when the payment window closes, treat a paid replay as success. Also covers F5.
2. **F3:** permission check on cancel-with-refund.
3. **F2:** notify the customer when a late payment brings the order back.
4. **F4:** record cash when a handover is retried.
5. **F6:** set the timezone to IST.
6. Add a regression test for each fix, then run the full backend suite.

Do you want me to go ahead with fixes 1–4, with tests? I won't change code until you say so. I can also publish this report as a page you can share.



## Task list

**F1: a payment that confirms late must never lead to a second charge**
- **T1 (backend)** `POST /payments/razorpay/check`: the order's owner can ask the server to check with Razorpay right now. It returns the order's latest status and payment.
- **T2 (website)** When the payment window is closed, or the verify call fails, call the check before saying "not completed". If the money arrived, finish as a successful order.
- **T3 (website)** Keep the checkout key with the cart and with "Order again", so a retry after leaving the page reuses the same checkout. It resets whenever the items change.
- **T4 (website, also F5)** A retry that returns an order with nothing left to pay counts as "order placed". Don't open Razorpay again.

**Other fixes**
- **T5 (F2, backend)** Tell the customer when a late payment brings their order back.
- **T6 (F3, backend)** Refunding by cancelling needs the "refunds" permission.
- **T7 (F4, backend)** A repeated handover records cash that wasn't recorded the first time.
- **T8 (F6, backend)** Order-number dates and working-day due dates use IST.
- **T9 (F7, docs)** Note in `.env.example` that Razorpay must auto-capture payments.

**Verification**
- **T10** Regression tests for T1, T5, T6, T7 and T8.
- **T11** Typecheck all three apps and run the full backend suite.

Starting with T1.