# SmartCol AI — Test Guide

This guide covers everything you need to run, demonstrate, and extend the tests for SmartCol AI.

---

## 1. Prerequisites

Make sure the following are running before any test:

### PostgreSQL
```bash
# Verify it is accepting connections
pg_isready -h localhost -p 5432 -U postgres
```

### Backend (Express + TypeScript) — Port 3001
```bash
cd /path/to/smartcol_ai/backend
npm run dev
```
Verify: `http://localhost:3001/health` → `{"status":"ok"}`

### Classification Service (Python FastAPI) — Port 8000
```bash
cd /path/to/smartcol_ai/classification-service
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Verify: `http://localhost:8000/health` → `{"status":"ok","ml_model":{"ready":true},"mode":"hybrid (ml + rule-based)"}`

### Frontend (React) — Port 3000
```bash
cd /path/to/smartcol_ai/frontend
npm start
```
Verify: `http://localhost:3000` → React app loads in the browser

> **All three services must be running** before testing. The full pipeline (sync → classify → workload → risks → ML predictions) requires the backend and classification service. The frontend requires the backend as its API proxy.

---

## 2. Test Pages Overview

All test pages are served by the backend at `http://localhost:3001`.

| Page | URL | Purpose |
|---|---|---|
| 🔐 Auth | `/test-auth.html` | Microsoft OAuth login/logout |
| 🗓️ Sync | `/test-sync.html` | Mock/real calendar sync + event listing |
| 📊 Analytics | `/test-analytics.html` | Workload dashboard, time breakdown, heatmap, risk detection |
| 👥 Multi-User | `/test-multiuser.html` | 4-profile multi-user test dashboard |

Navigate between pages using the **nav bar** at the top of each page.

---

## 3. Test Scenario A — Single User (OAuth Flow)

This tests the full pipeline for a real authenticated user.

### Steps

**Step 1 — Authenticate**
1. Open `http://localhost:3001/test-auth.html`
2. Click **"Sign in with Microsoft"**
3. Complete the Microsoft login
4. You will be automatically redirected back to the auth page showing your name, email, and user ID

**Step 2 — Mock Calendar Sync**
1. Navigate to `http://localhost:3001/test-sync.html`
2. Click **"🎭 Mock Sync (Demo Data)"**
3. The response panel shows:
   - Events added/updated
   - Classifications completed
   - Workload days/weeks processed
   - Risks detected

**Step 3 — View Events**
1. Click **"📅 Get Events"** — lists all 8 mock calendar events
2. Click **"⏰ Get Upcoming Events"** — shows only future events
3. Click **"📊 Get Sync Status"** — shows sync history and event counts

**Step 4 — View Analytics**
1. Navigate to `http://localhost:3001/test-analytics.html`
2. Click each button in order:
   - **"📋 Load Dashboard"** — current week summary + upcoming events
   - **"🕐 Load Breakdown"** — bar chart of time by task type
   - **"📅 Load Daily"** — per-day workload table
   - **"📆 Load Weekly"** — weekly summary table
   - **"🔥 Load Heatmap"** — colour-coded day tiles

**Step 5 — View Risk Alerts**
1. Scroll to **Section 7 — Risk Detection**
2. Click **"⚠️ Run Risk Detection"**
3. Expected alerts for the mock data:
   - **Low Focus Time** (only 3h focus, below 5h threshold)
4. Use the tabs to explore:
   - **Active** — newly detected alerts
   - **Ongoing** — acknowledged alerts (working on it)
   - **History** — full alert log

### Expected Risk Alert Lifecycle
| Action | Result |
|---|---|
| Click **Acknowledge** | Alert moves to Ongoing tab |
| Run detection again (condition still exists) | Alert stays in Ongoing with updated metrics |
| Improve focus time + re-sync + re-detect | Alert auto-resolves |
| Click **Dismiss** | Force-closes the alert at any stage |

---

## 4. Test Scenario B — Multi-User Test

Tests 4 different workload profiles simultaneously without requiring OAuth.

### Steps

1. Open `http://localhost:3001/test-multiuser.html`
2. Click **"🌱 Seed Test Users & Run Pipeline"**
3. Wait ~10–15 seconds for all 4 users to be seeded and processed
4. The dashboard renders a card per user showing:
   - Name, email, and profile badge (BALANCED / UNDERLOADED / OVERLOADED / MEETING-HEAVY)
   - Stats: total work, peak day, focus time, meeting time, overtime
   - Time distribution bar
   - Risk alerts with severity and score

### Expected Outcomes

| User | Profile | Expected Risks |
|---|---|---|
| ✅ Alex Rivera | Balanced (~7h/day) | **None** |
| 💤 Jamie Lim | Underloaded (~2h/day) | Low Focus Time |
| 🔥 Morgan Cruz | Overloaded (~11h/day) | High Daily Workload, Burnout Risk, Excessive Troubleshooting, Low Focus Time, Meeting Overload |
| 📅 Taylor Wong | Meeting-heavy (~8h/day, 6h meetings) | Meeting Overload, Low Focus Time |

> Click **"🔄 Refresh Dashboard"** at any time to reload the latest computed data without re-seeding.

---

## 5. Adding a New Test User

To add a **custom test user** with your own event schedule:

### Step 1 — Define the user profile

Open `backend/src/services/test-seed.service.ts` and add a new entry to the `PROFILES` array at the bottom of the file:

```typescript
{
  email: 'your.user@smartcol-test.com',
  displayName: 'Your User Name',
  timezone: 'Asia/Singapore',
  weeklyEvents: [
    // Add event templates here (repeated for 3 weeks)
    {
      subject: 'Daily Standup',
      dayOfWeek: 0,      // 0=Monday, 1=Tuesday, ... 4=Friday
      startHour: 9,
      startMin: 0,
      durationMin: 30,
      taskTypeId: 4,     // See task type reference below
    },
    // ... more events
  ],
},
```

### Task Type Reference

| ID | Name | Counts As |
|---|---|---|
| 1 | Deadline | Work, Deadline |
| 2 | Ad-hoc Troubleshooting | Work, Troubleshooting |
| 3 | Project Milestone | Work |
| 4 | Routine Meeting | Work, Meeting |
| 5 | 1:1 Check-in | Work, Meeting |
| 6 | Admin/Operational | Work |
| 7 | Training/Learning | Work |
| 8 | Focus Time | Work, Focus |
| 9 | Break/Personal | Not counted as work |
| 10 | Out of Office | Not counted as work |

### Step 2 — Re-run the seed

Go to `http://localhost:3001/test-multiuser.html` and click **"🌱 Seed Test Users & Run Pipeline"** again. The new user will be created and appear as a new card.

---

## 6. Adding More Mock Calendar Events (Single User)

To add more events to the **single-user mock sync**:

Open `backend/src/services/mock-calendar-sync.service.ts` and add a new event block inside the `generateMockEvents` function:

```typescript
events.push({
  user_id: userId,
  graph_event_id: `mock-event-${userId}-9`,    // increment the number
  graph_calendar_id: 'mock-calendar-primary',
  subject: 'Your Event Title',
  body_preview: 'Description of the event',
  start_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 10, 0),
  end_time:   new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 11, 0),
  is_all_day: false,
  is_recurring: false,
  recurrence_pattern: null,
  location: 'Room / Online',
  attendees: [
    { email: 'colleague@company.com', name: 'Colleague Name', type: 'required', status: 'accepted' },
  ],
  organizer_email: 'you@company.com',
  status: 'confirmed',
  response_status: 'organizer',
  is_cancelled: false,
  raw_data: { source: 'mock', type: 'your-type' },
  last_modified_at: new Date(),
});
```

Then go to `http://localhost:3001/test-sync.html` and click **"🎭 Mock Sync (Demo Data)"** to sync the new event.

> **Important:** Always increment the number at the end of `graph_event_id` (e.g. `-9`, `-10`) to avoid conflicts with existing events.

---

## 7. Resetting Test Data

### Reset a single user's data (keep the user, clear events)
```sql
-- Connect to the database first:
PGPASSWORD="fly1ngC()wN0vemberR@1n" psql -h localhost -U postgres -d smartcol

-- Clear everything for your user (replace the email):
DELETE FROM risk_alerts        WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
DELETE FROM daily_workload     WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
DELETE FROM weekly_workload    WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
DELETE FROM event_classifications WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
DELETE FROM calendar_events    WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
DELETE FROM sync_history       WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
```

### Reset all test (seeded) users
```sql
DELETE FROM users WHERE email LIKE '%@smartcol-test.com';
-- Cascades to all related tables automatically
```

### Reset only risk alerts (to re-test detection from scratch)
```sql
DELETE FROM risk_alerts WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
```

### Reset only workload (to recompute)
```sql
DELETE FROM daily_workload  WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
DELETE FROM weekly_workload WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
```

---

## 8. Risk Detection Thresholds (Reference)

| Risk | Trigger Condition | Severity |
|---|---|---|
| High Daily Workload | Work > 10h on any day | High |
| Burnout Risk | Work > 50h/week for 3+ consecutive weeks | Critical |
| Overlapping Deadlines | 2+ deadlines within 3 days | Medium |
| Excessive Troubleshooting | Ad-hoc work > 8h/week | Medium |
| Low Focus Time | Focus blocks < 5h/week | Low |
| Meeting Overload | Meeting time > 20h/week **or** 25+ meetings | Medium |

---

## 9. Off-Day Recommendations

The off-day engine analyses workload patterns and recommends optimal rest days.

### Entitlement Rules

| Trigger | Earned Days |
|---|---|
| Weekday with ≥ 12 hours of work | +1 |
| Any weekend day with work time > 0 | +1 |

**Balance** = earned − accepted. Recommendations are capped to available balance.

### Endpoints (all require auth)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/offday/generate` | Generate recommendations (query: `?userId=` for admin) |
| GET | `/api/offday/balance` | Entitlement balance (earned, used, available) |
| GET | `/api/offday/pending` | Pending recommendations only |
| GET | `/api/offday/all` | All recommendations (any status) |
| GET | `/api/offday/team` | Admin: all users' pending recommendations |
| POST | `/api/offday/:id/accept` | Accept a recommendation |
| POST | `/api/offday/:id/reject` | Decline a recommendation |

### How to Test

1. Go to **Settings** in the frontend → load **"Overloaded"** mock data (generates Saturday work + high daily hours to trigger entitlements)
2. Navigate to **Analytics** → scroll to Off-Day Recommendations section
3. Click **"Generate"** to analyse the next 30 days
4. Recommendations appear with priority scores (0–100)
5. Click **Accept** or **Decline** for each
6. Balance banner shows earned vs available off-days (green = healthy, amber = low)
7. **Admin view:** select a team member from the dropdown → their recommendations appear in a tabbed view

---

## 10. ML Workload Prediction and Burnout Scoring

Two machine-learning models run inside the classification service (port 8000) and are proxied through the backend.

### Classification Service Endpoints

| Method | Endpoint | Model | Output |
|---|---|---|---|
| POST | `/predict/workload` | RandomForestRegressor | 5-day forecast with confidence bands |
| POST | `/score/burnout` | GradientBoostingClassifier | 0–100 score, 5 levels |

Both models are trained on synthetic data at service startup — no external dataset is required.

### Backend Proxy Endpoints (all require auth)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/ml/predict` | Run both models for the session user |
| GET | `/api/ml/workload-forecast` | Get 5-day forecast (auto-generates if missing) |
| GET | `/api/ml/burnout-score` | Get latest burnout score (auto-generates if missing) |

### Burnout Levels

| Score Range | Level |
|---|---|
| 0–20 | Low |
| 21–40 | Moderate |
| 41–60 | At Risk |
| 61–80 | High |
| 81–100 | Critical |

### How to Test

1. In the frontend **Dashboard**, the **Workload Forecast** card shows a 5-day bar chart with confidence bands
2. The **Burnout Score** card shows a circular progress indicator (0–100) with a colour-coded level
3. Both auto-generate on first fetch if no data exists
4. Updated automatically by the background analytics pipeline (every 30 minutes)
5. Direct API test (classification service):
   ```bash
   curl -X POST http://localhost:8000/predict/workload \
     -H "Content-Type: application/json" \
     -d '{"historical_daily":[
       {"date":"2026-03-10","work_minutes":480,"meeting_minutes":120,"focus_minutes":180,"deadline_count":1},
       {"date":"2026-03-11","work_minutes":500,"meeting_minutes":100,"focus_minutes":200,"deadline_count":2},
       {"date":"2026-03-12","work_minutes":420,"meeting_minutes":90,"focus_minutes":150,"deadline_count":0}
     ]}'
   ```

---

## 11. Analytics Export

Export workload analytics as CSV or PDF.

### Endpoint

```
GET /api/analytics/export?format=csv|pdf&userId=<optional>
```

| Parameter | Required | Description |
|---|---|---|
| `format` | Yes | `csv` or `pdf` |
| `userId` | No | Admin-only — export a specific user's report; omit for own data |

### Report Contents

| Section | CSV | PDF |
|---|---|---|
| Daily Workload (last 30 days) | Yes | Yes |
| Weekly Summary (last 8 weeks) | Yes | Yes |
| Time Breakdown by Task Type | Yes | Yes |
| Team Workload Overview (admin, no userId) | Yes | Yes |
| Manager Recommendations (admin, no userId) | Yes | Yes |

### How to Test

1. In the frontend **Analytics** page, export buttons appear in the top-right corner
2. **Personal user:** buttons read "CSV — My Report" / "PDF — My Report"
3. **Admin (no user selected):** buttons read "CSV — Team Report" / "PDF — Team Report"
4. **Admin (user selected from dropdown):** buttons read "CSV — [Name]" / "PDF — [Name]"
5. Downloaded filenames include a timestamp, e.g. `smartcol-Team-Report-2026-03-14_14-30-45.csv`

---

## 12. Background Scheduler (Admin Only)

Three cron jobs run in the background, registered at server startup.

### Scheduled Jobs

| Job | Schedule | What It Does |
|---|---|---|
| Analytics Pipeline | Every 30 minutes | Classify → Compute workload → Detect risks → ML predictions (all users with events) |
| Calendar Sync | Every 2 hours | Microsoft Graph sync for users with valid tokens, then full pipeline |
| Weekly Digest | Mondays at 8 AM | Weekly summary email |

### Admin Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/scheduler/status` | Status of all jobs (last run, next run, duration, errors) |
| POST | `/api/scheduler/trigger` | Run a job immediately — body: `{"jobKey":"analyticsPipeline"}` |
| POST | `/api/scheduler/toggle` | Pause/resume a job — body: `{"jobKey":"analyticsPipeline","enabled":false}` |

### How to Test

1. In the frontend **Settings** page (admin only), scroll to the **"Background Jobs"** card
2. Each job shows: last run time, duration, users processed, next estimated run, status badge
3. Click **"Run Now"** to trigger a job immediately (button disables while running)
4. Click **"Pause"** / **"Resume"** to toggle the schedule on or off
5. Status auto-refreshes every 15 seconds; click **"Refresh"** for immediate update

---

## 13. Frontend React Application

The frontend is a React + Material UI application that provides role-based views.

### Pages

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Work summary, upcoming events, ML forecast + burnout cards |
| `/analytics` | Analytics | Daily/weekly tables, time breakdown, heatmap, off-day recs, export |
| `/risks` | Risks | Active/ongoing/history risk alerts with acknowledge/dismiss |
| `/events` | Events | Calendar events with keyword search + task type filter |
| `/settings` | Settings | Mock sync options, email alerts, background jobs (admin) |

### Role-Based Views

| Feature | Normal User | Admin |
|---|---|---|
| Dashboard | Personal stats only | Team member cards with load levels + risk counts |
| Analytics | Own data | User selector dropdown to view any team member |
| Risks | Own alerts | All team risks + "Acknowledge & Notify" (sends email) |
| Off-Day Recs | Own balance + recs | Tabbed per-member view |
| Settings | Mock sync (balanced / overloaded / underloaded) | + Email alerts, background jobs |
| Sidebar | Standard links | + Links to 4 backend test pages |

### Events Page — Search and Filter

1. Navigate to `/events` in the frontend
2. Use the **keyword search** box to filter events by title or description
3. Use the **task type dropdown** to filter by classification type
4. Counter shows **filtered / total** events
5. Filtering is client-side and instant

---

## 14. Full Pipeline Reference

Every Mock Sync triggers the full pipeline automatically:

```
Mock Sync
  └─► Classify Events           (Python AI service → event_classifications)
        └─► Compute Workload    (daily_workload + weekly_workload)
              └─► Detect Risks  (risk_alerts)
                    └─► ML Predictions  (workload_predictions + burnout_scores)
```

You can also trigger each step manually from `test-analytics.html`:
- **⚙️ Compute Workload** — recomputes from existing classifications
- **⚠️ Run Risk Detection** — re-runs detection (useful after acknowledging alerts and making calendar changes)

The **background scheduler** runs this pipeline automatically every 30 minutes for all users with events.

---

## 15. Demonstration Checklist

Use this checklist when presenting SmartCol AI:

### Setup
- [ ] All 3 services running — backend (`/health`), classifier (`/health`), frontend (port 3000)
- [ ] PostgreSQL accepting connections (19 tables present)

### Backend Test Pages
- [ ] Log in via `test-auth.html` — show OAuth redirect and user info display
- [ ] Run **Mock Sync** on `test-sync.html` — show pipeline response (sync + classify + workload + risks + ML)
- [ ] Show **Get Events** — 8 classified events listed
- [ ] Open `test-analytics.html`:
  - [ ] Dashboard — current week stats + upcoming events
  - [ ] Time Breakdown — bar chart by task type
  - [ ] Daily Workload — table with overtime column
  - [ ] Weekly Summary — multi-week view
  - [ ] Heatmap — colour-coded days
  - [ ] Risk Detection — Low Focus Time alert appears
  - [ ] Acknowledge alert → moves to Ongoing tab
  - [ ] Dismiss alert → removed from active
- [ ] Open `test-multiuser.html`:
  - [ ] Click Seed — all 4 users processed
  - [ ] Show Alex (no risks) vs Morgan (5 risks) side by side
  - [ ] Point out per-user name, email, profile badge, stats, and risk pills

### Frontend React App
- [ ] Dashboard — personal stats or team overview (admin)
- [ ] ML cards — Workload Forecast (5-day bar chart) + Burnout Score (circular gauge)
- [ ] Analytics — daily/weekly tables, time breakdown, heatmap
- [ ] Off-Day Recommendations — generate, accept/decline, balance banner
- [ ] Export — download CSV and PDF reports (personal or team)
- [ ] Risks — active/ongoing/history tabs, acknowledge + dismiss
- [ ] Events — search by keyword, filter by task type
- [ ] Settings — load balanced/overloaded/underloaded mock data
- [ ] Settings (admin) — background jobs status, Run Now, Pause/Resume

### Key Lifecycle to Explain
- [ ] Risk lifecycle: detect → acknowledge → auto-resolve (or dismiss)
- [ ] Off-day entitlement: overtime/weekend work → earned days → recommendations → accept/decline
- [ ] Full pipeline: sync → classify → workload → risks → ML predictions
- [ ] Background scheduler: auto-runs pipeline every 30 minutes

---

*Last updated: March 14, 2026 | SmartCol AI Capstone Project*
