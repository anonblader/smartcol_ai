import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import { logger } from './config/monitoring.config';
import authRoutes from './routes/auth.routes';
import syncRoutes from './routes/sync.routes';
import calendarRoutes from './routes/calendar.routes';
import analyticsRoutes from './routes/analytics.routes';
import risksRoutes from './routes/risks.routes';

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

// API routes (these match your frontend api.ts expectations)
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/risks', risksRoutes);

// Error logging
app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error('Unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;