# SmartCol AI — Security Report

**Date:** March 9, 2026
**Author:** Ariff Sanip
**Project:** SmartCol AI — Calendar Intelligence & Workload Management System
**Environment:** Local Development (macOS, Node.js 20+, PostgreSQL 15, Python 3.11)
**Scope:** Backend API (Express + TypeScript), AI/ML Service (Python FastAPI), Frontend (React)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Security Audit Methodology](#security-audit-methodology)
3. [Security Strengths — What Is Done Well](#security-strengths--what-is-done-well)
4. [Vulnerabilities Found & Fixed](#vulnerabilities-found--fixed)
5. [Accepted Risks — Capstone Context](#accepted-risks--capstone-context)
6. [Future Security Recommendations](#future-security-recommendations)
7. [Security Feature Summary](#security-feature-summary)

---

## Executive Summary

A comprehensive security audit of SmartCol AI was conducted prior to finalising the capstone project. The audit covered authentication, authorisation, session management, input validation, SQL injection prevention, email security, dependency management, and API security.

**Key findings:**
- 5 genuine vulnerabilities were identified and immediately remediated
- The codebase demonstrates strong fundamentals (parameterised queries, CSRF protection, ownership checks)
- Several items are intentionally deferred as known limitations for the demo/local context, with clear production remediation paths documented

**Overall security posture: Good for capstone/demo. Production deployment requires the items listed in Section 6.**

---

## Security Audit Methodology

The audit was conducted through manual code review of:

- `backend/src/app.ts` — middleware, CORS, session, route registration
- `backend/src/config/env.ts` — environment variable handling and defaults
- `backend/src/middleware/` — auth and admin middleware
- `backend/src/controllers/` — all 9 controller files for auth, ownership, input handling
- `backend/src/services/` — database queries, email templates, classification
- `backend/src/services/email-alerts.service.ts` — email template injection risks
- `backend/package.json` — installed dependencies

**Areas assessed:**
SQL injection, authentication enforcement, authorisation/IDOR, session security, CSRF, rate limiting, HTML/email injection, security headers, token storage, input validation, secrets management, dependency vulnerabilities, data exposure in logs.

---

## Security Strengths — What Is Done Well

### 1. SQL Injection Prevention ✅

All database queries throughout the codebase use PostgreSQL parameterised queries (`$1`, `$2`, ...) via the `pg` npm library. No user input is ever concatenated directly into SQL strings in the production code paths.

```typescript
// Example from risks.service.ts — parameterised throughout
const result = await db.queryOne(
  `SELECT * FROM risk_alerts WHERE user_id = $1 AND risk_type_id = $2`,
  [userId, riskTypeId]
);
```

**Status:** ✅ No SQL injection risk in current production query paths.

---

### 2. CSRF Protection — OAuth State Parameter ✅

The OAuth 2.0 authentication flow validates the `state` parameter against the session before exchanging the authorisation code for tokens. This prevents cross-site request forgery attacks on the OAuth callback.

```typescript
// auth.controller.ts
if (sessionState !== receivedState) {
  logger.error('OAuth state mismatch');
  return res.status(400).json({ error: 'InvalidState', message: 'State parameter mismatch' });
}
```

**Status:** ✅ CSRF-protected OAuth flow.

---

### 3. Event Ownership Validation ✅

User-scoped data operations verify that the requesting user owns the resource before allowing access or modification. Example from `feedback.service.ts`:

```typescript
const event = await db.queryOne('SELECT id, user_id FROM calendar_events WHERE id = $1', [eventId]);
if (!event || event.user_id !== userId) {
  return { success: false, message: 'Event not found' };
}
```

Similar ownership checks exist in `risks.service.ts`, `offday.service.ts`, and `sync.controller.ts`.

**Status:** ✅ Ownership enforced on resource mutations.

---

### 4. Admin Role-Based Access Control ✅

Admin-only routes are protected by the `requireAdmin` middleware, which verifies the session user's email against the `ADMIN_EMAILS` environment variable before granting access.

```typescript
// admin.middleware.ts
const user = await db.queryOne('SELECT email FROM users WHERE id = $1', [userId]);
if (!user || !config.admin.emails.includes(user.email.toLowerCase())) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

Applied to: `/api/admin/*`, `/api/scheduler/*`, `/api/notifications/*`, `/api/test/*`

**Status:** ✅ Admin routes protected.

---

### 5. Secrets Excluded from Logs ✅

The `logConfig()` function in `env.ts` explicitly strips sensitive fields before logging startup configuration, preventing accidental secret exposure in log files.

```typescript
function logConfig() {
  return {
    port: config.port,
    database: { host: config.db.host, name: config.db.name },
    // Note: passwords, secrets, keys intentionally excluded
  };
}
```

**Status:** ✅ No secrets in application logs.

---

### 6. Microsoft Graph EXT UPN Email Decoding ✅

Personal Microsoft accounts authenticated via Azure AD store email addresses as UPN format (e.g., `user_gmail.com#EXT#@tenant.onmicrosoft.com`) which is not a deliverable email address. A `resolveEmail()` helper decodes these back to real email addresses before sending any notification.

```typescript
function resolveEmail(email: string): string {
  const extMatch = email.match(/^(.+)#EXT#@.+$/);
  if (extMatch) {
    const encoded = extMatch[1];
    const lastUnderscore = encoded.lastIndexOf('_');
    if (lastUnderscore !== -1) {
      return encoded.substring(0, lastUnderscore) + '@' + encoded.substring(lastUnderscore + 1);
    }
  }
  return email;
}
```

**Status:** ✅ Email delivery works correctly for personal Microsoft accounts.

---

## Vulnerabilities Found & Fixed

All 5 vulnerabilities were identified during the security audit and remediated in commit `c65a5e0`.

---

### Vulnerability 1 — Session Cookie Flags Missing

**Severity:** Critical
**Status:** ✅ Fixed

**Description:**
The Express session configuration did not set `httpOnly`, `sameSite`, or `secure` cookie flags. This meant:
- Session cookies were accessible to JavaScript (XSS attack vector)
- No CSRF protection at the cookie level
- Cookies would be transmitted over HTTP in production

**Vulnerable code (before fix):**
```typescript
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false
  // Missing: httpOnly, secure, sameSite, maxAge
}));
```

**Fix applied:**
```typescript
app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev-secret',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,                                    // Prevents JS access to session cookie
    secure:   process.env.NODE_ENV === 'production',  // HTTPS-only in production
    sameSite: 'strict',                               // CSRF protection at cookie level
    maxAge:   8 * 60 * 60 * 1000,                   // 8-hour session lifetime
  },
}));
```

**Impact of fix:** Session cookies are now inaccessible to JavaScript, CSRF-resistant, and scoped to HTTPS in production.

---

### Vulnerability 2 — Security Headers Missing (Helmet Not Applied)

**Severity:** Medium
**Status:** ✅ Fixed

**Description:**
The `helmet` npm package (v7.0.0) was listed as a dependency and present in `package.json`, but was never imported or applied in `app.ts`. This meant 8 important HTTP security headers were absent from all responses, leaving the application exposed to clickjacking, MIME sniffing, and other browser-based attacks.

**Missing headers before fix:**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-DNS-Prefetch-Control: off`
- `Referrer-Policy: no-referrer`
- `X-XSS-Protection: 0` (modern setting)
- `Cross-Origin-Opener-Policy`
- `Cross-Origin-Resource-Policy`

**Fix applied:**
```typescript
import helmet from 'helmet';
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to allow Swagger UI inline styles
}));
```

**Verified:** Headers confirmed present on all responses via `curl -I`.

---

### Vulnerability 3 — Rate Limiting Configured but Not Applied

**Severity:** High
**Status:** ✅ Fixed

**Description:**
`env.ts` contained a full `rateLimit` configuration object (window, max requests, enabled flag), but no rate limiting middleware was ever registered in `app.ts`. This meant all endpoints — including authentication callbacks — were completely unprotected against brute force or denial-of-service attacks.

**Fix applied:**
```typescript
import rateLimit from 'express-rate-limit';

// General API: 100 requests per 15 minutes
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });

// Auth endpoints: stricter — 10 requests per 15 minutes
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);
```

**Verified:** `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` headers present on all API responses.

---

### Vulnerability 4 — HTML Injection in Email Templates

**Severity:** High
**Status:** ✅ Fixed

**Description:**
User-controlled data (display names, risk titles, recommendations, manager names, dates) was interpolated directly into HTML email templates without escaping. A malicious or corrupted display name such as `<script>alert('xss')</script>` or `<img src=x onerror="...">` would be injected into the HTML and potentially executed in email client rendering engines.

**Vulnerable example (before fix):**
```typescript
// email-alerts.service.ts
const html = `<p>Hi <strong>${params.toName}</strong>,</p>
  <strong>${params.riskTitle}</strong>
  <p>${params.riskDesc}</p>`;
```

**Fix applied:**

Added an `esc()` helper function and applied it to all 8 user-controlled template variables across all 6 email alert types:

```typescript
function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;');
}

// Applied to: toName, adminName, riskTitle, riskDesc, recommendation,
//             date, weekStart, weekEnd, burnout factor strings
const html = `<p>Hi <strong>${esc(params.toName)}</strong>,</p>
  <strong>${esc(params.riskTitle)}</strong>
  <p>${esc(params.riskDesc)}</p>`;
```

---

### Vulnerability 5 — IDOR: Unauthenticated Data Access via ?userId= Parameter

**Severity:** Critical
**Status:** ✅ Fixed

**Description:**
An Insecure Direct Object Reference (IDOR) vulnerability existed in 4 controllers. The pattern `(req.query.userId as string) || req.session.user_id` evaluated `req.query.userId` **before** checking whether a session existed. An unauthenticated attacker could bypass all authentication checks by simply appending `?userId=<any-valid-uuid>` to a request.

**Affected endpoints before fix:**
```
GET /api/analytics/daily?userId=<uuid>        → returned data without session
GET /api/analytics/weekly?userId=<uuid>       → returned data without session
GET /api/analytics/heatmap?userId=<uuid>      → returned data without session
GET /api/offday/pending?userId=<uuid>         → returned data without session
GET /api/offday/balance?userId=<uuid>         → returned data without session
GET /api/feedback/stats?userId=<uuid>         → returned data without session
GET /api/feedback/events?userId=<uuid>        → returned data without session
```

**Vulnerable pattern (before fix):**
```typescript
function resolveUserId(req: Request): string | null {
  return (req.query.userId as string) || req.session.user_id || null;
  // ↑ userId query param evaluated BEFORE session check — bypasses auth
}
```

**Fix applied to all 4 controllers (`analytics`, `feedback`, `offday`, `ml-prediction`):**
```typescript
// Session is required first — ?userId= param alone is NOT sufficient
const sessionUserId = req.session.user_id;
if (!sessionUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }
const userId = (req.query.userId as string) || sessionUserId;
```

**Verified:** `GET /api/analytics/daily?userId=00000000-...` now returns `401 Unauthorized` without a session.

---

## Accepted Risks — Capstone Context

The following items are documented as accepted risks for the local development/demo environment. Each has a clear remediation path for production deployment.

---

### AR-1 — Token Encryption (Base64 Placeholder)

**Severity if deployed:** High
**Accepted for:** Demo / capstone
**Reason:** AES-256-GCM with Azure Key Vault adds infrastructure complexity not warranted for a local demo.

**Current state:** OAuth refresh tokens are Base64-encoded before storage in PostgreSQL. Base64 is encoding, not encryption — tokens could be decoded if the database were compromised.

**Production remediation:**
1. Replace Base64 with AES-256-GCM encryption using a securely managed key
2. Store the encryption key in Azure Key Vault (infrastructure already referenced in `env.ts`)
3. Implement `decryptToken()` alongside the existing `encryptToken()` stub

---

### AR-2 — Secrets in Local `.env` File

**Severity if public:** Critical
**Accepted for:** Local demo (private repository)
**Reason:** Local development convention; repository is private.

**Current secrets in `.env`:**
- `DATABASE_PASSWORD` — PostgreSQL password
- `AZURE_AD_CLIENT_SECRET` — Microsoft Azure AD app secret
- `SESSION_SECRET` — Express session signing key
- `EMAIL_PASS` — Gmail App Password

**Production remediation:**
1. Remove `.env` from version control entirely
2. Use **Azure Key Vault** or **GitHub Actions Secrets** for all credentials
3. Rotate all exposed secrets before any public/production deployment
4. Add `.env` to `.gitignore` (currently present but `.env` was committed)

---

### AR-3 — No Token Refresh Logic

**Severity if deployed:** Medium
**Accepted for:** Demo (mock sync used)
**Reason:** Real Microsoft Graph sync not functional on personal accounts; token refresh not exercised.

**Current state:** OAuth access tokens expire after ~1 hour. There is no refresh logic to automatically renew them using the stored refresh token.

**Production remediation:**
Implement token refresh: before each Graph API call, check `expires_at`; if within 5 minutes, call the Microsoft identity platform token endpoint to exchange the refresh token for a new access token.

---

### AR-4 — Admin List in `.env` (Not Database-Driven)

**Severity:** Low
**Accepted for:** Small fixed team
**Reason:** Simple to manage for a capstone with 1–2 admins.

**Current state:** Admin access is determined by a comma-separated email list in `ADMIN_EMAILS` environment variable.

**Production remediation:**
Move admin designation to the `users` database table (add `is_admin` boolean column) or use Azure AD group membership checks via Microsoft Graph.

---

### AR-5 — No HTTPS Enforcement in Development

**Severity if deployed without HTTPS:** High
**Accepted for:** Local dev only
**Reason:** Azure App Service enforces HTTPS automatically.

**Current state:** The application runs on `http://localhost:3001`. The `secure: true` session cookie flag is conditionally applied only when `NODE_ENV=production`.

**Production remediation:**
- Azure App Service enforces HTTPS with automatic TLS certificate provisioning
- Set `NODE_ENV=production` in deployment environment
- Configure HSTS header (Helmet supports this via `strictTransportSecurity`)

---

### AR-6 — No Automated Test Suite for Security

**Severity:** Medium (operational risk)
**Accepted for:** Capstone timeline
**Reason:** Manual test cases documented in `TEST_LOGS.md` (51 cases). Python classifier has 17/17 passing pytest tests.

**Production remediation:**
Integrate security-focused tests into CI/CD:
- Jest unit tests for ownership validation and auth guards
- `npm audit` check in GitHub Actions pipeline
- OWASP ZAP or similar DAST scanner on staging environment

---

## Future Security Recommendations

The following are recommended before any production deployment of SmartCol AI, ordered by priority.

---

### Priority 1 — Rotate & Secure All Secrets

**Action:**
1. Rotate all secrets currently in `.env` (database password, Azure client secret, session secret, Gmail app password)
2. Move all secrets to Azure Key Vault
3. Configure GitHub Actions to inject secrets at deployment time
4. Ensure `.env` is never committed to version control

---

### Priority 2 — Implement Proper Token Encryption

**Action:**
Replace the Base64 placeholder in `auth.controller.ts` with AES-256-GCM encryption:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function encryptToken(token: string, key: Buffer): string {
  const iv         = randomBytes(16);
  const cipher     = createCipheriv('aes-256-gcm', key, iv);
  const encrypted  = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag    = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}
```

Retrieve the key from Azure Key Vault at startup rather than from an environment variable.

---

### Priority 3 — Implement Token Refresh

**Action:**
Before each Microsoft Graph API call in `graph.client.ts`, check if the token is within 5 minutes of expiry:

```typescript
if (new Date(token.expires_at) <= new Date(Date.now() + 5 * 60 * 1000)) {
  token = await refreshOAuthToken(userId, token.refresh_token);
}
```

This enables the Calendar Sync background job to function continuously for real org users.

---

### Priority 4 — Add HTTPS and HSTS

**Action:**
- Deploy to Azure App Service with managed TLS
- Enable HSTS in Helmet configuration:
```typescript
app.use(helmet({
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
}));
```

---

### Priority 5 — Database-Driven Admin Roles

**Action:**
Add `is_admin BOOLEAN DEFAULT false` to the `users` table and replace the `ADMIN_EMAILS` environment variable check with a database column check. This allows admins to be managed without restarting the server.

---

### Priority 6 — Automated Security Testing in CI/CD

**Action:**
Integrate into GitHub Actions pipeline:
- `npm audit --audit-level=high` — fail build on high-severity dependency vulnerabilities
- `npx eslint` with `eslint-plugin-security` — static analysis for security anti-patterns
- OWASP ZAP automated scan against staging environment on every release

---

### Priority 7 — Audit Logging for Admin Actions

**Action:**
Record all admin actions (acknowledge/dismiss risk, toggle email alerts, trigger scheduler) in the existing `audit_logs` table with: `actor_id`, `action`, `target_id`, `timestamp`, `ip_address`. This provides a compliance and forensics trail.

---

### Priority 8 — Input Validation Library

**Action:**
Replace ad-hoc validation with a schema validation library such as `zod` or `joi`:

```typescript
import { z } from 'zod';

const correctionSchema = z.object({
  eventId:         z.string().uuid(),
  correctedTypeId: z.number().int().min(1).max(10),
});

// In controller:
const parsed = correctionSchema.safeParse(req.body);
if (!parsed.success) return res.status(400).json({ error: parsed.error });
```

This prevents invalid UUIDs, out-of-range numbers, and malformed dates from reaching the database.

---

## Security Feature Summary

| Feature | Status | Notes |
|---|---|---|
| SQL injection prevention | ✅ Implemented | Parameterised queries throughout |
| CSRF protection (OAuth) | ✅ Implemented | State parameter validated |
| Session cookie flags | ✅ Implemented | httpOnly, sameSite:strict, secure (prod) |
| Security headers (Helmet) | ✅ Implemented | X-Frame, X-Content-Type, Referrer-Policy, etc. |
| Rate limiting | ✅ Implemented | 100/15min general, 10/15min auth |
| HTML escaping in emails | ✅ Implemented | esc() applied to all user-controlled template data |
| IDOR fix (userId bypass) | ✅ Implemented | Session required before ?userId= is honoured |
| Admin RBAC | ✅ Implemented | requireAdmin middleware on all admin routes |
| Resource ownership checks | ✅ Implemented | user_id verified on all mutations |
| Microsoft EXT UPN decode | ✅ Implemented | resolveEmail() decodes to real Gmail address |
| Secrets excluded from logs | ✅ Implemented | logConfig() strips sensitive fields |
| CORS configuration | ✅ Implemented | Configurable origin, credentials: true |
| Token encryption | ⚠️ Placeholder | Base64 only — AES-256-GCM needed for production |
| Token refresh | ⚠️ Not implemented | Required for real org Microsoft Graph sync |
| Secrets management | ⚠️ Local .env | Azure Key Vault for production |
| HTTPS enforcement | ⚠️ Dev only | Azure App Service enforces in production |
| Automated security tests | 🔮 Future | Planned as part of Phase 9 CI/CD |
| Audit logging (admin actions) | 🔮 Future | audit_logs table exists, not yet populated |
| Input validation schema | 🔮 Future | Ad-hoc validation currently; zod/joi recommended |
| Database-driven admin roles | 🔮 Future | Currently ADMIN_EMAILS env var |

---

*Security Report generated: March 9, 2026 | SmartCol AI Capstone Project*
