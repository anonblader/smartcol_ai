# SmartCol AI — Calendar Intelligence & Workload Management System

**SmartCol AI** is an AI-powered workload management platform that integrates with Microsoft Outlook to provide intelligent calendar analysis, automated event classification, burnout risk scoring, workload prediction, and proactive risk detection for engineering teams.

---

## Table of Contents

1. [Project Status](#project-status)
2. [What Has Been Built](#what-has-been-built)
3. [Changes from Original Plan](#changes-from-original-plan)
4. [System Architecture](#system-architecture)
5. [Technology Stack](#technology-stack)
6. [Database Schema](#database-schema)
7. [API Reference](#api-reference)
8. [Quick Start](#quick-start)
9. [Known Limitations](#known-limitations)
10. [What Remains](#what-remains)
11. [Documentation](#documentation)

---

## Project Status

| Phase | Description | Status |
| --- | --- | --- |
| 1 | Foundation — Auth, DB, Calendar Sync | ✅ Complete |
| 2 | AI Event Classification (Hybrid ML) | ✅ Complete |
| 3 | Workload Analytics & Dashboard | ✅ Complete |
| 4 | Risk Detection & Off-Day Recommendations | ✅ Complete |
| 4.5 | ML Workload Prediction & Burnout Scoring | ✅ Complete |
| 5 | Frontend Integration & Bug Fixes | ✅ Complete |
| 6 | Background Job Scheduling | ✅ Complete |
| 7 | Email Alert Notification Management | ✅ Complete |
| 8 | Swagger UI, Weekly Digest & Active Learning | ✅ Complete |
| 9 | Robustness & UX Enhancements | ✅ Complete |
| 10 | CI/CD & Production Deployment | 🔮 Future Implementation |

---

## What Has Been Built

### Phase 1 — Foundation

- **Microsoft OAuth 2.0** authentication with CSRF-protected state parameter and session management
- **PostgreSQL schema** — 19 tables covering users, OAuth tokens, calendar events, classifications, analytics, risks, off-day recommendations, ML predictions, notifications, sync history, and audit logs
- **Calendar sync** — real Microsoft Graph API (delta queries) + 3 mock workload profiles for demo:
  - **Balanced** — 8 events/week, healthy schedule, no risks triggered
  - **Overloaded** — 54 events across 3 weeks, 750 min/day (12.5h), triggers all 6 risks
  - **Underloaded** — 3 minimal events/week, triggers Low Focus Time
- **Token storage** — encrypted refresh tokens in PostgreSQL; access tokens in express-session

### Phase 2 — AI Event Classification

- **Python FastAPI** classification microservice (port 8000)
- **Hybrid classifier** (rule-based first strategy):
  1. Rule-based engine — keyword scoring + structural heuristics
  2. If confidence ≥ 0.72 → return instantly (most known events)
  3. If confidence < 0.72 → try NLI zero-shot model
  4. NLI model: `facebook/bart-large-mnli` (Hugging Face Transformers)
  5. Fallback to rule-based if NLI confidence < 0.50
- **10 task types**: Deadline, Ad-hoc Troubleshooting, Project Milestone, Routine Meeting, 1:1 Check-in, Admin/Operational, Training/Learning, Focus Time, Break/Personal, Out of Office
- **Batched processing**: 8 events per batch (prevents CPU timeout storms on large syncs)
- **Timeout**: 30 s per request (raised from original 10 s for CPU-based NLI inference)
- 17/17 classifier tests passing

### Phase 3 — Workload Analytics

- Daily and weekly workload computation from classified events, stored in `daily_workload` and `weekly_workload` tables
- **Metrics computed per day**: total minutes, work minutes, meeting minutes, focus minutes, break minutes, overtime minutes, meeting count, deadline count
- **Dashboard endpoint** returns: current week summary, last 7 days daily breakdown, time breakdown by task type, upcoming events (next 7 days)
- Workload heatmap (configurable days, default 30), time breakdown bar chart

### Phase 4 — Risk Detection & Off-Day Recommendations

#### 6 rule-based risk detection algorithms

| Risk | Threshold | Severity |
| --- | --- | --- |
| High Daily Workload | > 600 min/day | High / Critical |
| Burnout Risk | > 3,000 min/week × 3 consecutive weeks | Critical |
| Overlapping Deadlines | 2+ deadlines within 3-day window | Medium / High |
| Excessive Troubleshooting | > 480 min/week ad-hoc incidents | Medium / High |
| Low Focus Time | < 300 min/week focus blocks (only if work data exists) | Low / Medium |
| Meeting Overload | > 1,200 min OR 25+ meetings/week | Medium / High |

**Alert lifecycle**: Active → Acknowledged (ongoing) → Auto-resolved when condition clears / Dismissed

#### Off-Day Recommendation Engine

- Entitlement rules: +1 off-day per weekday ≥ 720 min worked; +1 per any weekend work
- Recommendations scored 0–100 (lighter workload, fewer deadlines/meetings = higher score)
- Recommendations capped to available entitlement balance
- Accept / Decline flow with balance tracking

### Phase 4.5 — ML Workload Prediction & Burnout Scoring

Two additional supervised ML models, trained in-process at service startup (no external dataset required):

#### Workload Prediction (`rf-workload-v1.0` — RandomForestRegressor)

- 100 estimators, max depth 8; trained on 2,500 synthetic samples (5 load profiles)
- **Features (10)**: day of week, week of year, previous week workload, 2-week average, overall average, meeting ratio, focus ratio, avg deadline count, overtime trend
- **Output per day**: predicted minutes, predicted hours, load level (light / moderate / high / critical), confidence (0.30–0.92), trend direction
- Predicts next 5 working days; skips weekends automatically

#### Burnout Scoring (`gbm-burnout-v1.0` — GradientBoostingClassifier)

- 150 estimators, max depth 4, learning rate 0.10; trained on 3,000 synthetic samples (5 burnout profiles)
- **Features (10)**: avg weekly hours, overtime hours/week, overtime ratio, meeting ratio, focus ratio, consecutive high-load weeks, workload trend slope, weeks above 50h, avg daily meetings, workload variability
- **Output**: continuous score 0–100 (weighted class probabilities × midpoints), level, trend, contributing factors, full class probability distribution
- Auto-generates on first fetch if no stored result exists

Both models persist results to `workload_predictions` and `burnout_scores` tables, refreshed on every sync.

### Phase 5 — Frontend Integration & Bug Fixes

**React + MUI frontend (port 3000), role-based views:**

| View | Engineer | Admin |
| --- | --- | --- |
| Dashboard | Personal stats, burnout score, 5-day forecast, active risks | Team summary stats + **tabbed member view** (one tab per engineer) |
| Analytics | Own daily/weekly/heatmap/forecast/burnout/off-day | Dropdown to view any member's analytics |
| Risks | Own active/ongoing/history tabs | All team risks; acknowledge + email engineer |
| Settings | Mock sync profiles, sync status | + Team test data management + Background jobs |

**Admin tabbed dashboard**: replaces original card grid — horizontally scrollable tab bar with per-member load chip, risk badge, and full detail panel (stat cards, burnout score, 5-day forecast, time breakdown chart) loaded lazily on first tab selection.

**Bug fixes shipped in Phase 5:**

| Bug | Fix |
| --- | --- |
| Classification timeout storm (99 concurrent requests) | Batched to 8 at a time; timeout raised to 30 s |
| `meeting_minutes` missing from `weekly_workload` | ML service now aggregates from `daily_workload` |
| Low Focus Time false positive with no data | Added `work_minutes = 0` guard before triggering |
| ML-first classifier strategy caused slow bulk classification | Flipped to rule-based first; NLI only for ambiguous events |
| Heavy mock had 99 events (too many for real-time classification) | Redesigned to 3 longer events/day = 54 total, same 750 min/day |

### Phase 6 — Background Job Scheduling

**Two scheduled jobs (node-cron), started on server startup:**

| Job | Schedule | What it does |
| --- | --- | --- |
| **Analytics Pipeline** | `*/30 * * * *` (every 30 min) | classify → compute workload → detect risks → ML predictions, for all users with events |
| **Calendar Sync** | `0 */2 * * *` (every 2 hours) | Microsoft Graph sync for users with valid org OAuth tokens, then full pipeline |

#### Scheduler features

- Per-user error isolation (one failure doesn't block others)
- In-memory job status tracking (last run, duration, users processed, next run estimate)
- Graceful shutdown: `stopScheduler()` called on SIGTERM/SIGINT

#### Admin UI (Settings page)

- Live status card per job, auto-refreshes every 15 s
- **Run Now** button, **Pause / Resume** toggle per job

---

### Phase 7 — Email Alert Notification Management

Admin-configurable email notification system with 6 alert types, stored in the `email_alert_settings` table. All alerts fall back to structured console-log output when SMTP is not configured, making the feature fully demonstrable without credentials.

#### 6 alert types (admin toggles each on/off individually)

| Alert | Default | Trigger |
| --- | --- | --- |
| New Risk Alert | ON | When any new risk is detected in an engineer's workload |
| Risk Acknowledged | ON | When admin acknowledges an engineer's risk alert |
| Risk Dismissed | OFF | When admin dismisses an engineer's risk alert |
| Burnout Score Warning | ON | When ML burnout score exceeds 75/100 |
| High Workload Day | OFF | When a single day exceeds 10 hours (600 min) |
| Weekly Digest | ON | Monday 08:00 scheduled job; HTML email with metrics, risks, burnout score, off-day balance |

#### Trigger hooks added to pipeline

- `risks.service.ts` — fires `risk_detected` on every newly created alert
- `ml-prediction.service.ts` — fires `burnout_warning` when score > 75
- `analytics.service.ts` — fires `high_workload_day` when daily work > 600 min
- `admin.controller.ts` — fires `risk_acknowledged` and `risk_dismissed` on admin actions

#### Admin Settings UI (Settings page)

- Grouped toggle switches per alert type with colour-coded categories
- Last triggered timestamp + total trigger count per alert
- **Send Test Email** button (sends to the logged-in admin's account)
- Gmail SMTP configured and active — all 6 alert types deliver real HTML emails

**New DB table:** `email_alert_settings` (migration 003) with seeded defaults.

---

### Phase 8 — Swagger UI, Weekly Digest & Active Learning

#### Swagger UI (`GET /api/docs`)

- Full OpenAPI 3.0 interactive API documentation served via `swagger-ui-express`
- 45 endpoints documented across 10 tags with descriptions, parameters, and example responses
- Raw JSON spec available at `GET /api/docs.json` for tooling integration
- Custom SmartCol AI branding in the Swagger UI header

#### Weekly Digest Email (Monday 08:00)

- Third background job added to scheduler: `0 8 * * 1`
- Each Monday, sends each engineer a workload summary for the previous week
- Email includes: 4-column metrics grid (work / overtime / meetings / focus), active risk list, ML burnout score indicator, off-day balance
- Fully respects the `weekly_digest` admin toggle in notification settings

#### Active Learning — Classification Feedback Loop

- Engineers can correct any AI-misclassified event from the new **Events** page (sidebar)
- Correction applied immediately; all events with the same subject title auto-corrected
- Stored in `classification_feedback` table (migration 004)
- Future pipeline runs use stored corrections **before** calling the AI — known subjects are resolved via pattern matching (`pattern-learning-v1.0`) without any API call
- **Events page features:** classified event table with method badges (`rule_based` / `ml_model` / `✓ You` / `🔁 Learned`), confidence %, inline correction dropdown, corrected-event checkmark
- **Feedback Stats card:** total corrections, unique patterns learned, events auto-corrected, recent corrections breakdown

---

### Phase 9 — Robustness & UX Enhancements

#### Centralised Error Middleware (`error.middleware.ts`)

- `AppError` class — throw from any controller with a typed HTTP status code, error code, and message; caught and serialised consistently
- `errorMiddleware` — registered as the final Express handler in `app.ts`; replaces the previous ad-hoc inline handler with a uniform `{ error, message }` JSON shape across all routes

#### Centralised Auth Middleware (`auth.middleware.ts`)

- `requireAuth` — single function that checks `req.session.user_id` and returns `401 Unauthorized` if missing
- Applied to all protected route groups in `app.ts`: `/api/sync`, `/api/analytics`, `/api/risks`, `/api/offday`, `/api/ml`, `/api/feedback`; admin routes (`/api/admin`, `/api/scheduler`, `/api/notifications`, `/api/test`) continue to use the existing `requireAdmin` guard which already includes the session check

#### Events Page — Search & Filter

- Keyword search box — filters the displayed event table by event subject and location (case-insensitive, client-side, instant)
- Task type dropdown filter — narrows events by any of the 10 task types
- Event counter chip updates to show `filtered / total` (e.g. `3 / 54 events`)
- "No events match your search or filter" empty state row shown when no results

#### Analytics Export — CSV & PDF

- `GET /api/analytics/export?format=csv|pdf` — context-aware report download:
  - **Admin, no user selected** → own individual data + Team Workload Overview (top 5 most overloaded)
  - **Admin, specific user selected** → that user's individual data only (no team section)
  - **Engineer** → own individual data only
- Both formats include: Daily Workload (last 30 days), Weekly Summary (last 8 weeks), Time Breakdown by Task Type — rows tagged with **User** and **View** columns for clear attribution
- **Team Workload Overview** (admin team report): top 5 most overloaded engineers (real + test users) ranked by avg daily load, with off-day balance, active risks, burnout score, and auto-generated **Manager Recommendations** (burnout, overtime, meeting overload, focus time, deadlines, off-day approval)
- Export buttons at **top-right of Analytics page** with context-aware labels: `CSV — Team Report`, `PDF — John's Report`, `CSV — My Report`
- Filenames include context + local timestamp: `smartcol-Team-Report-2026-03-12_01-05-22.pdf`
- All date columns use `YYYY-MM-DD` format — timezone/time suffixes stripped via `fmtDate()` helper
- New dependency: `pdfkit@^0.17.2` + `@types/pdfkit@^0.17.5`

---

## Changes from Original Plan

The following documents significant deviations from the original design specification to the actual implementation, along with the reasons for each change.

---

### 1. Classifier Strategy — ML-First → Rule-Based First

**Original plan:**

> "Hybrid Model: 60% ML + 40% Rules weighted voting"

**Actual implementation:**

Rule-based engine runs first. If confidence ≥ 0.72, result is returned instantly without invoking the NLI model. Only ambiguous events (< 0.72) proceed to `facebook/bart-large-mnli`.

**Why:** The NLI model runs on CPU in this demo environment, taking 1–2 seconds per inference. Sending all events through it caused timeout storms on larger syncs (99 events = all timed out). The rule-based engine handles ~70% of events instantly with high confidence; ML is reserved for genuinely ambiguous cases.

**Impact:** Classification is significantly faster (< 100 ms for most events), more reliable, and still uses ML for the cases where it adds value.

---

### 2. Background Jobs — Bull (Redis Queue) → node-cron

**Original plan:**

> "Bull Queue Jobs: Calendar Sync every 15 min, Classification on event create/update, Daily Overtime Calculation 1 AM, Risk Detection 6 AM, Off-Day Recommendations weekly, Weekly Summary Email Monday 8 AM"

**Actual implementation:**

Two jobs managed by `node-cron` (in-process):

- Analytics Pipeline every 30 minutes
- Calendar Sync every 2 hours

**Why:** Bull requires Redis as a persistent job queue backend. While Redis is configured in the environment, setting it up as a production job queue added infrastructure complexity not warranted for a capstone demo. `node-cron` runs in-process, requires no additional infrastructure, and is sufficient for the demo's scheduling needs.

**What was simplified:**

- Classification is not a separate job — it runs as part of the unified pipeline
- Overtime calculation is embedded in the Analytics Pipeline (no dedicated job)
- Risk detection runs as part of the pipeline (no dedicated 6 AM job)
- Off-day recommendation generation remains on-demand (user-triggered)
- Weekly summary email is not yet automated (requires SMTP configuration)

---

### 3. Additional ML Models Added (Not in Original Plan)

**Original plan:** The AI service was scoped to event classification only.

**Actual additions:**

1. **Workload Prediction** (`RandomForestRegressor`) — 5-day forecast of daily work minutes
2. **Burnout Risk Scoring** (`GradientBoostingClassifier`) — continuous 0–100 score replacing purely threshold-based burnout detection

**Why:** During development, it became clear that threshold-based risk detection (e.g., "> 50h/week = burnout") is too blunt. A continuous ML score provides more nuanced, earlier signals. Workload prediction adds proactive value by forecasting upcoming busy periods before they happen.

Both models are trained on synthetic data at service startup — no external dataset is required, keeping the demo self-contained.

---

### 4. Token Storage — Redis (Short-Lived) → PostgreSQL Only

**Original plan:**

> "Access tokens: Redis (short-lived, 1 hour). Refresh tokens: PostgreSQL (encrypted with AES-256-GCM)"

**Actual implementation:**

Both access tokens and refresh tokens are stored in PostgreSQL (`oauth_tokens` table). The server uses `express-session` for session state. Redis is configured in the environment but is not actively used for token storage.

**Why:** Adding Redis as a runtime dependency (beyond what PostgreSQL already provides) increased setup complexity without meaningful benefit in a single-server demo environment. The session store and token lookup are fast enough with PostgreSQL for the demo scale.

**What remains:** Redis caching for analytics queries (listed as a future enhancement) would improve performance at scale.

---

### 5. Token Encryption — AES-256-GCM → Base64 Placeholder

**Original plan:**

> "Token encryption: AES-256-GCM with per-token IV. Key management: Azure Key Vault with RBAC"

**Actual implementation:**

Tokens are stored with Base64 encoding as a placeholder. The `TOKEN_ENCRYPTION_KEY` in `.env` is documented as a placeholder for development only.

**Why:** Azure Key Vault integration requires an active Azure subscription and additional SDK configuration. For a local demo environment, the Base64 placeholder allows the full auth flow to work end-to-end. Production deployment would replace this with AES-256-GCM + Azure Key Vault.

---

### 6. Off-Day Recommendations — Pure Scoring → Entitlement-Based

**Original plan:**

> "Generates top 10 recommended days, priority score 0–100"

**Actual implementation:**

An entitlement system was added on top of the scoring:

- Users **earn** off-days: +1 per weekday ≥ 720 min worked, +1 per any weekend work
- Recommendations are **capped** to the available entitlement balance
- Users can **accept or decline** recommendations; accepted ones are deducted from balance

**Why:** Pure scoring without entitlement had no business logic constraining how many recommendations a user could accept. The entitlement system ties recommendations to actual overtime worked, making them feel earned rather than arbitrary.

---

### 7. Admin Functionality Added (Not in Original Plan)

**Original plan:** No distinction between admin and regular users was specified.

**Actual additions:**

- **Role-based access control** — admin vs engineer views throughout the frontend
- **Admin dashboard** — team overview with per-member workload detail (tabbed view)
- **Admin analytics** — view any team member's analytics via user selector
- **Admin risks** — see all team risks; acknowledge and email the affected engineer
- **Admin off-day view** — see all team members' pending recommendations
- **Admin scheduler** — control background jobs (Run Now, Pause/Resume)
- **Admin test data** — seed fixed profiles, add random users, run pipeline per user

---

### 8. Mock Sync Profiles Added (Not in Original Plan)

**Original plan:** Only real Microsoft Graph sync was specified.

**Actual additions:**

Three deterministic mock sync profiles were built to support testing without an org Microsoft 365 tenant:

| Profile | Events | Daily Load | Risks Triggered |
| --- | --- | --- | --- |
| Balanced | ~8 events | ~8h/day | None |
| Overloaded | 54 events × 3 weeks | 12.5h/day | All 6 |
| Underloaded | 3 events/week | ~1.5h/day | Low Focus Time |

The overloaded profile was redesigned mid-project from 6 small events/day (99 total) to 3 longer events/day (54 total) to avoid classification timeout issues.

---

### 9. Database — 15 Tables → 19 Tables

**Original plan:** 15 tables specified in initial schema.

**Additions across migrations 002–004:**

- `workload_predictions` — stores 5-day workload forecasts per user (from RandomForest model)
- `burnout_scores` — stores daily burnout scores per user (from GradientBoosting model), with UPSERT on `(user_id, score_date)`
- `email_alert_settings` — admin-configurable email alert toggles with trigger counts
- `classification_feedback` — user corrections for active learning pattern matching

---

### 10. Features Not Yet Implemented from Original Plan

| Feature | Original Plan | Status | Notes |
| --- | --- | --- | --- |
| WebSocket / Socket.io real-time updates | Planned | ❌ Not built | Infrastructure complexity; polling/refresh used instead |
| Push notifications (FCM/mobile) | Planned | ❌ Not built | Requires mobile app or PWA with service worker |
| Active learning (user feedback loop) | Planned | ✅ Built | Events page — inline correction, pattern learning, auto-apply to matching subjects |
| Swagger UI at `/api/docs` | Planned | ✅ Built | OpenAPI 3.0, 45 endpoints, 10 tags, served via swagger-ui-express |
| PKCE for OAuth | Planned | ❌ Not built | Standard auth code flow used; PKCE adds browser security but not required server-side |
| Redis caching for analytics | Planned | ❌ Not built | Queries fast enough at demo scale without it |
| Automated test suite (Jest/Cypress) | Planned | ❌ Not built | Manual tests documented in TEST_LOGS.md instead |
| Weekly summary email (automated) | Planned | ✅ Built | Monday 08:00 scheduler job; HTML email with metrics, risks, burnout score, off-day balance |
| Azure deployment | Planned | 🔄 Pending | Local dev only; deployment guide to be written |

---

## System Architecture

### Actual Architecture (Current)

```text
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│   React 18 + TypeScript + MUI v5 + Recharts + Axios             │
│   ┌──────────┐ ┌───────────┐ ┌────────┐ ┌──────────────────┐   │
│   │Dashboard │ │ Analytics │ │ Risks  │ │ Settings         │   │
│   │(tabbed   │ │(per-user  │ │(team + │ │(mock sync, jobs, │   │
│   │ members) │ │ selector) │ │personal│ │ test users)      │   │
│   └──────────┘ └───────────┘ └────────┘ └──────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP REST (credentials: include)
┌──────────────────────────┴──────────────────────────────────────┐
│                BACKEND — Express + TypeScript (port 3001)        │
│                                                                  │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────────┐   │
│  │  Auth   │ │  Sync    │ │ Analytics │ │ Risks + Off-Day  │   │
│  │  OAuth  │ │  Mock /  │ │ Compute   │ │ Detection +      │   │
│  │  MSAL   │ │  Graph   │ │ Daily/    │ │ Recommendations  │   │
│  └─────────┘ └──────────┘ │ Weekly/   │ └──────────────────┘   │
│                            │ Heatmap   │                         │
│  ┌─────────┐ ┌──────────┐ └───────────┘ ┌──────────────────┐   │
│  │  ML     │ │ Scheduler│               │ Admin            │   │
│  │Forecast │ │ node-cron│               │ Team overview,   │   │
│  │ Burnout │ │ 30min /  │               │ Risks, Email     │   │
│  │ Scoring │ │ 2h jobs  │               └──────────────────┘   │
│  └─────────┘ └──────────┘                                       │
└────────────┬──────────────────────────┬─────────────────────────┘
             │                          │ HTTP (internal)
┌────────────┴────────────┐  ┌──────────┴──────────────────────────┐
│  PostgreSQL 15 (Docker)  │  │  AI/ML Service — FastAPI (port 8000) │
│  19 tables               │  │  Python 3.11 + uvicorn               │
│                          │  │                                      │
│  users                   │  │  POST /classify                      │
│  oauth_tokens            │  │    Hybrid: rule-based first          │
│  calendar_events         │  │    → bart-large-mnli (NLI) fallback  │
│  event_classifications   │  │    Batched 8 at a time               │
│  daily_workload          │  │                                      │
│  weekly_workload         │  │  POST /predict/workload              │
│  risk_alerts             │  │    RandomForestRegressor             │
│  offday_recommendations  │  │    5-day forecast                    │
│  workload_predictions    │  │                                      │
│  burnout_scores          │  │  POST /score/burnout                 │
│  sync_history            │  │    GradientBoostingClassifier        │
│  notifications           │  │    0-100 score, 5 levels             │
│  + 7 more tables         │  │                                      │
└──────────────────────────┘  └──────────────────────────────────────┘
```

### Original Planned Architecture (for reference)

The original plan specified:

- **Bull (Redis-based)** job queue → replaced with `node-cron` (in-process)
- **Redis** for token caching + session → PostgreSQL only (Redis not actively used)
- **Socket.io** for real-time WebSocket → not implemented (polling/refresh used)
- **Azure infrastructure** (App Service, Key Vault, Application Insights) → local dev only
- **Swagger UI** at `/api/docs` → ✅ now implemented (Phase 8)

---

## Technology Stack

### Actual Stack

| Layer | Technology | Notes vs Original Plan |
| --- | --- | --- |
| **Backend runtime** | Node.js 20+, Express 4, TypeScript | As planned |
| **Database** | PostgreSQL 15 (Docker) | As planned; Redis not actively used |
| **Session** | express-session | Redis session store not implemented |
| **AI Service** | Python 3.11+, FastAPI, uvicorn | As planned |
| **NLI Model** | `facebook/bart-large-mnli` (Hugging Face) | spaCy removed — not needed with transformer-based NLI |
| **ML Models** | scikit-learn (RandomForest, GradientBoosting), numpy | **Added** — not in original plan |
| **Frontend** | React 18, TypeScript, MUI v5, Recharts, Axios | Redux Toolkit removed — hooks + local state used instead |
| **Scheduler** | node-cron | **Changed** from Bull/Redis queue |
| **Email** | nodemailer + Gmail SMTP (smtp.gmail.com:587) | As planned; SMTP configured and active |
| **Auth** | Microsoft OAuth 2.0 (MSAL, delegated) | PKCE not implemented |
| **Token encryption** | Base64 placeholder | **Changed** from AES-256-GCM + Azure Key Vault |

---

## Database Schema

### Tables (19 total)

#### Migration 001 — Core Schema

| Table | Purpose |
| --- | --- |
| `users` | User accounts, work schedule settings |
| `oauth_tokens` | Encrypted Microsoft Graph refresh tokens |
| `calendar_events` | Synced events from Microsoft Graph or mock |
| `event_classifications` | AI classification results per event |
| `task_types` | Reference: 10 predefined task types |
| `project_categories` | User-defined project tags |
| `daily_workload` | Pre-aggregated daily metrics (UPSERT on user_id, date) |
| `weekly_workload` | Pre-aggregated weekly metrics (UPSERT on user_id, week_start_date) |
| `risk_types` | Reference: 6 predefined risk types |
| `risk_alerts` | Detected risk instances with lifecycle status |
| `offday_recommendations` | Off-day suggestions with scoring and status |
| `sync_history` | Calendar sync audit trail |
| `notifications` | Multi-channel notification queue |
| `notification_preferences` | Per-user notification settings |
| `audit_logs` | Security / compliance audit trail |

#### Migration 002 — ML Predictions *(added in Phase 4.5)*

| Table | Purpose |
| --- | --- |
| `workload_predictions` | 5-day workload forecast per user (refreshed each sync) |
| `burnout_scores` | Daily burnout score per user, UPSERT on (user_id, score_date) |

#### Migration 003 — Email Alert Settings *(added in Phase 7)*

| Table | Purpose |
| --- | --- |
| `email_alert_settings` | Admin-configurable on/off switches for each email alert type, with last triggered timestamp and trigger count |

#### Migration 004 — Classification Feedback *(added in Phase 8)*

| Table | Purpose |
| --- | --- |
| `classification_feedback` | User classification corrections — stores original type, corrected type, event subject for pattern learning. UNIQUE on event_id. |

---

## API Reference

### Auth

```text
GET  /api/auth/connect                 Get Microsoft OAuth URL
GET  /api/auth/callback                OAuth callback (redirects to frontend)
POST /api/auth/disconnect              Revoke session and tokens
GET  /api/auth/status                  Check authentication state
```

### Calendar Sync

```text
POST   /api/sync/mock                  Balanced mock sync + full pipeline
POST   /api/sync/heavy-mock            Overloaded mock sync + full pipeline
POST   /api/sync/light-mock            Underloaded mock sync + full pipeline
POST   /api/sync/calendar              Real Microsoft Graph sync
POST   /api/sync/classify              Manually trigger classification only
GET    /api/sync/events                List calendar events (paginated)
GET    /api/sync/status                Sync history and event counts
DELETE /api/sync/clear-data            Wipe all user data (used before re-sync)
```

### Analytics

```text
GET  /api/analytics/dashboard          All key metrics in one call
GET  /api/analytics/daily              Daily workload rows (date range filter)
GET  /api/analytics/weekly             Weekly summaries (N most recent weeks)
GET  /api/analytics/time-breakdown     Minutes per task type (date range filter)
GET  /api/analytics/heatmap            Daily totals for heatmap (last N days)
GET  /api/analytics/users-list         All users (for admin selector dropdown)
POST /api/analytics/compute            Trigger workload computation
GET  /api/analytics/export             Download CSV or PDF report (?format=csv|pdf)
```

### Risks

```text
GET  /api/risks/active                 Active risk alerts
GET  /api/risks/ongoing                Acknowledged (ongoing) alerts
GET  /api/risks/history                All past alerts
POST /api/risks/detect                 Run detection algorithms
POST /api/risks/:id/acknowledge        Acknowledge alert
POST /api/risks/:id/dismiss            Force-dismiss alert
```

### Off-Day Recommendations

```text
POST /api/offday/generate              Generate recommendations for user
GET  /api/offday/balance               Current entitlement balance
GET  /api/offday/pending               Unresponded recommendations
GET  /api/offday/all                   All recommendations (history)
GET  /api/offday/team                  All team recommendations (admin)
POST /api/offday/:id/accept            Accept recommendation
POST /api/offday/:id/reject            Decline recommendation
```

### ML Predictions

```text
POST /api/ml/predict                   Run both ML models and store results
GET  /api/ml/workload-forecast         5-day workload forecast (auto-generates if missing)
GET  /api/ml/burnout-score             Latest burnout score (auto-generates if missing)
```

### Admin *(requires admin session)*

```text
GET  /api/admin/team-overview          All members with summary workload stats
GET  /api/admin/team-risks             All team risk alerts (filterable by status)
POST /api/admin/risks/:id/acknowledge  Acknowledge alert + email engineer
POST /api/admin/risks/:id/dismiss      Dismiss alert + email engineer
```

### Email Notifications *(requires admin session)*

```text
GET  /api/notifications/settings       All alert settings (key, name, enabled, last triggered)
POST /api/notifications/settings       Toggle an alert on/off { alertKey, enabled }
POST /api/notifications/test           Send test email to the session user
```

### Classification Feedback / Active Learning

```text
GET  /api/feedback/events              Classified events list with correction state (limit param)
GET  /api/feedback/stats               Feedback statistics (total corrections, patterns, auto-applied)
POST /api/feedback/correct             Submit a correction { eventId, correctedTypeId }
```

### API Documentation

```text
GET  /api/docs                         Swagger UI — interactive API reference (45 endpoints, 10 tags)
GET  /api/docs.json                    Raw OpenAPI 3.0 spec (JSON) for tooling
```

### Scheduler *(requires admin session)*

```text
GET  /api/scheduler/status             Current status of all background jobs
POST /api/scheduler/trigger            Manually trigger a job { jobKey }
POST /api/scheduler/toggle             Pause or resume a job { jobKey, enabled }
```

### AI/ML Service *(internal — classification-service port 8000)*

```text
GET  /health                           Service health + NLI model status
POST /classify                         Classify a single event (hybrid rule-based + NLI)
POST /predict/workload                 5-day workload forecast (RandomForest)
POST /score/burnout                    Burnout risk score 0-100 (GradientBoosting)
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL 15 running on localhost:5432

### Setup

```bash
# 1. Clone
git clone https://github.com/anonblader/smartcol_ai.git
cd smartcol_ai

# 2. Database — run both migrations
PGPASSWORD=<password> psql -h localhost -U postgres -d smartcol \
  -f database/migrations/001_initial_schema.sql
PGPASSWORD=<password> psql -h localhost -U postgres -d smartcol \
  -f database/migrations/002_ml_predictions.sql
PGPASSWORD=<password> psql -h localhost -U postgres -d smartcol \
  -f database/migrations/003_email_alert_settings.sql
PGPASSWORD=<password> psql -h localhost -U postgres -d smartcol \
  -f database/migrations/004_classification_feedback.sql

# 3. Backend
cd backend
npm install
# Edit .env with DB credentials + Azure AD app credentials
npm run build && node dist/server.js

# 4. Classification service
cd ../classification-service
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 5. Frontend
cd ../frontend
npm install && npm start
```

Services:

- **Frontend**: <http://localhost:3000>
- **Backend**: <http://localhost:3001>
- **AI Service**: <http://localhost:8000>

See **STARTUP_GUIDE.md** for full environment variable reference and step-by-step instructions.

---

## Known Limitations

| Limitation | Detail | Workaround / Plan |
| --- | --- | --- |
| Microsoft Graph 401 on personal accounts | Personal Microsoft accounts cannot access calendar via Graph API | Use the 3 mock sync profiles (Balanced / Overloaded / Underloaded) |
| Calendar Sync background job | Only works with an org Microsoft 365 tenant + admin-consented `Calendars.Read` permission | Analytics Pipeline job keeps data fresh every 30 min on existing mock data |
| Token encryption | Base64 placeholder — not production-grade | Replace with AES-256-GCM + Azure Key Vault before production |
| Microsoft EXT UPN emails | Personal Microsoft accounts store email as `user_gmail.com#EXT#@tenant` — not a valid delivery address | Fixed via `resolveEmail()` decoder in email-alerts.service.ts |
| ML models on synthetic data | Models trained on generated profiles — accuracy improves as real historical data accumulates | Synthetic data covers typical load patterns well for demo validation |
| No automated test suite | No Jest / Cypress tests | 51 manual test cases documented in TEST_LOGS.md with actual output |
| No WebSocket real-time updates | Polling / manual refresh used in frontend | Planned as future enhancement |

---

## What Remains

> The following items are scoped as **future implementations**. All groundwork (architecture, hooks, and infrastructure) for these features is already in place.

---

### Phase 10 — CI/CD & Production Deployment

**What's left (future):**

- **GitHub Actions** CI workflow — lint + TypeScript build + type-check on every push to `main`
- **Azure App Service** — deploy backend (Node.js) and frontend (static React build)
- **Azure Container Registry** — containerise and deploy the Python classification service
- **Azure Database for PostgreSQL** (Flexible Server, zone-redundant for HA)
- **Azure Key Vault** — replace Base64 token encryption placeholder with AES-256-GCM; store `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`, SMTP credentials securely
- **Azure Application Insights** — request tracing, error monitoring, performance dashboards
- **Environment promotion** — separate staging and production environments

---

### Additional Future Enhancements

| Enhancement | Description |
| --- | --- |
| Automated test suite | Jest unit tests for backend business logic (risk thresholds, scoring) + Cypress E2E tests; to be wired into GitHub Actions CI on every push to `main` |
| Real calendar sync | Requires org Microsoft 365 tenant with admin-consented `Calendars.Read` |
| Push / WebSocket notifications | Real-time in-app alerts without page refresh |
| Redis caching | Cache analytics queries for performance at scale |
| Mobile-responsive PWA | Progressive Web App for mobile engineer access |
| Token encryption | Replace Base64 placeholder with AES-256-GCM + Azure Key Vault before production |

---

## Documentation

| File | Description |
| --- | --- |
| `README.md` | This file — project overview, architecture, API reference, change log |
| `IMPLEMENTATION_REPORT.md` | Detailed phase-by-phase implementation notes (Phases 1–9) |
| `SECURITY_REPORT.md` | Full security audit — strengths, 5 vulnerabilities fixed, accepted risks, future recommendations |
| `TEST_LOGS.md` | 51 test cases across all phases with actual terminal output |
| `STARTUP_GUIDE.md` | Step-by-step local setup with environment variable reference |
| `LIMITATIONS.md` | All known limitations, accepted trade-offs, and production remediation paths |

---

Last updated: March 14, 2026 | SmartCol AI Capstone Project
