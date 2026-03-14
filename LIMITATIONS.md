# SmartCol AI — Known Limitations

This document catalogues all known limitations, accepted trade-offs, and scope boundaries encountered throughout the SmartCol AI capstone project. Each limitation includes its root cause, current impact, and recommended production remediation where applicable.

---

## Table of Contents

1. [Microsoft Graph API](#1-microsoft-graph-api)
2. [ML and AI Models](#2-ml-and-ai-models)
3. [Authentication and Sessions](#3-authentication-and-sessions)
4. [Email System](#4-email-system)
5. [Background Scheduler](#5-background-scheduler)
6. [Database](#6-database)
7. [Frontend](#7-frontend)
8. [Testing](#8-testing)
9. [Security (Accepted Risks)](#9-security-accepted-risks)
10. [Deployment and Infrastructure](#10-deployment-and-infrastructure)
11. [Data and Performance Constraints](#11-data-and-performance-constraints)

---

## 1. Microsoft Graph API

### 1.1 Personal and University Account Restrictions

**Issue:** The calendar sync feature (`POST /api/sync/calendar`) receives 401 Unauthorized errors from Microsoft Graph's `/me/events/delta` endpoint, despite having the correct OAuth scopes granted.

**Root Cause:**

| Account Type | Limitation |
|---|---|
| Personal (Outlook.com, Hotmail, Live.com) | `/me/events` and `/me/calendar` are restricted or unsupported |
| University/Education (e.g. `@sit.singaporetech.edu.sg`) | Tenant-level conditional access policies and admin consent requirements block Graph API calendar access |

**Evidence:**
- `GET /me` (user profile) works — the access token is valid
- All required scopes (`Calendars.Read`, `Calendars.Read.Shared`, `MailboxSettings.Read`, `User.Read`) are present in the token response
- The same code works correctly on a properly configured Microsoft 365 tenant

**Workaround:** Mock calendar sync service (`mock-calendar-sync.service.ts`) generates 8 realistic events and feeds the same database schema, enabling the full downstream pipeline (classify, workload, risks, ML predictions) to function identically.

**Production Remediation:**
- Register the app in a Microsoft 365 Business/Enterprise/Education tenant
- Obtain tenant-wide admin consent for `Calendars.Read` (delegated)
- Alternatively, use the [Microsoft 365 Developer Program](https://developer.microsoft.com/microsoft-365/dev-program) sandbox (free, 25 test users, full Graph API access)

### 1.2 Admin Consent Requirement

Many Microsoft 365 tenants require **tenant-wide admin consent** for applications requesting calendar access. Without IT administrator approval, individual users cannot grant these permissions to third-party applications — even with valid credentials.

### 1.3 Graph API Page Size

Calendar event queries use `odata.maxpagesize=100`. Syncs involving more than 100 events require pagination handling (implemented, but adds latency).

---

## 2. ML and AI Models

### 2.1 Synthetic Training Data

Both ML models are trained on synthetic data generated at service startup, not real historical workload data.

| Model | Algorithm | Training Samples | Profiles |
|---|---|---|---|
| Workload Predictor | RandomForestRegressor | 2,500 | 5 load profiles |
| Burnout Scorer | GradientBoostingClassifier | 3,000 | 5 burnout levels (none → critical) |

**Impact:** Predictions are reasonable for demo purposes but will improve significantly with real historical data. Confidence ranges reflect synthetic calibration (workload: 0.30–0.92).

**Production Remediation:** Retrain on accumulated real user data after 3–6 months of production use. The DB tables (`workload_predictions`, `burnout_scores`) already store predictions for future model evaluation.

### 2.2 NLI Model as Fallback Only

The rule-based classifier runs first with a 0.72 confidence threshold. The NLI model (`facebook/bart-large-mnli`) is invoked only for ambiguous events below that threshold:

```
Rule-based (≥ 0.72 confidence) → use rule result
Rule-based (< 0.72) + NLI (≥ 0.50) → use NLI result
Rule-based (< 0.72) + NLI (< 0.50) → use rule result anyway
```

**Impact:** ~70% of events are classified by rules without ML. This is a deliberate design choice — rule-based is faster and deterministic for clear-cut events.

### 2.3 NLI Model Download (~1.6 GB)

The `facebook/bart-large-mnli` model downloads from Hugging Face on first run. After initial download it loads from local cache and works offline. Without internet on first launch, the service starts in rule-based-only mode.

---

## 3. Authentication and Sessions

### 3.1 In-Memory Session Store

Sessions use the default `express-session` memory store (not Redis or a database-backed store).

**Impact:**
- All sessions are lost on server restart
- Not suitable for multi-server deployments (no session sharing)
- 8-hour session lifetime (`maxAge`)

**Production Remediation:** Use `connect-redis` or `connect-pg-simple` as the session store. Redis config already exists in `.env` but is not wired to sessions.

### 3.2 Token Encryption Placeholder

OAuth tokens stored in the `oauth_tokens` table use Base64 encoding, not AES-256-GCM encryption. Base64 is encoding (reversible without a key), not encryption.

**Production Remediation:** Implement AES-256-GCM with Azure Key Vault for key management. See `SECURITY_REPORT.md` (AR-1).

### 3.3 No Automatic Token Refresh

OAuth access tokens expire after ~1 hour. The system stores refresh tokens but does not automatically use them to obtain new access tokens. Calendar sync background jobs will fail after token expiry.

**Impact:** Minimal for demo (mock sync does not require tokens). Real calendar sync requires re-authentication after 1 hour.

**Production Remediation:** Implement a token refresh interceptor in `graph.client.ts` that detects 401 responses and uses the stored refresh token.

---

## 4. Email System

### 4.1 Console-Log Fallback

Email alerts (risk notifications, weekly digest) require `EMAIL_USER` and `EMAIL_PASS` environment variables for Gmail SMTP. Without these credentials, all emails fall back to `console.log` output — no actual delivery occurs.

**Impact:** Demo environments without SMTP credentials still show email functionality in logs but do not send real emails.

### 4.2 Gmail App Password Dependency

The current SMTP configuration targets Gmail (`smtp.gmail.com:587`). Using other providers requires updating the transporter configuration in `email-alerts.service.ts`.

---

## 5. Background Scheduler

### 5.1 Single-Process Scheduling

The scheduler uses `node-cron` (in-process cron). Job status is tracked in memory and lost on restart.

**Impact:**
- Jobs cannot be distributed across multiple server instances
- No persistent job history after restart
- No retry queue for failed jobs (individual user failures are isolated but not retried)

**Production Remediation:** Migrate to a distributed job queue (e.g. BullMQ with Redis, or a managed service like AWS Step Functions).

### 5.2 Estimated Next Run Time

The "next run" time shown in the admin UI uses simplified interval-based estimation, not precise cron expression parsing. For standard expressions (`*/30 * * * *`, `0 */2 * * *`) this is accurate, but complex expressions may show approximate times.

---

## 6. Database

### 6.1 No Redis Caching Layer

Redis is configured in `.env` but not actively used. All analytics queries hit PostgreSQL directly. Repeated dashboard loads re-execute the same queries.

**Production Remediation:** Cache frequently accessed analytics (dashboard summary, heatmap, time breakdown) in Redis with short TTLs (1–5 minutes).

### 6.2 Fixed Connection Pool

The PostgreSQL pool is configured with `min=2, max=10` connections with a 30-second idle timeout. These are hardcoded defaults not scaled to load.

### 6.3 Audit Log Table Unused

The `audit_logs` table exists in the schema but is never populated. Admin actions (acknowledge risk, dismiss risk, toggle email alerts, trigger scheduler) are not recorded.

**Production Remediation:** Add audit logging middleware for all admin endpoints.

---

## 7. Frontend

### 7.1 No Error Boundaries

No React Error Boundary components are implemented. An unhandled error in any component crashes the entire application UI.

**Production Remediation:** Wrap page-level components in Error Boundaries with fallback UI.

### 7.2 No Offline Support

No service worker, local caching, or offline fallback UI. Network interruptions cause immediate failures.

### 7.3 No WebSocket Real-Time Updates

The original architecture plan included Socket.io for real-time notifications. This was not implemented. The UI relies on manual refresh and auto-polling (e.g. scheduler status refreshes every 15 seconds).

### 7.4 Environment Variable Fallback

The API base URL defaults to `http://localhost:3001/api` when `REACT_APP_API_URL` is not set. Production builds must explicitly set this variable.

---

## 8. Testing

### 8.1 No Automated Backend Tests

The backend has no Jest unit tests. All 51 backend test cases are manual (documented in `TEST_LOGS.md`).

**What is tested automatically:**
- Classification service: 12 pytest rule-based tests + 5 ML ambiguity tests (all passing)

**What is not tested automatically:**
- Backend business logic (risk thresholds, workload aggregation, off-day scoring)
- API endpoint contracts
- Frontend E2E flows

### 8.2 No CI/CD Test Pipeline

No GitHub Actions workflow exists. Lint, type-check, and test runs are manual.

**Production Remediation:** Implement a CI pipeline: `lint → tsc --noEmit → pytest → jest → (optional) Cypress E2E`.

---

## 9. Security (Accepted Risks)

Six risks are formally accepted and documented in `SECURITY_REPORT.md`:

| ID | Risk | Severity | Remediation |
|---|---|---|---|
| AR-1 | Token encryption uses Base64, not AES-256-GCM | Medium | Azure Key Vault + AES-256-GCM |
| AR-2 | Secrets stored in local `.env` file, no rotation | Medium | Secret manager + rotation policy |
| AR-3 | No automatic OAuth token refresh | Low | Refresh interceptor in Graph client |
| AR-4 | Admin list in `.env`, not database-driven | Low | Admin management UI + DB table |
| AR-5 | No HTTPS enforcement in development | Low | `secure: true` cookie flag in production |
| AR-6 | No automated security tests (OWASP ZAP, Snyk) | Medium | Add to CI/CD pipeline |

---

## 10. Deployment and Infrastructure

### 10.1 Local Development Only

No staging or production environments exist. The application runs exclusively on `localhost`.

### 10.2 No CI/CD Pipeline

GitHub Actions is planned (Phase 10 — future work) but not implemented. Deployment is manual.

### 10.3 No Containerised Deployment

No `Dockerfile` or `docker-compose.yml` for the application services (only PostgreSQL runs in Docker). Production deployment would benefit from containerisation of all 3 services.

---

## 11. Data and Performance Constraints

### 11.1 Classification Batch Size

Events are classified in batches of 8 (`CLASSIFY_BATCH_SIZE = 8` in `classification.client.ts`) to prevent CPU timeout storms. A 54-event overloaded sync processes 7 sequential batches, taking ~30–90 seconds.

### 11.2 Off-Day Recommendation Cap

Recommendations are capped at `min(available_balance, 10)` per generation. Users with more than 10 available off-days will only see the top 10 ranked recommendations.

### 11.3 Classified Events Pagination

The events feedback list defaults to 50 results per page. Users with more than 50 classified events cannot view all corrections in a single page.

---

## Summary

| Category | Limitations | Production Impact |
|---|---|---|
| Microsoft Graph API | 3 | High (workaround in place) |
| ML/AI Models | 3 | Low–Medium |
| Authentication/Sessions | 3 | Medium–High |
| Email System | 2 | Low |
| Background Scheduler | 2 | Medium |
| Database | 3 | Low–Medium |
| Frontend | 4 | Medium |
| Testing | 2 | High |
| Security (Accepted) | 6 | Medium |
| Deployment | 3 | Medium |
| Data/Performance | 3 | Low |
| **Total** | **34** | — |

All limitations are deliberate scope decisions or external constraints appropriate for a capstone project. The system is fully functional for demonstration with mock data, and production remediation paths are documented for each item.

---

**Last Updated:** March 14, 2026
**Status:** Capstone-Complete (Production Remediation Paths Documented)
