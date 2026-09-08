# Rebuild Prompt — Simulated Banking Platform

This document is a self-contained prompt. If this project is ever lost, and you want
to recreate it (with the same brand, or a new one), paste **Section 1** as your
opening message to a fresh Claude Code session, then hand over the rest of this file
as follow-up context whenever it asks for detail. Everything after Section 1 is the
detailed spec that backs it up.

---

## Section 1 — The Kickoff Prompt (paste this to start)

> Build me a full-stack simulated retail + business banking web application called
> "[YOUR BRAND NAME]". It must be an original, fictional financial-services brand —
> it should not copy, impersonate, or claim affiliation with any real bank. It is a
> **simulation/demo platform**: no real money ever moves, there is no real payment
> rail in production use, and this must be stated explicitly somewhere in the app
> (footer or a disclosures page).
>
> Build it as a single Node.js + Express server that renders all HTML server-side
> from template-literal functions (no React/Vue/frontend framework, no build step) —
> one `server.js`, one `public/styles.css`, one `public/app.js`. Use PostgreSQL for
> storage. Give it three distinct experiences: (1) a public marketing site for
> logged-out visitors, (2) an authenticated customer web-app dashboard, and (3) a
> separate, unlinked admin console with role-based access control.
>
> I want the full feature set of a real bank's digital platform — accounts,
> transfers, cards, loans, bill pay, savings goals, KYC, 2FA, an AI support widget —
> plus a serious admin back office that can review KYC, adjust balances with full
> audit trails, manage fraud flags, and never let a customer touch their own balance
> directly. Follow the detailed spec below for the full feature list, schema shape,
> security conventions, and deployment playbook. Ask me for a brand name, primary
> color, and domain name before you start, then go build it — don't just plan, keep
> shipping working code and let me react to it as you go.

---

## Section 2 — Product Vision

A simulated, portfolio/demo-grade digital bank: a marketing site that looks and
reads like a real regional/private bank, an authenticated customer dashboard with
the depth of a real online banking app, and an internal admin console with
enterprise-style RBAC, audit logging, and financial controls. The entire point is
realism of structure and UX without being (or claiming to be) a real financial
institution — money in this system is fictional, seeded/adjusted only by admins,
and the app should say so plainly.

This exact codebase has been rebranded twice already (originally "Nova Capital",
then "Vespera Bank", now "Meridian Private & Co") — renaming is a known, recurring
operation here: it touches the HTML `<title>`s, the header/footer brand strings, the
seeded admin's org name, e-mail templates, the README, and the custom domain. If
you're starting fresh, just pick one name and go; if you're rebranding an existing
build, grep the whole repo for the old name (including inside HTML title strings and
copyright lines) rather than trusting a single find/replace pass.

## Section 3 — Tech Stack

- **Runtime**: Node.js, `"type": "module"` in package.json (ESM).
- **Server**: Express, single monolithic `server.js` (this build is ~4,500 lines —
  that's fine; don't split it prematurely into microservices or a dozen route
  files. A few hundred route handlers and helper functions in one file, organized
  by clearly-commented sections, is the established convention here).
- **Rendering**: no templating engine, no frontend framework. HTML is built with
  plain JS template literals returned from functions like `publicPage(title, body,
  req)`, `customerShell(...)`, `adminShell(...)`. Client-side interactivity is a
  single `public/app.js` (vanilla JS, no bundler). All styling lives in one
  `public/styles.css` (mobile breakpoints via `@media(max-width:760px)` etc., no
  CSS framework).
- **Database**: PostgreSQL via the `pg` package (raw parameterized SQL, no ORM).
  Neon (serverless Postgres) is a good managed-Postgres choice if deploying to
  Vercel, since Vercel has no persistent compute of its own.
- **Auth**: `bcryptjs` for password hashing, HttpOnly signed cookies for sessions
  (`cookie-parser` + `SESSION_SECRET`), CSRF tokens on state-changing admin routes,
  `express-rate-limit`, `helmet` for CSP/HSTS/security headers.
- **Validation**: `zod` for server-side input validation.
- **Email**: `resend` package for transactional email (OTP codes, password resets,
  transfer/receipt notifications).
- **SMS/OTP**: `twilio` for phone verification codes.
- **AI**: Gemini API (`GEMINI_API_KEY`) powering an in-app support chat widget with
  a configurable system prompt/FAQ content, stored in an `ai_settings` table so
  admins can edit the assistant's behavior without a redeploy.
- **File uploads**: `multer` (used for KYC document photos, avatar-style uploads).
- **Deploy target**: Vercel (serverless functions) — see Section 6 for the specific
  gotchas of deploying this kind of app there.
- **Tests**: no test framework dependency — plain Node scripts under `tests/`, each
  a self-contained scenario (spin up the app, hit routes with `fetch`, assert on
  responses/DB state), run in sequence via `npm test`. `playwright` is available for
  browser-driven visual QA (screenshots at multiple breakpoints) but isn't part of
  the main `npm test` chain.

## Section 4 — Architecture Conventions

- **Three shells**: `publicPage()`/`publicHeader()` for the logged-out marketing
  site; a customer shell (top nav + a mobile-only fixed bottom tab bar, see below)
  for the authenticated dashboard; an admin shell with its own nav for
  `/admin/*`. Never mix these — every route should be obviously "public",
  "customer", or "admin" by which shell/middleware it uses.
- **`pageFactory()`-style helpers**: repetitive marketing pages (Accounts, Savings,
  Cards, Loans, Business, etc.) are generated from a small data-driven factory
  rather than hand-writing near-identical HTML per page.
- **Auth middleware**: separate `custAuth`/`adminAuth` middleware — a customer
  session must never be treated as valid for an admin route and vice versa. Admin
  routes additionally check specific permission strings (see RBAC below), not just
  "is an admin".
- **RBAC**: `roles`, `permissions`, `role_permissions` tables plus a flat
  `adminPerms` array of every known permission string (e.g. `users.manage`,
  `balances.adjust`, `kyc.manage`, `audit.view`, `fees.manage`,
  `transactions.approve`). Every sensitive admin action checks a specific
  permission, not just "logged in as some admin".
- **Audit trail as a first-class citizen**: any balance change or transaction
  correction must write to *three* places atomically — the transaction/ledger
  table itself, a dedicated history table (e.g. `balance_adjustments`,
  `transaction_corrections`), and `audit_logs`. Never mutate a balance in place
  without all three.
- **Admin panel is unlinked, not just unauthenticated** — don't put a "staff login"
  link in the public nav; it's reached by direct URL only.
- **Icons/branding**: a single inline SVG "mark" (shield/crest shape) reused as the
  favicon, apple-touch-icon, and header logo — generate PNG variants from one SVG
  source (e.g. with `sharp-cli`) rather than hand-crafting multiple icon files.

## Section 5 — Feature List

**Public marketing site** (all under `publicPage()`): homepage with hero/product
grid, `/personal`, `/business`, `/accounts`, `/savings`, `/cards`, `/loans`,
`/transfers`, `/fx` (a rate converter, clearly labeled "Platform rate", not live
market data), `/about`, `/news`, `/contact`, `/help`, `/security`,
`/privacy`, `/terms`, a disclosures page, `/register`, `/login`, `/admin/login`
(unlinked). Mobile gets a fixed bottom tab bar (Home/Personal/Business/Help/Sign In)
in addition to a hamburger drawer for the full detailed menu — the tab bar is quick
top-level navigation, the drawer is the exhaustive menu; both coexist. Add
`apple-mobile-web-app-capable`/`mobile-web-app-capable` meta tags and a real
favicon/apple-touch-icon so "Add to Home Screen" launches full-screen like a native
app.

**Customer auth**: OTP-based registration/login (email or SMS code via
Twilio/Resend), optional Google Sign-In (real OAuth 2.0 authorization-code flow,
ID-token validated server-side, redirect URI auto-derived from the request host so
it works across domains without hardcoding), optional 2FA.

**Customer dashboard**: multiple accounts per user, transfers (internal + external,
with beneficiaries and standing orders), cards (virtual card issuance/controls),
bills (billers, saved billers, scheduled bill payments), loans (apply, view
schedule, make payments), grants (apply to a "program", admin-reviewed), savings
goals, referrals, statements (generate/download), currency swap (against
admin-managed `exchange_rates`), a transaction PIN for sensitive actions, KYC
submission (name/DOB/ID type+number/address + photo upload), and a live support
widget that's AI-first (Gemini-backed, configurable via `ai_settings`) with
escalation to a human agent (`support_conversations`/`support_messages`).

**Admin console**: dashboard/overview, user management (view/suspend/edit), KYC
review queue (approve/reject with reason), fraud review, balance
adjustments (with mandatory reason + full audit trail), transaction
corrections/reversals, exchange-rate management + rate history, fee management,
service controls (feature kill-switches, e.g. disable a payment rail without a
deploy), transaction limits config, admin user management (create other admins,
assign roles), audit log viewer, and a bulk "generate transactions" tool for
seeding realistic-looking history on demo accounts (tracked via
`generation_jobs` so long-running generation is resumable/inspectable).

**Payment provider abstraction**: don't hardcode one payment rail. Build a provider
interface with at least one mock/sandbox implementation (for demo mode) and the
ability to wire in real sandbox providers per region/currency (this build used
Paystack and MTN MoMo sandboxes for African mobile money as an example) — report
provider status **per currency**, not as one global up/down flag, and support
on-demand status refresh for pending deposits/withdrawals rather than only polling.

## Section 6 — Security & Compliance Conventions

- Newly registered users start at exactly `$0.00`. There is no self-service way to
  add funds — only an admin balance adjustment (with reason, logged) can change a
  balance.
- Bcrypt for all password hashing (cost factor 12 in this build).
- Parameterized SQL everywhere — never string-concatenate user input into a query.
- CSRF tokens on admin state-changing routes; rate limiting on auth endpoints;
  Helmet with a real CSP (script-src 'self', no inline scripts, etc.), HSTS.
- Server-side Zod validation on every mutating endpoint — don't trust client-side
  validation alone.
- **Never rely on a randomly-generated fallback secret in a serverless
  environment.** If your admin bootstrap logic does something like
  `process.env.ADMIN_PASSWORD || generateRandomSecret()`, that's a real bug the
  moment you deploy to a platform (Vercel, etc.) whose functions cold-start
  repeatedly — the "fallback" can silently mint a new, unknown password on a cold
  start, potentially locking you out of your own admin panel with no way to
  recover it except a direct database password reset. Always set real, fixed admin
  credentials as platform environment variables before going live, and make the
  cold-start warning loud (`console.warn`) so it's impossible to miss in logs if it
  ever does trigger.

## Section 7 — Database Schema (table inventory)

Don't treat this as literal DDL to copy — treat it as the list of concerns the
schema needs to cover; design the actual columns/constraints as you build. Grouped
by domain, from this build's actual schema (48 tables):

- **Identity/auth**: `users`, `sessions`, `verification_codes`, `admin_users`,
  `admin_sessions`, `roles`, `permissions`, `role_permissions`, `user_controls`
- **Money/accounts**: `accounts`, `transactions`, `transaction_events`,
  `transaction_corrections`, `transaction_limits`, `balance_adjustments`,
  `exchange_rates`, `rate_history`, `fees`, `fee_history`, `financial_products`
- **Transfers/payments**: `transfers`, `transfer_events`, `transfer_notifications`,
  `standing_orders`, `beneficiaries`, `vendors`, `vendor_payments`,
  `scheduled_vendor_payments`, `billers`, `saved_billers`, `bill_payments`,
  `scheduled_bill_payments`, `provider_events`
- **Products**: `cards`, `loans`, `loan_payments`, `grant_applications`,
  `savings_goals`, `referrals`
- **Compliance/admin ops**: `kyc_submissions`, `admin_notes`, `audit_logs`,
  `service_controls`, `generation_jobs`
- **Support/AI**: `support_tickets`, `support_conversations`, `support_messages`,
  `ai_settings`, `notifications`

## Section 8 — Deployment Playbook (hard-won lessons)

If deploying to **Vercel** with a custom domain bought at **Namecheap**, in order:

1. Get the app running and pushed to a GitHub repo first; import it into Vercel as
   a new project. Configure `DATABASE_URL` and every other secret in Vercel's
   Environment Variables **before** first deploy, not after — see the admin
   password warning in Section 6.
2. In Vercel → Domains, add your domain. It'll typically want the root domain to
   redirect (308) to `www`, and ask for two separate DNS records: an **A record**
   on `@` pointing at Vercel's IP, and a **CNAME** on `www` pointing at a
   `*.vercel-dns-*.com` target. Add **both** — the root-only setup is not enough by
   itself if Vercel has set it up as "root redirects to www".
3. Add those records in Namecheap under Advanced DNS → Host Records. If asked for
   an MX record anywhere in this process (e.g. for a mail-sending domain
   verification, not for Vercel itself), Namecheap hides the option behind a
   **separate "Mail Settings" dropdown** near the top of the same page — it must be
   switched to **"Custom MX"** before a plain MX record row becomes available in
   the host records table below.
4. DNS propagation is real but usually fast (minutes, not hours) *once the config
   is actually correct*. If a domain sits at "Valid Configuration" in the Vercel
   dashboard for an unusually long time while the site still won't load over
   plain HTTP (not just HTTPS — test both, since an HTTP-only timeout rules out
   "it's just slow cert issuance" as the explanation), that's a known Vercel quirk
   where the domain shows valid without routing actually being live. Fix: remove
   the domain from the Vercel project and re-add it (same DNS records, no changes
   needed at the registrar) — this forces re-provisioning and usually resolves it
   within a few minutes.
5. For transactional email, verify the domain with your email provider (this build
   uses Resend). Resend's API (`POST https://api.resend.com/domains`) returns the
   exact DKIM/SPF records to add — no need to click through their dashboard if you
   already have an API key; you can register the domain and read back the DNS
   records programmatically. Records typically needed: a DKIM **TXT** record
   (`resend._domainkey`), an **MX** record on a subdomain like `send` (subject to
   the same Namecheap "Custom MX" gotcha above), and an SPF **TXT** record on that
   same subdomain. Poll `GET /domains/{id}` (or `POST /domains/{id}/verify` to
   force a check) until `status` flips from `pending` to `verified` — this can take
   anywhere from minutes to a couple of hours for newer domains; it's normal for it
   to sit on `pending` for a while even with correct records.
6. For Google Sign-In, no code changes are needed per-domain if the redirect URI is
   derived from the request host at runtime (see Section 4). Just add
   `https://your-domain/auth/google/callback` to the OAuth Client's **Authorized
   redirect URIs** in Google Cloud Console.

## Section 9 — Testing

Keep a `tests/` directory of small, focused, self-contained Node scripts (one file
per feature area — auth/nav, admin RBAC, admin money-math, transfers, cards, loans,
grants, 2FA, KYC, currency swap, statements, referrals, transaction generation,
live support, security) chained together behind `npm test`. Each script should be
able to run against a fresh local dev server and assert on both HTTP responses and
resulting DB state, not just status codes. Keep `npm run lint` and
`npm run typecheck` (using `tsc --noEmit --allowJs` against plain JS, no actual
TypeScript migration needed) clean as you go rather than letting warnings pile up.
