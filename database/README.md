# SmartCol AI Database

PostgreSQL database schema and migrations for SmartCol AI.

## Database Schema Overview

### Core Tables

**Users & Authentication**
- `users` - User accounts with work schedule settings
- `oauth_tokens` - Encrypted Microsoft Graph tokens
- `task_types` - Predefined event classification types (10 types)
- `project_categories` - User-defined project categories

**Calendar & Events**
- `calendar_events` - Events synced from Microsoft Graph
- `event_classifications` - AI classifications with confidence scores
- `sync_history` - Calendar sync job tracking

**Analytics & Metrics**
- `daily_workload` - Pre-aggregated daily metrics
- `weekly_workload` - Weekly summary statistics
- `risk_alerts` - Detected workload risks
- `risk_types` - Risk detection algorithms

**Recommendations & Notifications**
- `offday_recommendations` - AI-suggested time-off days
- `notification_preferences` - User notification settings
- `notifications` - Multi-channel notification queue

**Compliance**
- `audit_logs` - Security and GDPR compliance tracking

### Key Features

**Security**
- OAuth tokens encrypted with AES-256-GCM
- SHA-256 token hashing for secure lookups
- Audit logging for all critical actions
- Cascading deletes for data cleanup

**Performance**
- Strategic indexes on query-heavy columns
- Materialized views for complex analytics
- Generated columns for computed values (duration_minutes)
- Pre-aggregated daily/weekly summaries

**Data Integrity**
- Foreign key constraints with cascading
- Check constraints for valid ranges
- Unique constraints preventing duplicates
- Automatic timestamp updates via triggers

## Quick Start

### Prerequisites

- PostgreSQL 15+
- `psql` command-line tool
- Database credentials (see backend `.env`)

### Local Setup

```bash
# 1. Create database
createdb smartcol

# 2. Run migration
psql -d smartcol -f migrations/001_initial_schema.sql

# 3. Verify tables
psql -d smartcol -c "\dt"
```

### Docker Setup

```bash
# Start PostgreSQL container
docker run --name smartcol-postgres \
  -e POSTGRES_DB=smartcol \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  -d postgres:15

# Run migration
docker exec -i smartcol-postgres psql -U postgres -d smartcol < migrations/001_initial_schema.sql
```

### Azure Database for PostgreSQL

```bash
# Using Azure CLI
az postgres flexible-server db create \
  --resource-group smartcol-rg \
  --server-name smartcol-db \
  --database-name smartcol

# Connect and run migration
psql "host=smartcol-db.postgres.database.azure.com \
      port=5432 \
      dbname=smartcol \
      user=smartcoladmin \
      sslmode=require" \
  -f migrations/001_initial_schema.sql
```

## Migration Management

### Current Migrations

| Version | Name | Description |
|---------|------|-------------|
| 001 | initial_schema | Complete database schema with all tables, indexes, views |

### Adding New Migrations

1. Create new file: `migrations/00X_description.sql`
2. Include rollback section at the end
3. Test on local database first
4. Document in this README

### Rollback (if needed)

```sql
-- To drop all tables (CAUTION: DESTRUCTIVE)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

## Schema Details

### Users Table

Stores core user information and work preferences.

```sql
SELECT * FROM users LIMIT 1;
```

**Key Fields:**
- `microsoft_user_id` - Links to Microsoft Graph user
- `standard_hours_per_day` - Used for overtime calculation
- `work_days` - JSONB array of working days
- `timezone` - For event time conversion

### Calendar Events Table

Events synced from Microsoft Graph API.

```sql
-- Get user's events for today
SELECT subject, start_time, end_time, duration_minutes
FROM calendar_events
WHERE user_id = 'your-user-id'
  AND DATE(start_time) = CURRENT_DATE
  AND is_cancelled = FALSE
ORDER BY start_time;
```

**Key Features:**
- `graph_event_id` - Microsoft Graph event identifier
- `duration_minutes` - Auto-calculated generated column
- `raw_data` - Full Graph API response (JSONB)
- `recurrence_pattern` - For recurring events

### Event Classifications Table

AI-powered task type assignments.

```sql
-- Get classifications with low confidence
SELECT ce.subject, tt.name, ec.confidence_score
FROM event_classifications ec
JOIN calendar_events ce ON ec.event_id = ce.id
JOIN task_types tt ON ec.task_type_id = tt.id
WHERE ec.confidence_score < 0.75
  AND ec.is_manually_corrected = FALSE;
```

**Key Features:**
- `confidence_score` - 0.0 to 1.0 (requires review if < 0.5)
- `classification_method` - Tracks ML vs rule-based
- `is_manually_corrected` - User feedback for active learning

### Risk Alerts Table

Detected workload and burnout risks.

```sql
-- Get active high-severity risks
SELECT title, severity, detected_date, description
FROM risk_alerts
WHERE status = 'active'
  AND severity IN ('high', 'critical')
ORDER BY severity DESC, detected_date DESC;
```

**Six Risk Types:**
1. High Daily Workload (>10h/day)
2. Burnout Risk (>50h/week sustained)
3. Overlapping Deadlines
4. Excessive Troubleshooting
5. Low Focus Time
6. Meeting Overload

### Daily Workload Table

Pre-aggregated metrics for performance.

```sql
-- Get weekly workload summary
SELECT
  date,
  ROUND(total_minutes / 60.0, 1) AS total_hours,
  ROUND(overtime_minutes / 60.0, 1) AS overtime_hours,
  meeting_count
FROM daily_workload
WHERE user_id = 'your-user-id'
  AND date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date;
```

**Performance Note:**
Analytics queries should use this table instead of joining `calendar_events` directly.

## Useful Queries

### Check Database Size

```sql
SELECT
  pg_database.datname,
  pg_size_pretty(pg_database_size(pg_database.datname)) AS size
FROM pg_database;
```

### View All Indexes

```sql
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### Active Connections

```sql
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  state,
  query_start
FROM pg_stat_activity
WHERE datname = 'smartcol';
```

### Table Row Counts

```sql
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```

## Backup & Restore

### Backup Database

```bash
# Full backup
pg_dump smartcol > backup_$(date +%Y%m%d).sql

# Schema only
pg_dump --schema-only smartcol > schema_backup.sql

# Data only
pg_dump --data-only smartcol > data_backup.sql
```

### Restore Database

```bash
# From backup file
psql smartcol < backup_20251204.sql

# Using pg_restore (for custom format)
pg_restore -d smartcol backup.dump
```

## Maintenance

### Vacuum and Analyze

```sql
-- Regular maintenance
VACUUM ANALYZE;

-- Specific table
VACUUM ANALYZE calendar_events;
```

### Reindex

```sql
-- Reindex all tables
REINDEX DATABASE smartcol;

-- Specific index
REINDEX INDEX idx_calendar_events_user_date;
```

## Security

### Token Encryption

OAuth tokens are encrypted at the application level before storage:
- Algorithm: AES-256-GCM
- Key source: Azure Key Vault
- Per-token initialization vector (IV)
- SHA-256 hash for lookups

### Access Control

Recommended roles:

```sql
-- Application service account (read/write, no delete)
CREATE ROLE smartcol_app WITH LOGIN PASSWORD 'secure_password';
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO smartcol_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO smartcol_app;

-- Read-only analytics account
CREATE ROLE smartcol_analytics WITH LOGIN PASSWORD 'secure_password';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO smartcol_analytics;

-- Admin account (migrations only)
CREATE ROLE smartcol_admin WITH LOGIN PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE smartcol TO smartcol_admin;
```

## Troubleshooting

### Connection Issues

```bash
# Test connection
psql -h localhost -U postgres -d smartcol -c "SELECT NOW();"

# Check PostgreSQL is running
pg_isready -h localhost -p 5432
```

### Permission Errors

```sql
-- Grant missing permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO smartcol_app;
GRANT USAGE ON SCHEMA public TO smartcol_app;
```

### Migration Failures

```sql
-- Check which tables exist
\dt

-- Check for locks
SELECT * FROM pg_locks WHERE NOT granted;
```

## Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/15/)
- [Azure Database for PostgreSQL](https://learn.microsoft.com/en-us/azure/postgresql/)
- [SmartCol AI System Design](../README.md)

---

**Last Updated:** 2025-12-04
**Schema Version:** 001
