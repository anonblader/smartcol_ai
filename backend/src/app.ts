import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.config';
import { logger } from './config/monitoring.config';
import authRoutes from './routes/auth.routes';
import syncRoutes from './routes/sync.routes';
import calendarRoutes from './routes/calendar.routes';
import analyticsRoutes from './routes/analytics.routes';
import risksRoutes from './routes/risks.routes';
import testRoutes from './routes/test.routes';
import adminRoutes from './routes/admin.routes';
import offdayRoutes from './routes/offday.routes';
import mlPredictionRoutes  from './routes/ml-prediction.routes';
import schedulerRoutes            from './routes/scheduler.routes';
import notificationSettingsRoutes from './routes/notification-settings.routes';
import { requireAdmin }    from './middleware/admin.middleware';

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false
}));

// Healthcheck
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Swagger UI — interactive API documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'SmartCol AI — API Docs',
  customCss: '.swagger-ui .topbar { background: #1e293b; } .swagger-ui .topbar-wrapper img { content: none; } .swagger-ui .topbar-wrapper::after { content: "SmartCol AI"; color: #fff; font-weight: 700; font-size: 18px; }',
}));

// Raw OpenAPI spec (JSON) for tooling
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

// API routes (these match your frontend api.ts expectations)
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/risks', risksRoutes);
app.use('/api/admin',  requireAdmin, adminRoutes);
app.use('/api/offday', offdayRoutes);
app.use('/api/ml',        mlPredictionRoutes);
app.use('/api/scheduler',      requireAdmin, schedulerRoutes);
app.use('/api/notifications',  requireAdmin, notificationSettingsRoutes);
app.use('/api/test',      requireAdmin, testRoutes);

// Error logging
app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error('Unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;