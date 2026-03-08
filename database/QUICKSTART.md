# Database Quick Start Guide

Get your SmartCol AI database up and running in 5 minutes.

## Option 1: Local PostgreSQL (Recommended for Development)

### Step 1: Install PostgreSQL

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql-15 postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Download from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)

### Step 2: Create Database

```bash
# Connect to PostgreSQL
psql postgres

# In psql:
CREATE DATABASE smartcol;
\q
```

### Step 3: Configure Backend

Edit `backend/.env`:
```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=smartcol
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password
```

### Step 4: Run Migration

```bash
cd backend
npm run db:migrate:init
```

**Expected Output:**
```
✅ Connected successfully
✅ Migration completed in 234ms
✅ Created 18 tables
✅ Created 25 indexes
✅ Created 2 views
🎉 Migration completed successfully!
```

### Step 5: Verify

```bash
# Check connection
npm run db:check

# List tables
psql smartcol -c "\dt"
```

---

## Option 2: Docker (Easiest Setup)

### Step 1: Start PostgreSQL Container

```bash
docker run --name smartcol-postgres \
  -e POSTGRES_DB=smartcol \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=your_secure_password \
  -p 5432:5432 \
  -v smartcol-data:/var/lib/postgresql/data \
  -d postgres:15
```

### Step 2: Configure Backend

Edit `backend/.env`:
```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=smartcol
DATABASE_USER=postgres
DATABASE_PASSWORD=your_secure_password
```

### Step 3: Run Migration

```bash
cd backend
npm run db:migrate:init
```

### Step 4: Manage Container

```bash
# Stop database
docker stop smartcol-postgres

# Start database
docker start smartcol-postgres

# View logs
docker logs smartcol-postgres

# Connect to database
docker exec -it smartcol-postgres psql -U postgres -d smartcol
```

---

## Option 3: Azure Database for PostgreSQL

### Step 1: Create Database

```bash
# Login to Azure
az login

# Create resource group
az group create --name smartcol-rg --location eastus

# Create PostgreSQL server
az postgres flexible-server create \
  --resource-group smartcol-rg \
  --name smartcol-db-server \
  --location eastus \
  --admin-user smartcoladmin \
  --admin-password "YourSecurePassword123!" \
  --sku-name Standard_B1ms \
  --storage-size 32 \
  --version 15

# Create database
az postgres flexible-server db create \
  --resource-group smartcol-rg \
  --server-name smartcol-db-server \
  --database-name smartcol
```

### Step 2: Configure Firewall

```bash
# Allow Azure services
az postgres flexible-server firewall-rule create \
  --resource-group smartcol-rg \
  --name smartcol-db-server \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

# Allow your IP (for development)
az postgres flexible-server firewall-rule create \
  --resource-group smartcol-rg \
  --name smartcol-db-server \
  --rule-name AllowMyIP \
  --start-ip-address YOUR_IP \
  --end-ip-address YOUR_IP
```

### Step 3: Configure Backend

Edit `backend/.env`:
```env
DATABASE_HOST=smartcol-db-server.postgres.database.azure.com
DATABASE_PORT=5432
DATABASE_NAME=smartcol
DATABASE_USER=smartcoladmin
DATABASE_PASSWORD=YourSecurePassword123!
```

### Step 4: Run Migration

```bash
cd backend
npm run db:migrate:init
```

---

## Verification Checklist

After running the migration, verify everything is set up correctly:

### 1. Check Tables

```bash
psql smartcol -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
```

**Expected tables (18 total):**
- audit_logs
- calendar_events
- daily_workload
- event_classifications
- notification_preferences
- notifications
- oauth_tokens
- offday_recommendations
- project_categories
- risk_alerts
- risk_types
- sync_history
- task_types
- users
- weekly_workload

### 2. Check Predefined Data

```bash
# Task types (should have 10 rows)
psql smartcol -c "SELECT name FROM task_types;"
```

**Expected output:**
```
Deadline
Ad-hoc Troubleshooting
Project Milestone
Routine Meeting
1:1 Check-in
Admin/Operational
Training/Learning
Focus Time
Break/Personal
Out of Office
```

```bash
# Risk types (should have 6 rows)
psql smartcol -c "SELECT name FROM risk_types;"
```

### 3. Check Views

```bash
psql smartcol -c "\dv"
```

**Expected views:**
- v_active_risks
- v_classified_events

### 4. Test Connection from Backend

```bash
cd backend
npm run db:check
```

**Expected output:**
```
✅ Connection successful! Server time: 2025-12-04 10:30:00+00
```

---

## Troubleshooting

### Connection Refused

**Problem:** `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solutions:**
1. Check PostgreSQL is running: `pg_isready -h localhost -p 5432`
2. Start PostgreSQL: `brew services start postgresql@15` (macOS)
3. Verify port: `lsof -i :5432`

### Authentication Failed

**Problem:** `Error: password authentication failed for user "postgres"`

**Solutions:**
1. Verify password in `.env` matches PostgreSQL user password
2. Reset password:
   ```bash
   psql postgres
   ALTER USER postgres WITH PASSWORD 'new_password';
   ```

### Database Does Not Exist

**Problem:** `Error: database "smartcol" does not exist`

**Solution:**
```bash
createdb smartcol
# or
psql postgres -c "CREATE DATABASE smartcol;"
```

### Permission Denied

**Problem:** `ERROR: permission denied for schema public`

**Solution:**
```sql
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

### Port Already in Use

**Problem:** Docker fails with "port 5432 already in use"

**Solutions:**
1. Stop local PostgreSQL: `brew services stop postgresql@15`
2. Use different port: `-p 5433:5432` in Docker command
3. Update `DATABASE_PORT=5433` in `.env`

---

## Next Steps

After database setup:

1. **Configure TypeScript** - Set up `backend/tsconfig.json`
2. **Create Database Client** - Implement `src/services/database.client.ts`
3. **Test Connection** - Create a simple test script
4. **Build Auth Service** - Start with Microsoft OAuth flow

See main [README.md](../README.md) for full implementation roadmap.

---

## Useful Commands

```bash
# Backend package.json scripts
npm run db:check         # Test database connection
npm run db:list          # List available migrations
npm run db:migrate:init  # Run initial schema migration
npm run db:migrate       # Run all migrations

# Direct psql commands
psql smartcol                              # Connect to database
psql smartcol -c "SELECT * FROM users;"    # Run query
psql smartcol -f backup.sql                # Restore from backup
pg_dump smartcol > backup.sql              # Create backup
```

---

## Database Credentials Security

**⚠️ IMPORTANT: Never commit credentials to git!**

The `.env` file is already in `.gitignore`. For production:

1. Use Azure Key Vault for credentials
2. Use managed identities (no passwords needed)
3. Rotate passwords regularly
4. Use strong passwords (20+ characters)

Example strong password generation:
```bash
openssl rand -base64 32
```

---

**Need Help?** See [database/README.md](README.md) for detailed documentation.
