# SmartCol AI — Startup Guide

A step-by-step guide to get all SmartCol AI services running after a fresh reboot.

---

## Services Overview

| Service | Port | What it does |
|---|---|---|
| PostgreSQL | 5432 | Primary database (19 tables) |
| Backend (Node.js) | 3001 | REST API + background job scheduler |
| Classification Service (Python) | 8000 | AI classifier + ML workload/burnout models |
| Frontend (React) | 3000 | Web application |

> **Start order matters:** PostgreSQL → Backend → Classification Service → Frontend

---

## First-Time Setup Only

Run all four database migrations before starting the app for the first time:

```bash
# Replace <password> with your PostgreSQL password (e.g. fly1ngC()wN0vemberR@1n)

PGPASSWORD=<password> psql -h localhost -U postgres -d smartcol \
  -f ~/Desktop/Capstone/Project/smartcol_ai/database/migrations/001_initial_schema.sql

PGPASSWORD=<password> psql -h localhost -U postgres -d smartcol \
  -f ~/Desktop/Capstone/Project/smartcol_ai/database/migrations/002_ml_predictions.sql

PGPASSWORD=<password> psql -h localhost -U postgres -d smartcol \
  -f ~/Desktop/Capstone/Project/smartcol_ai/database/migrations/003_email_alert_settings.sql

PGPASSWORD=<password> psql -h localhost -U postgres -d smartcol \
  -f ~/Desktop/Capstone/Project/smartcol_ai/database/migrations/004_classification_feedback.sql
```

After running migrations, install dependencies for the backend and frontend (first time only):

```bash
cd ~/Desktop/Capstone/Project/smartcol_ai/backend && npm install
cd ~/Desktop/Capstone/Project/smartcol_ai/frontend && npm install
```

You only need to do this once. On subsequent starts, skip directly to Step 1.

---

## Step 1 — Start PostgreSQL

### Option A: Docker (if you set it up with Docker)

```bash
docker start smartcol-postgres
```

Verify:
```bash
docker ps | grep smartcol-postgres
# Should show: Up X seconds/minutes
```

If the container no longer exists, recreate it:
```bash
docker run -d \
  --name smartcol-postgres \
  -e POSTGRES_PASSWORD=fly1ngC()wN0vemberR@1n \
  -e POSTGRES_DB=smartcol \
  -p 5432:5432 \
  postgres:15
```

### Option B: Native PostgreSQL (if installed via Homebrew / system package)

```bash
# macOS (Homebrew)
brew services start postgresql@15

# Or using pg_ctl directly
pg_ctl -D /usr/local/var/postgresql@15 start
```

### Verify PostgreSQL is ready

```bash
pg_isready -h localhost -p 5432
# Expected: localhost:5432 - accepting connections
```

---

## Step 2 — Start the Backend

Open a **new terminal tab**:

```bash
cd ~/Desktop/Capstone/Project/smartcol_ai/backend
```

**For development** (auto-restarts on file changes):
```bash
npm run dev
```

**For production-like start** (pre-built, faster):
```bash
npm run build && node dist/server.js
```

Wait until you see:
```
Server listening on port 3001
[Scheduler] Background jobs registered
  analyticsPipeline: */30 * * * *
  calendarSync:      0 */2 * * *
  weeklyDigest:      0 8 * * 1
```

The **background job scheduler** starts automatically with the server. Three jobs are registered:
- **Analytics Pipeline** — runs every 30 minutes (classify → workload → risks → ML predictions)
- **Calendar Sync** — runs every 2 hours for users with valid Microsoft 365 org tokens
- **Weekly Digest** — runs every Monday at 08:00, sends each engineer their previous week's workload summary email

**Verify:** `http://localhost:3001/health` → `{"status":"ok"}`

---

## Step 3 — Start the Classification Service (AI)

Open a **new terminal tab**:

```bash
cd ~/Desktop/Capstone/Project/smartcol_ai/classification-service
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Wait until you see:
```
Application startup complete.
Uvicorn running on http://0.0.0.0:8000
```

Three things load at startup:
1. **Workload Predictor** (RandomForest) — trains in ~2 seconds
2. **Burnout Scorer** (GradientBoosting) — trains in ~2 seconds
3. **NLI Model** (`facebook/bart-large-mnli`) — loads in background (~5–10 seconds from cache)

**Verify:** `http://localhost:8000/health`
```json
{
  "status": "ok",
  "ml_model": { "ready": true, "model": "facebook/bart-large-mnli" },
  "mode": "hybrid (ml + rule-based)"
}
```

> **First run only:** The NLI model (~1.6 GB) downloads from Hugging Face. Requires internet. All subsequent starts load from local cache.

---

## Step 4 — Start the Frontend

Open a **new terminal tab**:

```bash
cd ~/Desktop/Capstone/Project/smartcol_ai/frontend
npm start
```

Wait until you see:
```
Compiled successfully!
Local: http://localhost:3000
```

Your browser may open automatically. If not, navigate to `http://localhost:3000`.

---

## Step 5 — Log In & Load Data

1. Go to `http://localhost:3000`
2. Click **Connect Microsoft Outlook**
3. Sign in with your Microsoft account
4. You will land on the **SmartCol AI Dashboard**

### Load mock data (recommended for demo)

Since the Microsoft Graph API requires an organisational Microsoft 365 account, use the mock sync to populate data:

1. Go to **Settings** (sidebar)
2. Under **Mock Calendar Data**, choose a profile:
   - **Balanced Workload** — normal schedule, no risks
   - **Overloaded Workload** — 12.5h/day × 3 weeks, triggers all 6 risk types + burnout score 95/critical
   - **Underloaded Workload** — minimal schedule, triggers Low Focus Time
3. Click **Load Data** — this clears previous data then runs the full pipeline:
   `Sync → Classify → Compute Workload → Detect Risks → ML Predictions`
4. Once complete, navigate to **Dashboard** and **Analytics** to see results

> The overloaded sync processes 54 events and takes about 60–90 seconds. The progress indicator will show "Syncing…" until complete.

---

## Quick Verification Checklist

| Check | URL | Expected |
|---|---|---|
| PostgreSQL | `pg_isready -h localhost -p 5432` | `accepting connections` |
| Backend health | `http://localhost:3001/health` | `{"status":"ok"}` |
| AI Service health | `http://localhost:8000/health` | `{"status":"ok","mode":"hybrid..."}` |
| Swagger UI | `http://localhost:3001/api/docs` | Interactive API documentation (45 endpoints) |
| Frontend | `http://localhost:3000` | Login page or dashboard |
| Scheduler | Settings → Background Jobs (admin) | 3 jobs show "never" on first start |

---

## What You'll See After Loading Data

| Page | What's shown |
|---|---|
| **Dashboard (personal)** | Work hours, overtime, meetings, active risk alerts, ML burnout score, 5-day workload forecast |
| **Dashboard (admin)** | Team summary stats + one tab per engineer with full workload detail |
| **Analytics** | Daily table, weekly summary, heatmap, time breakdown chart, workload forecast, burnout score, off-day recommendations |
| **Risks** | Active / Ongoing / History tabs; admin can acknowledge + email engineer |
| **Events** *(new)* | All classified events with type chip, method badge (rule-based / ML / You / Learned), confidence %; correct any misclassification inline to improve future accuracy |
| **Settings → Email Alerts** *(admin)* | Toggle each of the 6 email alert types on/off; Send Test Email button |
| **Settings → Background Jobs** *(admin)* | Status of Analytics Pipeline + Calendar Sync + Weekly Digest jobs; Run Now / Pause / Resume |
| **Swagger UI** | `http://localhost:3001/api/docs` — interactive API reference for all 45 endpoints |

---

## Admin vs Engineer Views

The application has two roles determined by the `ADMIN_EMAILS` list in `backend/.env`:

- **Admin** — sees team dashboard (tabbed members), all team risks, team off-day recommendations, background job controls, test user management
- **Engineer** — sees own dashboard, own analytics, own risks, own off-day recommendations

---

## Backend Test Pages (Admin Only)

Legacy HTML test pages for direct API testing (no React required):

| Page | URL |
|---|---|
| Auth Test | `http://localhost:3001/test-auth.html` |
| Sync Test | `http://localhost:3001/test-sync.html` |
| Analytics Panel | `http://localhost:3001/test-analytics.html` |
| Multi-User Test | `http://localhost:3001/test-multiuser.html` |

---

## Stopping Everything

```bash
# Stop frontend and backend: Ctrl+C in each terminal

# Stop classification service: Ctrl+C in its terminal

# Stop PostgreSQL
docker stop smartcol-postgres        # Docker
# OR
brew services stop postgresql@15     # Homebrew
```

Data is preserved when PostgreSQL stops — it persists to disk.

---

## Troubleshooting

**Port already in use:**
```bash
lsof -ti:3001 | xargs kill -9   # backend
lsof -ti:8000 | xargs kill -9   # classification service
lsof -ti:3000 | xargs kill -9   # frontend
```

**Backend fails to start — database error:**
Make sure PostgreSQL is running and accepting connections (`pg_isready -h localhost -p 5432`) before starting the backend.

**"relation workload_predictions does not exist":**
Migration 002 has not been run. See [First-Time Setup Only](#first-time-setup-only) above.

**"relation classification_feedback does not exist":**
Migration 004 has not been run. See [First-Time Setup Only](#first-time-setup-only) above.

**Classification service crashes at startup:**
The `venv` virtual environment may not be activated. Run `source venv/bin/activate` before `uvicorn`.

**Sync shows "classified: 0, failed: 54" in backend log:**
The classification service was not running or was still starting up when the sync triggered. Restart the classification service and run the mock sync again.

**NLI model fails to load — no internet:**
The `facebook/bart-large-mnli` model needs to download on first use (~1.6 GB). After the initial download, it loads from local cache and works offline.

**Dashboard shows "—" for all stats after sync:**
Wait a few seconds and refresh. The pipeline (classify → compute → risks → ML) may still be running. Check backend logs for `"ML predictions complete"` to confirm everything finished.

**Calendar Sync background job reports failure:**
Expected — this job requires an organisational Microsoft 365 account with admin-consented Graph API permissions. For demo use, the Analytics Pipeline job (every 30 min) handles all data refresh needs.

---

*SmartCol AI Capstone Project — Last updated: March 14, 2026*
