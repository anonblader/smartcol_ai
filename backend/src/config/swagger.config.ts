/**
 * OpenAPI / Swagger Specification
 *
 * Full API reference for SmartCol AI.
 * Served at GET /api/docs via swagger-ui-express.
 */

export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'SmartCol AI API',
    version: '1.0.0',
    description: `
**SmartCol AI** is an AI-powered workload management platform for engineering teams.

It integrates with Microsoft Outlook to provide:
- Hybrid AI event classification (rule-based + NLI zero-shot)
- Daily/weekly workload analytics and heatmaps
- 6-algorithm risk detection (burnout, overload, deadlines, etc.)
- ML workload prediction (RandomForest) and burnout scoring (GradientBoosting)
- Off-day recommendation engine with entitlement tracking
- Background job scheduling and email alert notifications

**Authentication:** All endpoints (except \`/health\`) require an active session cookie obtained via the Microsoft OAuth 2.0 flow (\`GET /api/auth/connect\`).

**Admin endpoints** additionally require the session user's email to be listed in the \`ADMIN_EMAILS\` environment variable.
    `.trim(),
    contact: {
      name: 'SmartCol AI',
    },
  },
  servers: [
    { url: 'http://localhost:3001', description: 'Local development' },
  ],
  tags: [
    { name: 'Health',         description: 'Service health check' },
    { name: 'Auth',           description: 'Microsoft OAuth 2.0 authentication' },
    { name: 'Sync',           description: 'Calendar synchronisation (real + mock)' },
    { name: 'Analytics',      description: 'Workload analytics and dashboard data' },
    { name: 'Risks',          description: 'Workload risk detection and alert management' },
    { name: 'Off-Day',        description: 'Off-day entitlement and recommendations' },
    { name: 'ML',             description: 'ML workload forecast and burnout scoring' },
    { name: 'Admin',          description: 'Team management (admin only)' },
    { name: 'Scheduler',      description: 'Background job management (admin only)' },
    { name: 'Notifications',  description: 'Email alert settings (admin only)' },
  ],
  paths: {

    // ── Health ──────────────────────────────────────────────────────────────────

    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Backend health check',
        responses: {
          200: { description: 'Service is healthy', content: { 'application/json': { example: { status: 'ok' } } } },
        },
      },
    },

    // ── Auth ────────────────────────────────────────────────────────────────────

    '/api/auth/connect': {
      get: {
        tags: ['Auth'],
        summary: 'Get Microsoft OAuth authorisation URL',
        description: 'Returns the Microsoft identity platform URL the user should be redirected to for login.',
        responses: {
          200: {
            description: 'OAuth URL generated',
            content: { 'application/json': { example: { authUrl: 'https://login.microsoftonline.com/...', message: 'Redirect user to this URL to authorize' } } },
          },
        },
      },
    },
    '/api/auth/callback': {
      get: {
        tags: ['Auth'],
        summary: 'OAuth callback handler',
        description: 'Microsoft redirects here after login. Exchanges the auth code for tokens, creates/updates the user record, and redirects to the frontend.',
        parameters: [
          { name: 'code', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'state', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          302: { description: 'Redirects to frontend dashboard on success' },
          400: { description: 'State mismatch or missing code' },
        },
      },
    },
    '/api/auth/disconnect': {
      post: {
        tags: ['Auth'],
        summary: 'Disconnect Microsoft account',
        description: 'Revokes the session and removes stored OAuth tokens for the current user.',
        responses: {
          200: { description: 'Disconnected successfully', content: { 'application/json': { example: { success: true } } } },
          401: { description: 'No active session' },
        },
      },
    },
    '/api/auth/status': {
      get: {
        tags: ['Auth'],
        summary: 'Check authentication state',
        responses: {
          200: {
            description: 'Auth status',
            content: {
              'application/json': {
                examples: {
                  authenticated: { value: { authenticated: true, user: { id: 'uuid', email: 'user@company.com', displayName: 'Alice' } } },
                  unauthenticated: { value: { authenticated: false, message: 'No active session' } },
                },
              },
            },
          },
        },
      },
    },

    // ── Sync ────────────────────────────────────────────────────────────────────

    '/api/sync/mock': {
      post: {
        tags: ['Sync'],
        summary: 'Balanced mock sync',
        description: 'Loads a balanced workload profile (~8h/day, no risks) and runs the full pipeline: sync → classify → compute workload → detect risks → ML predictions.',
        responses: {
          200: { description: 'Sync and pipeline complete' },
          401: { description: 'No active session' },
        },
      },
    },
    '/api/sync/heavy-mock': {
      post: {
        tags: ['Sync'],
        summary: 'Overloaded mock sync',
        description: 'Loads an overloaded profile (12.5h/day × 3 weeks, 54 events) that triggers all 6 risk types and produces a critical burnout score.',
        responses: {
          200: { description: 'Sync and pipeline complete' },
          401: { description: 'No active session' },
        },
      },
    },
    '/api/sync/light-mock': {
      post: {
        tags: ['Sync'],
        summary: 'Underloaded mock sync',
        description: 'Loads a minimal schedule (3 short events/week) that triggers the Low Focus Time risk.',
        responses: {
          200: { description: 'Sync and pipeline complete' },
          401: { description: 'No active session' },
        },
      },
    },
    '/api/sync/calendar': {
      post: {
        tags: ['Sync'],
        summary: 'Real Microsoft Graph sync',
        description: 'Syncs calendar events from Microsoft Graph using delta queries. Requires a valid, non-expired OAuth token. Not available for personal Microsoft accounts.',
        responses: {
          200: { description: 'Sync complete' },
          401: { description: 'No active session or expired Graph token' },
        },
      },
    },
    '/api/sync/classify': {
      post: {
        tags: ['Sync'],
        summary: 'Manually trigger classification',
        description: 'Classifies all unclassified events for the session user without running a new sync.',
        responses: {
          200: { description: 'Classification complete', content: { 'application/json': { example: { success: true, stats: { classified: 54, skipped: 0, failed: 0 } } } } },
          401: { description: 'No active session' },
        },
      },
    },
    '/api/sync/events': {
      get: {
        tags: ['Sync'],
        summary: 'List calendar events',
        description: 'Returns paginated calendar events for the session user.',
        parameters: [
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate',   in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'limit',     in: 'query', schema: { type: 'integer', default: 100 } },
          { name: 'offset',    in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          200: { description: 'Event list with pagination' },
          401: { description: 'No active session' },
        },
      },
    },
    '/api/sync/status': {
      get: {
        tags: ['Sync'],
        summary: 'Sync history and event counts',
        responses: {
          200: { description: 'Last sync info and event statistics' },
          401: { description: 'No active session' },
        },
      },
    },
    '/api/sync/clear-data': {
      delete: {
        tags: ['Sync'],
        summary: 'Clear all user data',
        description: 'Wipes all calendar events, workload data, risk alerts, ML predictions, off-day recommendations, and sync history for the session user. Used before loading a new mock profile.',
        responses: {
          200: { description: 'All data cleared', content: { 'application/json': { example: { success: true, message: 'All calendar data cleared' } } } },
          401: { description: 'No active session' },
        },
      },
    },

    // ── Analytics ───────────────────────────────────────────────────────────────

    '/api/analytics/dashboard': {
      get: {
        tags: ['Analytics'],
        summary: 'Full dashboard data in one call',
        description: 'Returns current week summary, last 7 days daily breakdown, time breakdown by task type, and upcoming events (next 7 days). Pass `?userId=` to view another user\'s data (admin).',
        parameters: [{ name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Dashboard metrics' },
          401: { description: 'No active session' },
        },
      },
    },
    '/api/analytics/daily': {
      get: {
        tags: ['Analytics'],
        summary: 'Daily workload rows',
        parameters: [
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate',   in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'userId',    in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Array of daily workload records' }, 401: { description: 'No active session' } },
      },
    },
    '/api/analytics/weekly': {
      get: {
        tags: ['Analytics'],
        summary: 'Weekly workload summaries',
        parameters: [
          { name: 'weeks',  in: 'query', schema: { type: 'integer', default: 4 }, description: 'Number of most recent weeks to return (max 52)' },
          { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Array of weekly workload records' }, 401: { description: 'No active session' } },
      },
    },
    '/api/analytics/time-breakdown': {
      get: {
        tags: ['Analytics'],
        summary: 'Minutes per task type',
        parameters: [
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate',   in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'userId',    in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Time breakdown by task type with percentages' }, 401: { description: 'No active session' } },
      },
    },
    '/api/analytics/heatmap': {
      get: {
        tags: ['Analytics'],
        summary: 'Daily totals for workload heatmap',
        parameters: [
          { name: 'days',   in: 'query', schema: { type: 'integer', default: 30 }, description: 'Number of days to look back (max 365)' },
          { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Array of daily totals for heatmap rendering' }, 401: { description: 'No active session' } },
      },
    },
    '/api/analytics/users-list': {
      get: {
        tags: ['Analytics'],
        summary: 'All users for selector dropdown',
        description: 'Returns all users ordered by type (real first, test second). Used by the admin analytics selector.',
        responses: { 200: { description: 'User list' }, 401: { description: 'No active session' } },
      },
    },
    '/api/analytics/compute': {
      post: {
        tags: ['Analytics'],
        summary: 'Trigger workload computation',
        description: 'Recomputes daily and weekly workload metrics from classified events for the session user.',
        responses: {
          200: { description: 'Computation complete', content: { 'application/json': { example: { success: true, stats: { daysProcessed: 15, weeksProcessed: 3 } } } } },
          401: { description: 'No active session' },
        },
      },
    },

    // ── Risks ────────────────────────────────────────────────────────────────────

    '/api/risks/detect': {
      post: {
        tags: ['Risks'],
        summary: 'Run all 6 risk detection algorithms',
        description: 'Analyses computed workload data and upserts risk alerts. Detects: High Daily Workload, Burnout Risk, Overlapping Deadlines, Excessive Troubleshooting, Low Focus Time, Meeting Overload.',
        responses: {
          200: {
            description: 'Detection complete',
            content: { 'application/json': { example: { success: true, alertsCreated: 5, alertsUpdated: 0, risksDetected: ['High Daily Workload', 'Burnout Risk'] } } },
          },
          401: { description: 'No active session' },
        },
      },
    },
    '/api/risks/active': {
      get: {
        tags: ['Risks'],
        summary: 'Active risk alerts',
        responses: { 200: { description: 'List of active alerts' }, 401: { description: 'No active session' } },
      },
    },
    '/api/risks/ongoing': {
      get: {
        tags: ['Risks'],
        summary: 'Acknowledged (ongoing) alerts',
        responses: { 200: { description: 'List of acknowledged alerts' }, 401: { description: 'No active session' } },
      },
    },
    '/api/risks/history': {
      get: {
        tags: ['Risks'],
        summary: 'All past risk alerts',
        responses: { 200: { description: 'Full alert history' }, 401: { description: 'No active session' } },
      },
    },
    '/api/risks/{id}/acknowledge': {
      post: {
        tags: ['Risks'],
        summary: 'Acknowledge a risk alert',
        description: 'Moves the alert from active → acknowledged. The engineer retains visibility of it as ongoing.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Acknowledged' }, 401: { description: 'No active session' }, 404: { description: 'Alert not found' } },
      },
    },
    '/api/risks/{id}/dismiss': {
      post: {
        tags: ['Risks'],
        summary: 'Dismiss a risk alert',
        description: 'Force-closes the alert regardless of condition state.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Dismissed' }, 401: { description: 'No active session' }, 404: { description: 'Alert not found' } },
      },
    },

    // ── Off-Day ──────────────────────────────────────────────────────────────────

    '/api/offday/generate': {
      post: {
        tags: ['Off-Day'],
        summary: 'Generate off-day recommendations',
        description: 'Analyses the next 30 weekdays and generates up to 10 scored recommendations, capped to the user\'s available entitlement balance.',
        parameters: [{ name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Admin: generate for a specific user' }],
        responses: { 200: { description: 'Recommendations generated with balance info' }, 401: { description: 'No active session' } },
      },
    },
    '/api/offday/balance': {
      get: {
        tags: ['Off-Day'],
        summary: 'Current entitlement balance',
        description: 'Returns earned, used, and available off-day counts. Earned: +1 per weekday ≥720 min, +1 per weekend with any work.',
        parameters: [{ name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Balance details' }, 401: { description: 'No active session' } },
      },
    },
    '/api/offday/pending': {
      get: {
        tags: ['Off-Day'],
        summary: 'Unresponded recommendations',
        parameters: [{ name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Pending recommendations' }, 401: { description: 'No active session' } },
      },
    },
    '/api/offday/all': {
      get: {
        tags: ['Off-Day'],
        summary: 'All recommendations (history)',
        parameters: [{ name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'All recommendations including accepted/rejected' }, 401: { description: 'No active session' } },
      },
    },
    '/api/offday/team': {
      get: {
        tags: ['Off-Day'],
        summary: 'All team recommendations (admin)',
        responses: { 200: { description: 'All recommendations across all users' }, 401: { description: 'No active session' } },
      },
    },
    '/api/offday/{id}/accept': {
      post: {
        tags: ['Off-Day'],
        summary: 'Accept a recommendation',
        description: 'Marks the recommendation as accepted and deducts from the user\'s available balance.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Accepted' }, 401: { description: 'No active session' } },
      },
    },
    '/api/offday/{id}/reject': {
      post: {
        tags: ['Off-Day'],
        summary: 'Decline a recommendation',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Rejected' }, 401: { description: 'No active session' } },
      },
    },

    // ── ML Predictions ───────────────────────────────────────────────────────────

    '/api/ml/predict': {
      post: {
        tags: ['ML'],
        summary: 'Run both ML models and store results',
        description: 'Fetches historical workload data, calls the classification service, and stores: 5-day workload forecast (RandomForest) + burnout score (GradientBoosting).',
        responses: {
          200: {
            description: 'Predictions complete',
            content: { 'application/json': { example: { success: true, workloadPredictions: 5, burnoutScore: 95, burnoutLevel: 'critical' } } },
          },
          401: { description: 'No active session' },
        },
      },
    },
    '/api/ml/workload-forecast': {
      get: {
        tags: ['ML'],
        summary: '5-day workload forecast',
        description: 'Returns stored workload predictions. Auto-generates on first fetch if none exist (lazy evaluation).',
        parameters: [{ name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: '5-day forecast',
            content: {
              'application/json': {
                example: {
                  forecast: [
                    { predicted_date: '2026-03-10', predicted_hours: 12.8, load_level: 'critical', confidence: 0.62, trend: 'stable' },
                  ],
                },
              },
            },
          },
          401: { description: 'No active session' },
        },
      },
    },
    '/api/ml/burnout-score': {
      get: {
        tags: ['ML'],
        summary: 'Latest burnout risk score',
        description: 'Returns the most recent burnout score (0–100) for the user. Auto-generates on first fetch. Score > 75 triggers a burnout warning email if enabled.',
        parameters: [{ name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'Burnout score',
            content: {
              'application/json': {
                example: {
                  burnoutScore: { score: 95.0, level: 'critical', trend: 'stable', contributing_factors: ['Extremely high weekly workload (64h avg)'], confidence: 1.0 },
                },
              },
            },
          },
          401: { description: 'No active session' },
        },
      },
    },

    // ── Admin ────────────────────────────────────────────────────────────────────

    '/api/admin/team-overview': {
      get: {
        tags: ['Admin'],
        summary: 'All team members with summary workload stats',
        description: 'Returns all users with aggregated work minutes, overtime, meetings, focus time, active/ongoing risk counts, and peak daily minutes.',
        responses: { 200: { description: 'Team overview' }, 401: { description: 'Not admin' } },
      },
    },
    '/api/admin/team-risks': {
      get: {
        tags: ['Admin'],
        summary: 'All team risk alerts',
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'acknowledged', 'resolved', 'dismissed'] } }],
        responses: { 200: { description: 'Team risk alerts' }, 401: { description: 'Not admin' } },
      },
    },
    '/api/admin/risks/{id}/acknowledge': {
      post: {
        tags: ['Admin'],
        summary: 'Acknowledge risk + email engineer',
        description: 'Acknowledges the alert and sends a risk_acknowledged email to the engineer (if that alert type is enabled in notification settings).',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Acknowledged and notification sent' }, 401: { description: 'Not admin' }, 404: { description: 'Alert not found' } },
      },
    },
    '/api/admin/risks/{id}/dismiss': {
      post: {
        tags: ['Admin'],
        summary: 'Dismiss risk + email engineer',
        description: 'Dismisses the alert and sends a risk_dismissed email to the engineer (if that alert type is enabled).',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Dismissed and notification sent' }, 401: { description: 'Not admin' }, 404: { description: 'Alert not found' } },
      },
    },

    // ── Scheduler ────────────────────────────────────────────────────────────────

    '/api/scheduler/status': {
      get: {
        tags: ['Scheduler'],
        summary: 'Current status of all background jobs',
        description: 'Returns status for: Analytics Pipeline (every 30 min) and Calendar Sync (every 2 hours).',
        responses: {
          200: {
            description: 'Job statuses',
            content: {
              'application/json': {
                example: {
                  jobs: {
                    analyticsPipeline: { name: 'Analytics Pipeline', schedule: '*/30 * * * *', enabled: true, running: false, lastRunStatus: 'success', usersProcessed: 8 },
                  },
                },
              },
            },
          },
          401: { description: 'Not admin' },
        },
      },
    },
    '/api/scheduler/trigger': {
      post: {
        tags: ['Scheduler'],
        summary: 'Manually trigger a background job',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { jobKey: { type: 'string', enum: ['analyticsPipeline', 'calendarSync'] } } } } },
        },
        responses: { 200: { description: 'Job triggered' }, 409: { description: 'Job already running' }, 401: { description: 'Not admin' } },
      },
    },
    '/api/scheduler/toggle': {
      post: {
        tags: ['Scheduler'],
        summary: 'Pause or resume a background job',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { jobKey: { type: 'string' }, enabled: { type: 'boolean' } } } } },
        },
        responses: { 200: { description: 'Job toggled' }, 401: { description: 'Not admin' } },
      },
    },

    // ── Notifications ────────────────────────────────────────────────────────────

    '/api/notifications/settings': {
      get: {
        tags: ['Notifications'],
        summary: 'List all email alert settings',
        description: 'Returns all 6 alert types with enabled status, last triggered timestamp, and trigger count.',
        responses: {
          200: {
            description: 'Alert settings',
            content: {
              'application/json': {
                example: {
                  settings: [
                    { alert_key: 'risk_detected', alert_name: 'New Risk Alert', category: 'risk', enabled: true, last_triggered: null, trigger_count: 0 },
                  ],
                },
              },
            },
          },
          401: { description: 'Not admin' },
        },
      },
      post: {
        tags: ['Notifications'],
        summary: 'Toggle an email alert on or off',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['alertKey', 'enabled'], properties: { alertKey: { type: 'string' }, enabled: { type: 'boolean' } } },
              example: { alertKey: 'burnout_warning', enabled: false },
            },
          },
        },
        responses: { 200: { description: 'Setting updated' }, 404: { description: 'Alert key not found' }, 401: { description: 'Not admin' } },
      },
    },
    '/api/notifications/test': {
      post: {
        tags: ['Notifications'],
        summary: 'Send a test email to the session user',
        description: 'Sends a test email to the admin\'s own email address. Uses console-log output if SMTP is not configured.',
        responses: {
          200: { description: 'Test email sent', content: { 'application/json': { example: { success: true, message: 'Test email sent to admin@company.com' } } } },
          401: { description: 'Not admin' },
        },
      },
    },
  },
};
