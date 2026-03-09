# SmartCol AI — Calendar Intelligence & Workload Management System

**SmartCol AI** is an AI-powered workload management platform that integrates with Microsoft Outlook to provide intelligent calendar analysis, automated event classification, burnout risk scoring, workload prediction, and proactive risk detection for engineering teams.

---

## Project Status

| Phase | Description | Status |
|---|---|---|
| 1 | Foundation — Auth, DB, Calendar Sync | ✅ Complete |
| 2 | AI Event Classification (Hybrid ML) | ✅ Complete |
| 3 | Workload Analytics & Dashboard | ✅ Complete |
| 4 | Risk Detection & Off-Day Recommendations | ✅ Complete |
| 4.5 | ML Workload Prediction & Burnout Scoring | ✅ Complete |
| 5 | Frontend Integration & Bug Fixes | ✅ Complete |
| 6 | Background Job Scheduling | ✅ Complete |
| 7 | Email SMTP Configuration | 🔄 Pending |
| 8 | CI/CD & Production Deployment | 🔄 Pending |

---

## What Has Been Built

### Phase 1 — Foundation
- **Microsoft OAuth 2.0** authentication with session management
- **PostgreSQL schema** — 17 tables covering users, events, classifications, analytics, risks, off-day recommendations, ML predictions, notifications, and audit logs
- **Calendar sync** — real Microsoft Graph API integration + 3 mock workload profiles (Balanced, Overloaded, Underloaded) for demo/testing
- **Token storage** — encrypted refresh tokens in PostgreSQL

### Phase 2 — AI Event Classification
- **Python FastAPI** classification microservice (port 8000)
- **Hybrid classifier**: rule-based first (≥ 0.72 confidence → instant), NLI zero-shot fallback for ambiguous events
- **Model**: `facebook/bart-large-mnli` via Hugging Face Transformers
- **10 task types**: Deadline, Ad-hoc Troubleshooting, Project Milestone, Routine Meeting, 1:1 Check-in, Admin/Operational, Training/Learning, Focus Time, Break/Personal, Out of Office
- **Batched processing**: 8 events per batch to prevent CPU timeout storms
- **17/17 classifier tests passing**

### Phase 3 — Workload Analytics
- Daily & weekly workload computation from classified events
- **Endpoints**: dashboard, daily breakdown, weekly summary, heatmap, time breakdown by task type
- Metrics: work minutes, meeting minutes, focus minutes, overtime, deadline counts
- Workload heatmap (last 30 days), task type time breakdown chart

### Phase 4 — Risk Detection & Off-Day Recommendations
**6 risk detection algorithms:**
| Risk Type | Trigger | Severity |
|---|---|---|
| High Daily Workload | > 600 min/day | High / Critical |
| Burnout Risk | > 3000 min/week × 3 consecutive weeks | Critical |
| Overlapping Deadlines | 2+ deadlines within 3-day window | Medium / High |
| Excessive Troubleshooting | > 480 min/week ad-hoc | Medium / High |
| Low Focus Time | < 300 min/week focus blocks | Low / Medium |
| Meeting Overload | > 1200 min OR 25+ meetings/week | Medium / High |

**Alert lifecycle**: Active → Acknowledged (ongoing) → Auto-resolved / Dismissed

**Off-Day Recommendation Engine:**
- Entitlement: +1 off-day per weekday ≥ 720 min; +1 per any weekend work
- Scores next 30 weekdays (0–100) on workload, deadlines, meeting density
- Recommendations capped to available entitlement balance
- Accept / Decline with balance tracking

### Phase 4.5 — ML Workload Prediction & Burnout Scoring
Two additional ML models trained in-process on startup (no external dataset needed):

**Workload Prediction (RandomForestRegressor):**
- Input: last 20 days of workload history (10 features)
- Output: 5-day forecast with predicted hours, load level, confidence, trend
- Load levels: light / moderate / high / critical
- Confidence scales with history depth (0.30–0.92)

**Burnout Risk Scoring (GradientBoostingClassifier):**
- Input: last 4 weeks of weekly workload metrics (10 features)
- Output: continuous score 0–100, level (none/low/medium/high/critical), trend, contributing factors
- Validated: healthy profile → 5/none; overloaded (64h/wk) → 95/critical

Both models auto-generate on first page load if no stored result exists.

### Phase 5 — Frontend & Bug Fixes
**React + MUI frontend (port 3000):**
- Role-based views: Admin vs Engineer
- **Personal Dashboard**: stat cards, time breakdown, upcoming events, active risk alerts, burnout score card, 5-day workload forecast
- **Admin Dashboard**: 4 team summary stats + horizontally scrollable tabbed member view — one tab per engineer showing their full workload detail
- **Analytics page**: daily table, weekly summary, heatmap, time breakdown chart, workload forecast, burnout score, off-day recommendations
- **Risks page**: Active / Ongoing / History tabs; admin can acknowledge & email engineer
- **Settings page**: mock data profiles, sync status, team test data management (admin), background jobs (admin)

**Bug fixes shipped in Phase 5:**
- Classification timeout storm (99 concurrent → batched 8 at a time, timeout 30 s)
- `meeting_minutes` column missing from `weekly_workload` — fixed to aggregate from `daily_workload`
- Low Focus Time false positive on zero data — added `work_minutes` guard
- Classifier flipped to rule-based first (ML reserved for ambiguous events only)
- Heavy mock reduced from 99 → 54 events (3 longer events/day, same 750 min total)

### Phase 6 — Background Job Scheduling
**Two scheduled jobs (node-cron):**

| Job | Schedule | What it does |
|---|---|---|
| Analytics Pipeline | Every 30 min | Classify → compute workload → detect risks → ML predictions for all users with data |
| Calendar Sync | Every 2 hours | Microsoft Graph sync for users with valid org tokens, then full pipeline |

**Admin controls** (Settings page):
- Live status card per job (last run, duration, users processed, next run)
- **Run Now** — manual trigger
- **Pause / Resume** — disable without unregistering

Scheduler starts on server startup, stops cleanly on graceful shutdown.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                             │
│   React 18 + TypeScript + MUI v5 + Redux + Recharts         │
│   Dashboard │ Analytics │ Risks │ Settings                   │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP / REST
┌─────────────────────────┴───────────────────────────────────┐
│                   BACKEND (port 3001)                        │
│   Node.js 20 + Express + TypeScript                          │
│   Auth │ Sync │ Analytics │ Risks │ Off-Day │ ML │ Scheduler │
└──────┬────────────────────────────────────┬─────────────────┘
       │                                    │ HTTP
┌──────┴──────────┐          ┌──────────────┴──────────────────┐
│  PostgreSQL 15  │          │  AI/ML Service (port 8000)       │
│  17 tables      │          │  Python + FastAPI                │
│  Users, Events  │          │  /classify   — hybrid NLI+rules  │
│  Analytics      │          │  /predict/workload — RandomForest│
│  Risks, ML      │          │  /score/burnout — GradientBoost  │
│  Predictions    │          │  scikit-learn + transformers     │
└─────────────────┘          └─────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js 20+, Express, TypeScript |
| **Database** | PostgreSQL 15 (Docker) |
| **AI Service** | Python 3.11+, FastAPI, uvicorn |
| **NLI Model** | `facebook/bart-large-mnli` (Hugging Face) |
| **ML Models** | scikit-learn (RandomForest, GradientBoosting), numpy |
| **Frontend** | React 18, TypeScript, MUI v5, Redux Toolkit, Recharts |
| **Scheduler** | node-cron |
| **Email** | nodemailer (console-log fallback if SMTP not configured) |
| **Auth** | Microsoft OAuth 2.0 (delegated, MSAL) |

---

## API Endpoints

### Auth
```
GET  /api/auth/connect         Get OAuth URL
GET  /api/auth/callback        OAuth callback
POST /api/auth/disconnect      Revoke session
GET  /api/auth/status          Check auth state
```

### Calendar Sync
```
POST /api/sync/mock            Balanced mock sync (+ full pipeline)
POST /api/sync/heavy-mock      Overloaded mock sync (+ full pipeline)
POST /api/sync/light-mock      Underloaded mock sync (+ full pipeline)
POST /api/sync/calendar        Real Microsoft Graph sync
GET  /api/sync/events          List calendar events
GET  /api/sync/status          Sync history
DELETE /api/sync/clear-data    Wipe all user data
```

### Analytics
```
GET  /api/analytics/dashboard       All key metrics in one call
GET  /api/analytics/daily           Daily workload rows
GET  /api/analytics/weekly          Weekly summaries
GET  /api/analytics/time-breakdown  Minutes per task type
GET  /api/analytics/heatmap         Daily totals for heatmap
POST /api/analytics/compute         Trigger workload computation
```

### Risks
```
GET  /api/risks/active              Active alerts
GET  /api/risks/ongoing             Acknowledged alerts
GET  /api/risks/history             All past alerts
POST /api/risks/detect              Run detection
POST /api/risks/:id/acknowledge     Acknowledge alert
POST /api/risks/:id/dismiss         Dismiss alert
```

### Off-Day Recommendations
```
POST /api/offday/generate           Generate recommendations
GET  /api/offday/balance            Entitlement balance
GET  /api/offday/pending            Unresponded recommendations
GET  /api/offday/all                All recommendations
GET  /api/offday/team               Team view (admin)
POST /api/offday/:id/accept         Accept recommendation
POST /api/offday/:id/reject         Reject recommendation
```

### ML Predictions
```
POST /api/ml/predict                Run workload forecast + burnout score
GET  /api/ml/workload-forecast      5-day workload forecast
GET  /api/ml/burnout-score          Latest burnout score
```

### Scheduler (admin only)
```
GET  /api/scheduler/status          Job statuses
POST /api/scheduler/trigger         Manually run a job
POST /api/scheduler/toggle          Pause / resume a job
```

### Admin
```
GET  /api/admin/team-overview       All members with summary stats
GET  /api/admin/team-risks          All team risk alerts
POST /api/admin/risks/:id/acknowledge  Acknowledge + email engineer
```

---

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.11+
- PostgreSQL 15+ (or Docker)

### Setup

```bash
# 1. Clone
git clone https://github.com/anonblader/smartcol_ai.git
cd smartcol_ai

# 2. Database
PGPASSWORD=<pass> psql -h localhost -U postgres -d smartcol \
  -f database/migrations/001_initial_schema.sql
  -f database/migrations/002_ml_predictions.sql

# 3. Backend
cd backend
npm install
cp .env.example .env   # fill in DB credentials + Azure AD credentials
npm run build
node dist/server.js

# 4. Classification service
cd ../classification-service
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 5. Frontend
cd ../frontend
npm install
npm start
```

See **STARTUP_GUIDE.md** for the full step-by-step guide including environment variables.

---

## Known Limitations

| Limitation | Detail | Workaround |
|---|---|---|
| Microsoft Graph 401 on personal accounts | Personal Microsoft accounts cannot access calendar via Graph API | Use mock sync (3 profiles available) |
| Calendar Sync background job | Only works with org Microsoft 365 tenant + admin-consented app | Analytics Pipeline job keeps data fresh every 30 min |
| Token encryption | Base64 placeholder — not production-grade | Replace with AES-256-GCM + Azure Key Vault |
| Email alerts | Requires SMTP credentials in `.env` | Console-log fallback active for demo |
| ML training data | Models trained on synthetic data | Accuracy improves as real historical data accumulates |

---

## What Remains (Next Steps)

### 🔄 Pending

**Email SMTP Configuration**
- Add `EMAIL_USER` and `EMAIL_PASS` to `backend/.env`
- Risk acknowledgement emails will go live automatically (nodemailer already integrated)

**CI/CD Pipelines**
- GitHub Actions workflow for build + test on push
- Separate staging and production environments

**Production Deployment (Azure)**
- Azure App Service for backend + frontend
- Azure Database for PostgreSQL (Flexible Server)
- Azure Container Registry for classification service
- Azure Key Vault for secrets (replace Base64 token encryption)
- Azure Application Insights for monitoring

### 🔮 Future Enhancements
- Real-time push notifications (WebSocket / FCM)
- Redis caching for analytics queries
- Active learning loop — use user-corrected classifications as training data
- Multi-tenant support for multiple organisations
- Mobile-responsive PWA

---

## Documentation

| Document | Contents |
|---|---|
| `IMPLEMENTATION_REPORT.md` | Detailed phase-by-phase implementation notes, all 6 phases |
| `TEST_LOGS.md` | 51 test cases across all phases with actual terminal output |
| `STARTUP_GUIDE.md` | Step-by-step local setup instructions |

---

*Last updated: March 9, 2026 | SmartCol AI Capstone Project*
