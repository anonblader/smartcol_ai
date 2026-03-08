/**
 * Test Server - No Database Required
 *
 * Start a minimal server to test OAuth URL generation
 */

import express from 'express';
import session from 'express-session';
import cors from 'cors';
import { config } from './src/config/env';
import { graphClient } from './src/services/graph.client';
import crypto from 'crypto';

const app = express();

app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: config.security.sessionSecret,
    resave: false,
    saveUninitialized: false,
  })
);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Test server running' });
});

// Get OAuth authorization URL (no database needed)
app.get('/api/auth/connect', (_req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = graphClient.getAuthUrl(state);

  console.log('\n✅ OAuth URL Generated:');
  console.log(authUrl);
  console.log('\n📋 Copy this URL and paste it in your browser to authorize\n');

  res.json({
    success: true,
    authUrl,
    message: 'Copy the authUrl and paste it in your browser to test Microsoft login',
    note: 'Database connection not required for this test',
  });
});

// Test endpoint to show what would happen after OAuth callback
app.get('/api/auth/callback', (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    res.json({
      success: false,
      error,
      description: error_description,
      message: 'OAuth authorization failed',
    });
    return;
  }

  if (!code) {
    res.json({
      success: false,
      message: 'No authorization code received',
    });
    return;
  }

  res.json({
    success: true,
    message: 'Authorization code received! ✅',
    note: 'In the full application, this code would be exchanged for tokens and user would be created in database',
    received: {
      code: `${String(code).substring(0, 20)}...`,
      state,
    },
  });
});

// Start server
const port = config.port;
app.listen(port, () => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        SmartCol AI - Test Server (No Database)           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`✅ Server running on http://localhost:${port}`);
  console.log(`\n📍 Test Endpoints:`);
  console.log(`   - GET  http://localhost:${port}/health`);
  console.log(`   - GET  http://localhost:${port}/api/auth/connect`);
  console.log(`\n🔗 To test OAuth flow:`);
  console.log(`   1. Visit: http://localhost:${port}/api/auth/connect`);
  console.log(`   2. Copy the "authUrl" from the response`);
  console.log(`   3. Paste it in your browser`);
  console.log(`   4. Login with your Microsoft 365 account`);
  console.log(`   5. You'll be redirected back to the callback endpoint`);
  console.log(`\n⚠️  Note: This is a test server without database.`);
  console.log(`   For full functionality, set up PostgreSQL and run: npm run dev`);
  console.log('\n');
});
