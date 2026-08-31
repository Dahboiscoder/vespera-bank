# Vespera Bank — Advanced Banking Simulated Platform

Vespera Bank is an original financial-services web application. It is inspired by the structure and professionalism of modern banking websites, but it does **not** copy, impersonate, or represent any real bank.

## Run

```bash
npm install
npm run dev
```

The application runs on port `3000`.

## Public routes

- `/` — premium homepage
- `/register` — customer registration
- `/login` — customer login
- `/dashboard` — protected customer dashboard
- `/fx` — public currency exchange converter with **Platform rate** labels
- `/personal`, `/business`, `/accounts`, `/savings`, `/cards`, `/loans`, `/transfers`, `/security`, `/about`, `/contact`, `/help`

## Private admin routes

The admin portal is intentionally not linked from public navigation.

- `/admin/login` — private admin login
- `/admin/dashboard` — admin dashboard
- `/admin/users` — user management
- `/admin/balances` — balance control
- `/admin/exchange-rates` — platform rate management
- `/admin/rate-history` — exchange-rate history
- `/admin/audit-logs` — audit trail

## Simulated credentials

Customer account:

```text
customer@novacapital.test
Customer#2026!
```

Admin credentials are loaded server-side from environment variables:

```bash
NOVA_ADMIN_EMAIL=admin@novacapital.test
NOVA_ADMIN_PASSWORD=Admin#2026!
```

For local convenience, those same values are used as development defaults when the variables are not set. They are not exposed in frontend JavaScript.

## Security features

- Bcrypt password hashing
- Separate customer and admin sessions
- Signed HttpOnly cookies
- CSRF protection
- RBAC permissions including `balances.adjust`, `rates.manage`, `users.manage`, and `audit.view`
- Server-side validation with Zod
- Parameterized SQL queries
- Rate limiting
- Helmet, CSP, and HSTS headers
- Audit logging for sensitive operations
- Balance adjustment history

## Important platform behavior

- Newly registered users start with exactly `$0.00`
- Users cannot change their own balances or transactions
- Only authorized admins can adjust account balances
- Every balance adjustment creates:
  - a transaction record
  - a balance-adjustment history record
  - an audit-log record
- FX values are manually configured **Platform rates**, not live or official market data

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run security:test
```

## Google OAuth configuration

Google sign-in uses the real Google OAuth 2.0 / OpenID Connect authorization-code flow. It does not create a local session until Google redirects back to the server callback and the backend validates the ID token.

Set these in the `.env` file at the project root (loaded automatically via `dotenv`, so credentials persist across restarts regardless of shell session) rather than exporting them in your terminal.

Required server-side environment variables:

- `GOOGLE_CLIENT_ID` — OAuth 2.0 Client ID from Google Cloud Console.
- `GOOGLE_CLIENT_SECRET` — OAuth 2.0 Client Secret from Google Cloud Console. Keep this server-side only.
- `GOOGLE_REDIRECT_URI` — optional explicit callback URL. If omitted, the app uses `https://<current-host>/auth/google/callback` or the current request host with `/auth/google/callback`.
- `GOOGLE_OAUTH_PROMPT` — optional, defaults to `select_account`.

Google Cloud Console setup:

1. Create or select a Google Cloud project.
2. Configure the OAuth consent screen.
3. Create an OAuth client of type Web application.
4. Add the app callback as an authorized redirect URI, for example:
   - Development: `http://localhost:3000/auth/google/callback`
   - Production: `https://YOUR-DOMAIN/auth/google/callback`
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the server environment.

If credentials are missing, `/auth/google` fails safely by returning the user to sign-in with a configuration notice. It never creates a customer session or signs in an unverified Google account.
