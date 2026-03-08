/**
 * Authentication Routes
 *
 * OAuth 2.0 authentication with Microsoft Azure AD
 */

import { Router } from 'express';
import {
  connectOutlook,
  handleCallback,
  getAuthStatus,
  disconnectOutlook,
} from '../controllers/auth.controller';

const router = Router();

/**
 * GET /api/auth/connect
 * Initiate OAuth flow - returns authorization URL for Microsoft login
 */
router.get('/connect', connectOutlook);

/**
 * GET /api/auth/callback
 * OAuth callback endpoint - handles authorization code exchange
 */
router.get('/callback', handleCallback);

/**
 * GET /api/auth/status
 * Check authentication status and token validity
 */
router.get('/status', getAuthStatus);

/**
 * POST /api/auth/disconnect
 * Revoke access and delete OAuth tokens
 */
router.post('/disconnect', disconnectOutlook);

export default router;
