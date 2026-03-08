# SmartCol AI - Calendar Intelligence & Workload Management System

## 📋 Executive Summary

**SmartCol AI** is a comprehensive workload management system that integrates with Microsoft Outlook to provide intelligent calendar analysis, AI-powered event classification, overtime tracking, and workload insights with risk detection.

### Key Features

✅ **Microsoft Outlook Integration** - Seamless OAuth 2.0 authentication and automated calendar sync
✅ **AI-Powered Classification** - Automatically categorize meetings and tasks using hybrid ML + rule-based approach
✅ **Time Analytics Dashboard** - Visual breakdown of time spent by task type, project, and period
✅ **Overtime Tracking** - Monitor daily/weekly hours with configurable thresholds
✅ **Smart Recommendations** - AI-suggested optimal days for time-off based on workload patterns
✅ **Risk Detection** - Identify burnout risk, meeting overload, and overlapping deadlines
✅ **Real-time Notifications** - Multi-channel alerts (email, push, in-app)
✅ **Enterprise Security** - Encrypted token storage, Azure Key Vault, GDPR compliance

---

## 📚 Documentation Structure

This project contains comprehensive technical specifications across multiple documents:

### Core Documentation

1. **[SYSTEM_DESIGN]** - Complete system architecture, tech stack, and database schema
   - Technology stack and architecture diagrams
   - Comprehensive database schema with all tables
   - Microsoft Graph API integration implementation
   - OAuth 2.0 authentication flow
   - Calendar sync service with delta queries

2. **[AI_CLASSIFICATION_SYSTEM]** - AI/NLP classification engine
   - Hybrid classification approach (rule-based + ML)
   - Feature extraction and NLP processing
   - Python FastAPI microservice implementation
   - Classification rules and keyword matching
   - Active learning from user feedback
   - 10 predefined task types with confidence scoring

3. **[ANALYTICS_DASHBOARD]** - Analytics, dashboards, and overtime tracking
   - Dashboard wireframes and UI design
   - Time breakdown by task type and project
   - Daily workload heatmap visualization
   - Historical trends and KPIs
   - Overtime calculation service
   - Off-day recommendation engine with priority scoring

4. **[RISK_SECURITY_NOTIFICATIONS]** - Risk detection, security, and notifications
   - 6 risk detection algorithms (burnout, high workload, etc.)
   - Security architecture and best practices
   - Azure Key Vault integration for secrets
   - Multi-channel notification system
   - GDPR compliance and data protection
   - Configurable notification preferences

5. **[DEPLOYMENT_GUIDE]** - Deployment, configuration, and operations (To be Included in the Project)
   - Azure cloud infrastructure setup
   - CI/CD pipelines with GitHub Actions
   - Frontend React implementation examples
   - Database migrations and scaling
   - Monitoring and logging with Application Insights
   - Cost optimization strategies
   - Troubleshooting guide

---

## 🏗️ System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │   React Frontend (SPA)                                    │   │
│  │   - Dashboard  - Analytics  - Settings  - Notifications   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTPS/WSS
┌─────────────────────────┴───────────────────────────────────────┐
│                      API GATEWAY LAYER                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │   Express.js + Socket.io                                  │   │
│  │   - Authentication  - Rate Limiting  - Request Validation │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────┬───────────────────────────┬────────────────────────────┘
          │                           │
┌─────────┴──────────┐    ┌──────────┴────────────────────────────┐
│  BUSINESS LOGIC    │    │   AI/ML SERVICE (Python)              │
│  ┌──────────────┐  │    │  ┌─────────────────────────────────┐  │
│  │ Auth Service │  │    │  │ Classification Engine           │  │
│  │ Sync Service │  │    │  │ - NLP Processing                │  │
│  │ Event Service│  │    │  │ - ML Models                     │  │
│  │ Analytics Svc│  │    │  │ - Rule Engine                   │  │
│  │ Risk Service │  │    │  │ - Active Learning               │  │
│  │ Notification │  │    │  └─────────────────────────────────┘  │
│  └──────────────┘  │    └───────────────────────────────────────┘
└─────────┬──────────┘                        │
          │                                   │
┌─────────┴───────────────────────────────────┴───────────────────┐
│                     DATA LAYER                                   │
│  ┌──────────────┐  ┌──────────┐  ┌────────────────────────┐     │
│  │ PostgreSQL   │  │  Redis   │  │  Microsoft Graph API   │     │
│  │ - Users      │  │ - Tokens │  │  - Calendar Events     │     │
│  │ - Events     │  │ - Cache  │  │  - User Profile        │     │
│  │ - Tags       │  │ - Jobs   │  │  - Mail (notifications)│     │
│  │ - Analytics  │  └──────────┘  └────────────────────────┘     │
│  └──────────────┘                                                │
└──────────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Backend:**
- Node.js 20+ with TypeScript
- Express.js (REST API)
- PostgreSQL 15+ (primary database)
- Redis 7+ (caching, sessions, job queue)
- Bull (background jobs)

**AI/ML Service:**
- Python 3.11+ with FastAPI
- spaCy, scikit-learn, transformers (Hugging Face)
- Zero-shot classification with BART

**Frontend:**
- React 18+ with TypeScript
- Redux Toolkit + RTK Query
- Material-UI (MUI) v5
- Recharts for data visualization

**Infrastructure:**
- Azure App Service
- Azure Database for PostgreSQL
- Azure Cache for Redis
- Azure Key Vault
- Azure Application Insights

---

## 🎯 Core Features

### 1. Microsoft Graph Integration

**Capabilities:**
- OAuth 2.0 delegated authentication
- Automated calendar sync (every 15 minutes)
- Delta queries for efficient incremental sync
- Support for recurring events and updates
- Timezone-aware event processing

**Permissions Required:**
- `User.Read` - Read user profile
- `Calendars.Read` - Read calendar events
- `Calendars.Read.Shared` - Read shared calendars
- `MailboxSettings.Read` - Read user timezone
- `offline_access` - Refresh token support

### 2. AI Event Classification

**Task Types (10 predefined):**
1. **Deadline** - Tasks with specific due dates
2. **Ad-hoc Troubleshooting** - Urgent unplanned issues
3. **Project Milestone** - Key project checkpoints
4. **Routine Meeting** - Regular scheduled meetings
5. **1:1 Check-in** - One-on-one meetings
6. **Admin/Operational** - Administrative tasks
7. **Training/Learning** - Skill development
8. **Focus Time** - Dedicated deep work blocks
9. **Break/Personal** - Lunch, breaks, personal time
10. **Out of Office** - Vacation, sick leave, holidays

**Classification Approach:**
- **Hybrid Model**: 60% ML + 40% Rules weighted voting
- **Confidence Scoring**: 0.0 to 1.0 scale
- **User Feedback Loop**: Active learning from corrections
- **Multi-label Support**: Task type + project category

**Classification Accuracy:**
- High confidence (>0.75): 70% of events
- Medium confidence (0.50-0.75): 20% of events
- Low confidence (<0.50): 10% flagged for manual review

### 3. Analytics & Dashboards

**Time Breakdown:**
- By task type (bar charts, pie charts)
- By project/category
- By time period (day/week/month/quarter)
- Percentage distribution

**Key Metrics:**
- Total hours per week
- Overtime hours (vs. standard 40h/week)
- Utilization rate
- Average meeting length
- Context switching frequency
- Meeting count and distribution

**Visualizations:**
- Stacked bar charts for weekly breakdown
- Pie charts for project distribution
- Heatmaps for daily workload patterns
- Line charts for historical trends

### 4. Overtime Tracking

**Features:**
- Configurable standard hours (default 8h/day, 40h/week)
- Daily and weekly overtime calculation
- Work vs. non-work event filtering
- Historical overtime trends
- Breakdown by task type

**Business Rules:**
- Only "work time" task types count toward hours
- Configurable work days (default Mon-Fri)
- Configurable work hours (default 9 AM - 5 PM)
- Overtime threshold alerts

### 5. Off-Day Recommendations

**Recommendation Engine:**
- Analyzes next 30 days of calendar
- Calculates workload score for each day
- Considers upcoming deadlines (±3 day window)
- Factors in meeting count
- Generates priority score (0-100, higher = better for time-off)

**Scoring Algorithm:**
```
Priority Score =
  (100 - Workload Score) × 0.4 +
  (100 - Deadline Count × 20) × 0.3 +
  (100 - Meeting Count × 10) × 0.2 +
  (100 - Days In Future / 30 × 20) × 0.1
```

**Output:**
- Top 10 recommended days
- Human-readable reasons
- Workload metrics for context

### 6. Risk Detection

**Six Risk Types:**

1. **High Daily Workload**
   - Trigger: >10 hours/day for 4+ consecutive days
   - Severity: High (≥12h/day), Critical

2. **Burnout Risk**
   - Trigger: >50 hours/week for 3+ consecutive weeks
   - Severity: Critical

3. **Overlapping Deadlines**
   - Trigger: 2+ deadlines within 3-day window
   - Severity: Medium to High (based on priority)

4. **Excessive Troubleshooting**
   - Trigger: >8 hours/week of ad-hoc incidents
   - Severity: Medium (>8h), High (>15h)

5. **Low Focus Time**
   - Trigger: <5 hours/week of dedicated focus blocks
   - Severity: Low to Medium

6. **Meeting Overload**
   - Trigger: >20 hours or 25+ meetings per week
   - Severity: Medium (>20h), High (>25h)

**Risk Scoring:**
- Each risk has 0-100 score
- Automated alerts for High/Critical severity
- Dashboard visualization of active risks
- User acknowledgment workflow

### 7. Notifications

**Channels:**
- **Email** - For high-priority alerts and weekly summaries
- **Push Notifications** - Real-time mobile alerts
- **In-App** - WebSocket-powered real-time updates

**Notification Types:**
- Risk alerts (burnout, high workload, etc.)
- Overtime warnings
- Off-day recommendations
- Weekly summary digest
- Classification feedback requests

**Preferences:**
- Per-channel enable/disable
- Minimum severity filtering
- Quiet hours (e.g., 10 PM - 8 AM)
- Weekly summary opt-in/out

---

## 🔒 Security & Compliance

### Authentication & Authorization

**OAuth 2.0 with PKCE:**
- Authorization code flow
- CSRF protection with state parameter
- Refresh token rotation
- Automatic token refresh (5-minute buffer before expiry)

**Token Storage:**
- Access tokens: Redis (short-lived, 1 hour)
- Refresh tokens: PostgreSQL (encrypted with AES-256-GCM)
- Encryption key: Azure Key Vault
- Token hashing: SHA-256

### Data Protection

**Encryption:**
- At rest: Azure Database encryption
- In transit: TLS 1.2+ (HTTPS)
- Token encryption: AES-256-GCM with per-token IV
- Key management: Azure Key Vault with RBAC

**GDPR Compliance:**
- Data minimization (only necessary Graph API permissions)
- Right to access (user data export)
- Right to deletion (account deletion workflow)
- Audit logging for all data access
- Data residency (Azure region selection)

**Security Headers:**
- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options (clickjacking protection)
- X-Content-Type-Options (MIME sniffing protection)

### Least Privilege

**Microsoft Graph Permissions:**
- Read-only calendar access (no write permissions)
- No email or file access
- No admin permissions
- Delegated (not application) permissions

**Database Access:**
- Application service account: SELECT, INSERT, UPDATE only
- No DELETE on critical tables
- Separate admin role for migrations

---

## 📊 Performance & Scalability

### Caching Strategy

**Redis Caching:**
- Access tokens (TTL: 1 hour)
- Analytics queries (TTL: 15 minutes)
- User settings (TTL: 1 hour)
- OAuth state (TTL: 10 minutes)

**Database Optimization:**
- Indexed queries on user_id + date ranges
- Materialized views for complex analytics
- Query result pagination (max 100 records)
- Connection pooling (pg-pool)

### Background Jobs

**Bull Queue Jobs:**
1. **Calendar Sync** - Every 15 minutes per active user
2. **Event Classification** - On event create/update
3. **Daily Overtime Calculation** - 1 AM daily
4. **Risk Detection** - 6 AM daily
5. **Off-Day Recommendations** - Weekly on Sunday
6. **Weekly Summary Email** - Monday 8 AM

**Job Priorities:**
- High: Classification (real-time)
- Medium: Sync (15-min interval)
- Low: Reports and recommendations

### Auto-Scaling

**App Service Scaling Rules:**
- Min instances: 2 (production)
- Max instances: 10
- Scale out: CPU >70% for 5 minutes
- Scale in: CPU <30% for 10 minutes

**Database Scaling:**
- PostgreSQL Flexible Server with zone-redundancy
- Read replicas for analytics queries (optional)
- Automatic storage scaling

---

## 📈 Monitoring & Observability

### Application Insights

**Metrics Tracked:**
- Request rate and response times
- Dependency calls (database, Redis, Graph API)
- Exception rates and stack traces
- Custom events (logins, syncs, classifications)

**Alerts:**
- API response time >2 seconds
- Error rate >5%
- Graph API failures >10%
- Database connection failures

### Logging

**Structured JSON Logging:**
```json
{
  "level": "info",
  "message": "Calendar sync completed",
  "userId": "user-123",
  "eventsFetched": 45,
  "eventsCreated": 5,
  "eventsUpdated": 10,
  "duration": 3.2,
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

**Log Retention:**
- Application logs: 30 days
- Audit logs: 90 days
- Security logs: 1 year

---

## 💰 Cost Estimation

### Monthly Azure Costs (USD)

| Service | Configuration | Estimated Cost |
|---------|--------------|----------------|
| App Service (P1V2) | 2 instances | $140 |
| PostgreSQL (Standard_B2s) | Flexible Server | $50 |
| Redis (Standard C1) | 1GB cache | $75 |
| Key Vault | Secrets + operations | $5 |
| Application Insights | Standard tier | $20 |
| Static Web App | Standard tier | $10 |
| Bandwidth | ~100GB/month | $10 |
| **Total** | | **~$310/month** |

**Cost Optimization:**
- Use burstable database tier for dev/test (-40%)
- Reserved instances for production (-40%)
- Auto-scaling to reduce idle capacity
- CDN caching to reduce bandwidth

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL 15+
- Redis 7+
- Azure subscription
- Microsoft 365 account

### Local Development

```bash
# 1. Clone repository
git clone https://github.com/your-org/smartcol-ai.git
cd smartcol-ai

# 2. Setup backend
cd backend
npm install
cp .env.example .env
# Edit .env with local configuration

# 3. Start database
docker-compose up -d postgres redis

# 4. Run migrations
npm run migrate

# 5. Setup AI service
cd ../classification-service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm

# 6. Setup frontend
cd ../frontend
npm install

# 7. Start all services
npm run dev:all
```

### Production Deployment

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for complete Azure deployment instructions.

---

## 📖 API Documentation

### Authentication Endpoints

```
GET  /api/auth/connect           Get OAuth authorization URL
GET  /api/auth/callback          OAuth callback handler
POST /api/auth/disconnect        Revoke access and delete tokens
GET  /api/auth/status            Check connection status
```

### Calendar Endpoints

```
POST /api/calendar/sync          Trigger manual calendar sync
GET  /api/calendar/events        Get processed events with filters
GET  /api/calendar/events/:id   Get single event details
GET  /api/calendar/sync-history Get sync history
```

### Analytics Endpoints

```
GET /api/analytics/dashboard         Full dashboard data
GET /api/analytics/weekly-summary    Weekly KPIs
GET /api/analytics/time-breakdown    Time by task type
GET /api/analytics/project-breakdown Time by project
GET /api/analytics/heatmap           Daily workload heatmap
GET /api/analytics/trends            Historical trends
```

### Risk & Overtime Endpoints

```
GET  /api/risks/active                 Active risk alerts
POST /api/risks/:id/acknowledge        Acknowledge alert
GET  /api/overtime/weekly              Weekly overtime summary
GET  /api/overtime/trends              Overtime trends
GET  /api/overtime/recommendations     Off-day recommendations
```

Full API documentation available at `/api/docs` (Swagger UI).

---

## 🧪 Testing

### Backend Tests

```bash
cd backend
npm test              # Unit tests
npm run test:e2e      # End-to-end tests
npm run test:coverage # Coverage report
```

### AI Service Tests

```bash
cd classification-service
pytest                # All tests
pytest --cov          # With coverage
```

### Frontend Tests

```bash
cd frontend
npm test              # Jest unit tests
npm run test:e2e      # Cypress E2E tests
```

---

## 📝 License

This project is proprietary software. All rights reserved.

---

## 🎯 Implementation Checklist

### Phase 1: Foundation (Weeks 1-2)
- [x] Azure infrastructure setup
- [x] Database schema creation
- [x] OAuth 2.0 authentication flow
- [x] Basic calendar sync
- [x] Token management with encryption

### Phase 2: AI Classification (Weeks 3-4)
- [x] Python microservice setup
- [x] Rule engine implementation
- [x] ML model training
- [x] Classification API endpoints
- [x] Integration with backend

### Phase 3: Analytics (Weeks 5-6)
- [x] Analytics service implementation
- [x] Dashboard API endpoints
- [x] Frontend dashboard components
- [O] Chart visualizations

### Phase 4: Advanced Features (Weeks 7-8)
- [x] Risk detection algorithms
- [x] Overtime calculation service
- [x] Off-day recommendation engine
- [O] Background job scheduling

### Phase 5: Polish & Deploy (Weeks 9-10)
- [x] Notification system
- [x] Email templates
- [x] WebSocket real-time updates
- [O] CI/CD pipelines
- [O] Production deployment
- [O] Monitoring and alerts
- [x] User documentation

---
