/**
 * Environment Configuration
 *
 * Centralized environment variable management with validation and type safety.
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
dotenv.config({ path: resolve(__dirname, '../../.env') });

/**
 * Get environment variable with optional default value
 */
function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];

  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }

  return value;
}

/**
 * Get numeric environment variable
 */
function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];

  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
  }

  return parsed;
}

/**
 * Get boolean environment variable
 */
function getEnvBoolean(key: string, defaultValue = false): boolean {
  const value = process.env[key];

  if (value === undefined) {
    return defaultValue;
  }

  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Application environment configuration
 */
export const config = {
  // Node environment
  env: getEnv('NODE_ENV', 'development'),
  port: getEnvNumber('PORT', 3001),
  isDevelopment: getEnv('NODE_ENV', 'development') === 'development',
  isProduction: getEnv('NODE_ENV', 'development') === 'production',
  isTest: getEnv('NODE_ENV', 'development') === 'test',

  // Database (PostgreSQL)
  database: {
    host: getEnv('DATABASE_HOST', 'localhost'),
    port: getEnvNumber('DATABASE_PORT', 5432),
    name: getEnv('DATABASE_NAME', 'smartcol'),
    user: getEnv('DATABASE_USER', 'postgres'),
    password: getEnv('DATABASE_PASSWORD'),
    poolMin: getEnvNumber('DATABASE_POOL_MIN', 2),
    poolMax: getEnvNumber('DATABASE_POOL_MAX', 10),
    ssl: getEnvBoolean('DATABASE_SSL', false),
  },

  // Redis
  redis: {
    host: getEnv('REDIS_HOST', 'localhost'),
    port: getEnvNumber('REDIS_PORT', 6379),
    password: getEnv('REDIS_PASSWORD', ''),
    db: getEnvNumber('REDIS_DB', 0),
    tokenTtl: getEnvNumber('REDIS_TOKEN_TTL', 3600), // 1 hour
    cacheTtl: getEnvNumber('REDIS_CACHE_TTL', 900), // 15 minutes
    sessionTtl: getEnvNumber('REDIS_SESSION_TTL', 86400), // 24 hours
  },

  // Microsoft Azure AD (OAuth 2.0)
  azure: {
    clientId: getEnv('AZURE_AD_CLIENT_ID'),
    clientSecret: getEnv('AZURE_AD_CLIENT_SECRET'),
    tenantId: getEnv('AZURE_AD_TENANT_ID'),
    redirectUri: getEnv('AZURE_AD_REDIRECT_URI'),
    scopes: getEnv(
      'OAUTH_SCOPES',
      'User.Read Calendars.Read Calendars.Read.Shared MailboxSettings.Read offline_access'
    ).split(' '),
  },

  // Microsoft Graph API
  graph: {
    baseUrl: getEnv('GRAPH_API_BASE_URL', 'https://graph.microsoft.com/v1.0'),
    authUrl: `https://login.microsoftonline.com/${getEnv('AZURE_AD_TENANT_ID')}/oauth2/v2.0`,
  },

  // Azure Key Vault (Production)
  keyVault: {
    name: getEnv('AZURE_KEY_VAULT_NAME', ''),
    url: getEnv('AZURE_KEY_VAULT_URL', ''),
  },

  // Security
  security: {
    sessionSecret: getEnv('SESSION_SECRET'),
    tokenEncryptionKey: getEnv('TOKEN_ENCRYPTION_KEY', ''),
    jwtSecret: getEnv('JWT_SECRET', ''),
    jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '7d'),
  },

  // CORS
  cors: {
    origin: getEnv('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: getEnvBoolean('CORS_CREDENTIALS', true),
  },

  // Rate Limiting
  rateLimit: {
    enabled: getEnvBoolean('ENABLE_RATE_LIMITING', true),
    windowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 900000), // 15 minutes
    maxRequests: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  },

  // Email / SMTP
  email: {
    host:     getEnv('EMAIL_HOST', 'smtp.gmail.com'),
    port:     getEnvNumber('EMAIL_PORT', 587),
    user:     getEnv('EMAIL_USER', ''),
    pass:     getEnv('EMAIL_PASS', ''),
    fromName: getEnv('EMAIL_FROM_NAME', 'SmartCol AI'),
  },

  // Role-based access
  admin: {
    emails: getEnv('ADMIN_EMAILS', '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
    frontendUrl: getEnv('FRONTEND_URL', 'http://localhost:3000'),
  },

  // AI Classification Service
  ai: {
    serviceUrl: getEnv('AI_SERVICE_URL', 'http://localhost:8000'),
    timeout: getEnvNumber('AI_SERVICE_TIMEOUT', 10000), // 10 seconds
    minConfidenceThreshold: parseFloat(getEnv('MIN_CONFIDENCE_THRESHOLD', '0.5')),
  },

  // Background Jobs
  jobs: {
    syncIntervalMinutes: getEnvNumber('SYNC_INTERVAL_MINUTES', 15),
    maxRetries: getEnvNumber('JOB_MAX_RETRIES', 3),
    backoffDelay: getEnvNumber('JOB_BACKOFF_DELAY', 60000), // 1 minute
  },

  // Logging
  logging: {
    level: getEnv('LOG_LEVEL', 'info'),
    format: getEnv('LOG_FORMAT', 'json'),
    fileError: getEnv('LOG_FILE_ERROR', './logs/error.log'),
    fileCombined: getEnv('LOG_FILE_COMBINED', './logs/combined.log'),
  },

  // Monitoring (Azure Application Insights)
  monitoring: {
    enabled: getEnvBoolean('ENABLE_APPINSIGHTS', false),
    instrumentationKey: getEnv('APPINSIGHTS_INSTRUMENTATIONKEY', ''),
    connectionString: getEnv('APPINSIGHTS_CONNECTION_STRING', ''),
  },

  // Notifications
  notifications: {
    emailProvider: getEnv('EMAIL_PROVIDER', 'sendgrid'),
    emailFrom: getEnv('EMAIL_FROM', 'noreply@smartcol.ai'),
    emailFromName: getEnv('EMAIL_FROM_NAME', 'SmartCol AI'),
    sendgridApiKey: getEnv('SENDGRID_API_KEY', ''),
    fcmServerKey: getEnv('FCM_SERVER_KEY', ''),
  },

  // Feature Flags
  features: {
    riskDetection: getEnvBoolean('ENABLE_RISK_DETECTION', true),
    offDayRecommendations: getEnvBoolean('ENABLE_OFFDAY_RECOMMENDATIONS', true),
    weeklySummaries: getEnvBoolean('ENABLE_WEEKLY_SUMMARIES', true),
    realTimeNotifications: getEnvBoolean('ENABLE_REAL_TIME_NOTIFICATIONS', true),
  },

  // Development
  debug: {
    showErrorStack: getEnvBoolean('SHOW_ERROR_STACK', true),
    enableRequestLogging: getEnvBoolean('ENABLE_REQUEST_LOGGING', true),
    enableQueryLogging: getEnvBoolean('ENABLE_QUERY_LOGGING', false),
  },
} as const;

/**
 * Validate required environment variables on startup
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // Check required database config
  if (!config.database.password && config.isProduction) {
    errors.push('DATABASE_PASSWORD is required in production');
  }

  // Check Azure AD config
  if (!config.azure.clientId) {
    errors.push('AZURE_AD_CLIENT_ID is required');
  }
  if (!config.azure.clientSecret) {
    errors.push('AZURE_AD_CLIENT_SECRET is required');
  }
  if (!config.azure.tenantId) {
    errors.push('AZURE_AD_TENANT_ID is required');
  }

  // Check security config
  if (!config.security.sessionSecret) {
    errors.push('SESSION_SECRET is required');
  }

  // Check token encryption in production
  if (config.isProduction && !config.security.tokenEncryptionKey) {
    errors.push('TOKEN_ENCRYPTION_KEY is required in production');
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuration validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
    );
  }
}

/**
 * Log configuration (safe for logging - no secrets)
 */
export function logConfig(): Record<string, unknown> {
  return {
    env: config.env,
    port: config.port,
    database: {
      host: config.database.host,
      port: config.database.port,
      name: config.database.name,
      user: config.database.user,
      ssl: config.database.ssl,
    },
    redis: {
      host: config.redis.host,
      port: config.redis.port,
    },
    azure: {
      tenantId: config.azure.tenantId,
      redirectUri: config.azure.redirectUri,
    },
    features: config.features,
  };
}

// Validate configuration on module load
if (!config.isTest) {
  try {
    validateConfig();
  } catch (error) {
    console.error('Configuration validation failed:', error);
    process.exit(1);
  }
}
