# SmartCol AI Backend

> **Note:** This file reflects the **original design specification** and may not match the current implementation. For up-to-date documentation, refer to the root [`README.md`](../README.md) and [`IMPLEMENTATION_REPORT.md`](../IMPLEMENTATION_REPORT.md).

Node.js + Express + TypeScript backend API for SmartCol AI workload management system.

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript 5.3+
- **Framework:** Express.js 4.18+
- **Database:** PostgreSQL 15+
- **Cache:** Redis 7+
- **Queue:** Bull (Redis-based)
- **Auth:** Microsoft OAuth 2.0 (Azure AD)
- **Logging:** Winston
- **Monitoring:** Azure Application Insights

## Project Structure

```
backend/
├── src/
│   ├── config/           # Configuration files
│   │   ├── env.ts        # Environment variables
│   │   └── monitoring.config.ts
│   ├── controllers/      # Route controllers
│   │   ├── auth.controller.ts
│   │   ├── calendar.controller.ts
│   │   ├── analytics.controller.ts
│   │   └── risks.controller.ts
│   ├── middleware/       # Express middleware
│   │   ├── auth.middleware.ts
│   │   └── error.middleware.ts
│   ├── routes/           # API route definitions
│   │   ├── auth.routes.ts
│   │   ├── calendar.routes.ts
│   │   ├── analytics.routes.ts
│   │   └── risks.routes.ts
│   ├── services/         # Business logic
│   │   ├── database.client.ts
│   │   ├── graph.client.ts
│   │   ├── analytics.service.ts
│   │   └── risks.service.ts
│   ├── types/            # TypeScript type definitions
│   │   └── index.d.ts
│   ├── app.ts            # Express app setup
│   └── server.ts         # Server entry point
├── dist/                 # Compiled JavaScript (git-ignored)
├── logs/                 # Application logs (git-ignored)
├── .env                  # Environment variables (git-ignored)
├── .env.example          # Example environment config
├── tsconfig.json         # TypeScript configuration
├── nodemon.json          # Nodemon configuration
├── package.json          # Dependencies and scripts
└── README.md             # This file
```

## Prerequisites

- Node.js 20+ and npm
- PostgreSQL 15+
- Redis 7+
- Microsoft 365 account (for OAuth testing)
- Azure AD app registration

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

**Required Environment Variables:**

```env
# Database
DATABASE_HOST=localhost
DATABASE_NAME=smartcol
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Azure AD OAuth
AZURE_AD_CLIENT_ID=your_client_id
AZURE_AD_CLIENT_SECRET=your_client_secret
AZURE_AD_TENANT_ID=your_tenant_id
AZURE_AD_REDIRECT_URI=http://localhost:3001/api/auth/callback

# Session
SESSION_SECRET=your_random_secret_here
```

### 3. Set Up Database

```bash
# Check database connection
npm run db:check

# Run initial migration
npm run db:migrate:init

# Verify tables created
npm run db:list
```

### 4. Start Development Server

```bash
# Development mode (with auto-reload)
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start
```

The API will be available at `http://localhost:3001`.

## Available Scripts

### Development

```bash
npm run dev              # Start dev server with auto-reload (ts-node)
npm run dev:build        # Build and run (useful for testing builds)
npm run build:watch      # Watch mode TypeScript compilation
```

### Build

```bash
npm run build            # Compile TypeScript to JavaScript
npm run clean            # Remove dist folder
npm run type-check       # Type check without emitting files
```

### Database

```bash
npm run db:check         # Test database connection
npm run db:migrate:init  # Run initial schema migration
npm run db:migrate       # Run all migrations
npm run db:list          # List available migrations
```

### Code Quality

```bash
npm run lint             # Lint TypeScript files
npm run lint:fix         # Lint and auto-fix
npm run format           # Format code with Prettier
npm run format:check     # Check formatting without changes
```

### Production

```bash
npm run start            # Run compiled JavaScript
npm run start:prod       # Run with NODE_ENV=production
```

## API Endpoints

### Authentication

```
GET  /api/auth/connect           Get OAuth authorization URL
GET  /api/auth/callback          OAuth callback handler
POST /api/auth/disconnect        Revoke access and delete tokens
GET  /api/auth/status            Check connection status
```

### Calendar

```
POST /api/calendar/sync          Trigger manual calendar sync
GET  /api/calendar/events        Get events with filters
GET  /api/calendar/events/:id    Get single event
GET  /api/calendar/sync-history  Get sync history
```

### Analytics

```
GET /api/analytics/dashboard         Full dashboard data
GET /api/analytics/weekly-summary    Weekly KPIs
GET /api/analytics/time-breakdown    Time by task type
GET /api/analytics/project-breakdown Time by project
GET /api/analytics/heatmap           Daily workload heatmap
GET /api/analytics/trends            Historical trends
```

### Risks & Overtime

```
GET  /api/risks/active                 Active risk alerts
POST /api/risks/:id/acknowledge        Acknowledge risk
GET  /api/overtime/weekly              Weekly overtime
GET  /api/overtime/trends              Overtime trends
GET  /api/overtime/recommendations     Off-day suggestions
```

## TypeScript Configuration

The project uses strict TypeScript configuration:

- ✅ Strict type checking enabled
- ✅ No implicit any
- ✅ Strict null checks
- ✅ Unused locals/parameters detection
- ✅ Path aliases (@config, @services, etc.)

### Import Path Aliases

```typescript
// Instead of:
import { db } from '../../../services/database.client';

// Use:
import { db } from '@services/database.client';
```

**Available aliases:**
- `@/*` → `src/*`
- `@config/*` → `src/config/*`
- `@services/*` → `src/services/*`
- `@controllers/*` → `src/controllers/*`
- `@middleware/*` → `src/middleware/*`
- `@routes/*` → `src/routes/*`
- `@types/*` → `src/types/*`

## Database Schema

See [../database/README.md](../database/README.md) for detailed schema documentation.

**Key Tables:**
- `users` - User accounts and work preferences
- `oauth_tokens` - Encrypted Microsoft Graph tokens
- `calendar_events` - Synced calendar events
- `event_classifications` - AI task type classifications
- `risk_alerts` - Detected workload risks
- `daily_workload` - Pre-aggregated analytics

## Authentication Flow

SmartCol AI uses OAuth 2.0 with Microsoft Azure AD:

1. **User clicks "Connect Outlook"**
   - Frontend: `GET /api/auth/connect`
   - Backend returns authorization URL
   - Redirects to Microsoft login

2. **User authorizes app**
   - Microsoft redirects to `GET /api/auth/callback?code=...`
   - Backend exchanges code for tokens
   - Stores encrypted tokens in database

3. **Authenticated requests**
   - Session-based authentication
   - Access token automatically refreshed when expired
   - Tokens rotated for security

4. **Calendar sync**
   - Background job runs every 15 minutes
   - Uses delta queries for efficiency
   - Events classified by AI service

## Error Handling

The API uses standardized error responses:

```json
{
  "error": "ValidationError",
  "message": "Invalid date format",
  "statusCode": 400,
  "timestamp": "2025-12-04T10:30:00.000Z",
  "path": "/api/calendar/events"
}
```

**Error Codes:**
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (no valid session)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `429` - Too Many Requests (rate limit)
- `500` - Internal Server Error
- `503` - Service Unavailable

## Logging

Winston logger with structured JSON output:

```typescript
import { logger } from '@config/monitoring.config';

logger.info('Calendar sync started', {
  userId: 'user-123',
  syncType: 'delta'
});

logger.error('Sync failed', {
  error: error.message,
  userId: 'user-123'
});
```

**Log Levels:**
- `error` - Errors requiring attention
- `warn` - Warning conditions
- `info` - General informational messages
- `debug` - Debug-level messages
- `verbose` - Very detailed logging

**Log Files:**
- `logs/error.log` - Error logs only
- `logs/combined.log` - All logs

## Testing

```bash
# Run tests (coming soon)
npm test

# Run tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e
```

## Deployment

### Local Development

```bash
docker-compose up -d postgres redis
npm run db:migrate:init
npm run dev
```

### Azure App Service

See [../DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md) for complete Azure deployment instructions.

**Quick deploy:**

```bash
# Build
npm run build

# Deploy to Azure
az webapp up --name smartcol-backend --resource-group smartcol-rg
```

### Environment-Specific Configuration

**Development:**
- Detailed error messages
- Request logging enabled
- SQL query logging
- No SSL required

**Production:**
- Minimal error details
- Performance optimized
- SSL required
- Azure Key Vault for secrets
- Application Insights monitoring

## Security Best Practices

1. **Never commit `.env` file** - Contains sensitive credentials
2. **Use Azure Key Vault in production** - For token encryption keys
3. **Rotate secrets regularly** - Every 90 days minimum
4. **Enable HTTPS only** - TLS 1.2+ required
5. **Use managed identities** - For Azure service connections
6. **Implement rate limiting** - Prevent abuse
7. **Validate all inputs** - Prevent injection attacks
8. **Use parameterized queries** - Prevent SQL injection
9. **Encrypt tokens** - AES-256-GCM for OAuth tokens
10. **Audit logging** - Track all critical actions

## Performance Optimization

**Database:**
- Connection pooling (2-10 connections)
- Indexed queries on user_id + date ranges
- Pre-aggregated `daily_workload` table
- Pagination for large result sets

**Caching:**
- Redis for access tokens (1 hour TTL)
- Analytics queries (15 minutes TTL)
- User settings (1 hour TTL)

**API:**
- GZIP compression
- Response caching headers
- Rate limiting (100 requests / 15 minutes)
- Connection keep-alive

## Troubleshooting

### TypeScript Errors

```bash
# Clear build cache
npm run clean

# Rebuild
npm run build

# Check for type errors
npm run type-check
```

### Database Connection Issues

```bash
# Test connection
npm run db:check

# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# View logs
tail -f logs/error.log
```

### OAuth Errors

**"Invalid redirect_uri"**
- Verify `AZURE_AD_REDIRECT_URI` in `.env`
- Must match Azure AD app registration exactly
- Include protocol (http/https) and port

**"Unauthorized client"**
- Check `AZURE_AD_CLIENT_ID` and `AZURE_AD_CLIENT_SECRET`
- Verify app has correct API permissions in Azure

### Port Already in Use

```bash
# Find process using port 3001
lsof -i :3001

# Kill process
kill -9 <PID>
```

## Contributing

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and commit: `git commit -am 'Add feature'`
3. Run linting: `npm run lint:fix`
4. Format code: `npm run format`
5. Type check: `npm run type-check`
6. Push branch: `git push origin feature/my-feature`
7. Create pull request

## Resources

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Microsoft Graph API](https://learn.microsoft.com/en-us/graph/api/overview)
- [PostgreSQL Docs](https://www.postgresql.org/docs/15/)
- [Redis Documentation](https://redis.io/docs/)

---

**Need Help?** See the main [README.md](../README.md) or create an issue.
