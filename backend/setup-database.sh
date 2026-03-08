#!/bin/bash

# SmartCol AI - Database Setup Script
# This script sets up PostgreSQL in Docker and runs migrations

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       SmartCol AI - Database Setup                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration from .env
DB_NAME="smartcol"
DB_USER="postgres"
DB_PASSWORD='fly1ngC()wN0vemberR@1n'
CONTAINER_NAME="smartcol-postgres"

echo "📋 Configuration:"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo "   Container: $CONTAINER_NAME"
echo ""

# Step 1: Check if Docker is running
echo "1️⃣  Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running${NC}"
    echo "   Please start Docker Desktop and try again"
    exit 1
fi
echo -e "${GREEN}✅ Docker is running${NC}"
echo ""

# Step 2: Check if container already exists
echo "2️⃣  Checking for existing PostgreSQL container..."
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${YELLOW}⚠️  Container already exists${NC}"

    # Check if it's running
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "   Container is already running"
    else
        echo "   Starting existing container..."
        docker start $CONTAINER_NAME
    fi
else
    # Step 3: Create and start PostgreSQL container
    echo "3️⃣  Creating PostgreSQL container..."
    docker run --name $CONTAINER_NAME \
      -e POSTGRES_DB=$DB_NAME \
      -e POSTGRES_USER=$DB_USER \
      -e POSTGRES_PASSWORD="$DB_PASSWORD" \
      -p 5432:5432 \
      -d postgres:15

    echo -e "${GREEN}✅ Container created and started${NC}"
fi
echo ""

# Step 4: Wait for PostgreSQL to be ready
echo "4️⃣  Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if docker exec $CONTAINER_NAME pg_isready -U $DB_USER > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
        break
    fi
    echo -n "."
    sleep 1

    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ PostgreSQL failed to start${NC}"
        exit 1
    fi
done
echo ""

# Step 5: Run database migration
echo "5️⃣  Running database migration..."
MIGRATION_FILE="../database/migrations/001_initial_schema.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}❌ Migration file not found: $MIGRATION_FILE${NC}"
    exit 1
fi

# Run migration using docker exec
docker exec -i $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME < $MIGRATION_FILE

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migration completed successfully${NC}"
else
    echo -e "${RED}❌ Migration failed${NC}"
    exit 1
fi
echo ""

# Step 6: Verify database setup
echo "6️⃣  Verifying database setup..."
TABLE_COUNT=$(docker exec $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';" | tr -d ' ')

echo "   Tables created: $TABLE_COUNT"

if [ "$TABLE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ Database verification passed${NC}"
else
    echo -e "${RED}❌ No tables found${NC}"
    exit 1
fi
echo ""

# Step 7: Show table list
echo "7️⃣  Database tables:"
docker exec $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -c "\dt" | grep -v "^$"
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║              ✅ Setup Complete!                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Database Information:"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo ""
echo "🎯 Next Steps:"
echo "   1. Stop test server: pkill -f 'test-server.ts'"
echo "   2. Start full server: npm run dev"
echo "   3. Test OAuth flow: http://localhost:3001/api/auth/connect"
echo ""
echo "💡 Useful Commands:"
echo "   Stop container:    docker stop $CONTAINER_NAME"
echo "   Start container:   docker start $CONTAINER_NAME"
echo "   View logs:         docker logs $CONTAINER_NAME"
echo "   Connect to DB:     docker exec -it $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME"
echo ""
