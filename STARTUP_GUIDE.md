# SmartCol AI — Startup Guide

A step-by-step guide to get SmartCol AI running after a fresh reboot.

---

## What You Need Running

| Service | Port | What it does |
|---|---|---|
| PostgreSQL (Docker) | 5432 | Database |
| Backend (Node.js) | 3001 | API + test pages |
| Classification Service (Python) | 8000 | AI event classifier |
| Frontend (React) | 3000 | Web app |

---

## Step 1 — Start PostgreSQL (Docker)

Open a terminal and run:

```bash
docker start smartcol-postgres
```

Verify it's running:

```bash
docker ps | grep smartcol-postgres
```

You should see a line with `Up X seconds/minutes`. If it says the container doesn't exist, run:

```bash
docker run -d \
  --name smartcol-postgres \
  -e POSTGRES_PASSWORD=fly1ngC()wN0vemberR@1n \
  -e POSTGRES_DB=smartcol \
  -p 5432:5432 \
  postgres:15
```

---

## Step 2 — Start the Backend

Open a **new terminal tab**, navigate to the backend folder, and start the server:

```bash
cd ~/Desktop/Capstone/Project/smartcol_ai/backend
npm run dev
```

Wait until you see:
```
Server listening on port 3001
```

**Verify:** Open `http://localhost:3001/health` in your browser — it should show `{"status":"ok"}`.

---

## Step 3 — Start the Classification Service (AI)

Open a **new terminal tab**:

```bash
cd ~/Desktop/Capstone/Project/smartcol_ai/classification-service
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Wait until you see:
```
Application startup complete.
Uvicorn running on http://0.0.0.0:8000
```

The ML model (`facebook/bart-large-mnli`) will load in the background — this takes about 5–10 seconds. You can check its status at `http://localhost:8000/health`.

> **Note:** The ML model is cached after the first download. Subsequent starts load it from cache (faster).

**Verify:** Open `http://localhost:8000/health` — look for `"mode": "hybrid (ml + rule-based)"`.

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

Your browser may open automatically. If not, go to `http://localhost:3000`.

---

## Step 5 — Log In

1. Go to `http://localhost:3000`
2. Click **"Sign in with Microsoft"**
3. Log in with your Microsoft account
4. You will be redirected to the SmartCol AI dashboard automatically

> **Admin users** are redirected to the backend test page (`http://localhost:3001/test-auth.html`) after login.

---

## Quick Verification Checklist

After all services are running, confirm each is healthy:

| Check | Expected Result |
|---|---|
| `http://localhost:3001/health` | `{"status":"ok"}` |
| `http://localhost:8000/health` | `{"status":"ok", "mode":"hybrid..."}` |
| `http://localhost:3000` | SmartCol AI login or dashboard |

---

## Test Pages (Admin Only)

| Page | URL |
|---|---|
| Auth Test | `http://localhost:3001/test-auth.html` |
| Sync Test | `http://localhost:3001/test-sync.html` |
| Analytics Panel | `http://localhost:3001/test-analytics.html` |
| Multi-User Test | `http://localhost:3001/test-multiuser.html` |

---

## Stopping Everything

When you're done for the day:

```bash
# Stop the Docker PostgreSQL container (data is preserved)
docker stop smartcol-postgres

# Stop the other terminals by pressing Ctrl+C in each one
```

---

## Troubleshooting

**Port already in use:**
```bash
# Find and kill process on a specific port (e.g. 3001)
lsof -ti:3001 | xargs kill -9
```

**Backend fails to start (database error):**
Make sure Step 1 (Docker) completed successfully before starting the backend.

**ML model fails to load:**
The model downloads from HuggingFace on first use. Make sure you have an internet connection on first run. Subsequent starts use the local cache.

**Frontend shows blank / API errors:**
Make sure both the backend (port 3001) and classification service (port 8000) are running before using the frontend.

---

*SmartCol AI Capstone Project — March 2026*
