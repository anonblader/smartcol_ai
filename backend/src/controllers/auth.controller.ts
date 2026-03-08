/**
 * Authentication Controller
 *
 * Handles Microsoft OAuth 2.0 authentication flow.
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { graphClient } from '../services/graph.client';
import { db } from '../services/database.client';
import { logger } from '../config/monitoring.config';
import { User, OAuthToken } from '../types';

// Extend Express Session type inline
declare module 'express-session' {
  interface SessionData {
    oauth_state?: string;
    user_id?: string;
  }
}

/**
 * Generate random state for CSRF protection
 */
function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Hash token for secure lookup
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Encrypt token (simplified - in production use proper encryption with Azure Key Vault)
 */
function encryptToken(token: string): string {
  // TODO: Implement proper AES-256-GCM encryption with Azure Key Vault
  // For now, just base64 encode (NOT SECURE - placeholder only)
  return Buffer.from(token).toString('base64');
}

// TODO: Implement decryptToken() for token refresh
// function decryptToken(encryptedToken: string): string {
//   // TODO: Implement proper AES-256-GCM decryption with Azure Key Vault
//   return Buffer.from(encryptedToken, 'base64').toString('utf-8');
// }

/**
 * GET /api/auth/connect
 * Initiate OAuth flow - returns authorization URL
 */
export async function connectOutlook(req: Request, res: Response): Promise<void> {
  try {
    // Generate CSRF protection state
    const state = generateState();

    // Store state in session for verification
    req.session.oauth_state = state;

    // Get OAuth authorization URL
    const authUrl = graphClient.getAuthUrl(state);

    logger.info('OAuth connect initiated', { state });

    res.json({
      authUrl,
      message: 'Redirect user to this URL to authorize',
    });
  } catch (error) {
    logger.error('Failed to initiate OAuth connect', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to initiate OAuth connection',
    });
  }
}

/**
 * GET /api/auth/callback
 * Handle OAuth callback from Microsoft
 */
export async function handleCallback(req: Request, res: Response): Promise<void> {
  try {
    const { code, state, error, error_description } = req.query;

    // Check for OAuth errors
    if (error) {
      logger.error('OAuth error from Microsoft', {
        error,
        description: error_description,
      });

      res.status(400).json({
        error: 'OAuthError',
        message: error_description || 'OAuth authorization failed',
      });
      return;
    }

    // Validate required parameters
    if (!code || !state) {
      res.status(400).json({
        error: 'InvalidRequest',
        message: 'Missing authorization code or state parameter',
      });
      return;
    }

    // Verify state (CSRF protection)
    if (state !== req.session.oauth_state) {
      logger.error('OAuth state mismatch', {
        received: state,
        expected: req.session.oauth_state,
      });

      res.status(400).json({
        error: 'InvalidState',
        message: 'State parameter mismatch - possible CSRF attack',
      });
      return;
    }

    // Clear state from session
    delete req.session.oauth_state;

    // Exchange code for tokens
    const tokens = await graphClient.exchangeCodeForTokens(code as string);

    // Get user profile
    const userProfile = await graphClient.getUserProfile(tokens.access_token);

    // Get mailbox settings (timezone)
    const mailboxSettings = await graphClient.getMailboxSettings(tokens.access_token);

    logger.info('Successfully authenticated user', {
      userId: userProfile.id,
      email: userProfile.mail,
    });

    // Check if user exists
    let user = await db.queryOne<User>(
      'SELECT * FROM users WHERE microsoft_user_id = $1',
      [userProfile.id]
    );

    if (!user) {
      // Create new user
      // Use userPrincipalName if mail is not available (personal accounts)
      const email = userProfile.mail || userProfile.userPrincipalName;

      user = await db.queryOne<User>(
        `INSERT INTO users (
          email,
          display_name,
          microsoft_user_id,
          timezone
        ) VALUES ($1, $2, $3, $4)
        RETURNING *`,
        [
          email,
          userProfile.displayName,
          userProfile.id,
          mailboxSettings.timeZone,
        ]
      );

      logger.info('Created new user', { userId: user!.id });
    } else {
      // Update existing user
      user = await db.queryOne<User>(
        `UPDATE users
         SET display_name = $1,
             timezone = $2,
             last_login_at = NOW(),
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [userProfile.displayName, mailboxSettings.timeZone, user.id]
      );

      logger.info('Updated existing user', { userId: user!.id });
    }

    if (!user) {
      throw new Error('Failed to create or update user');
    }

    // Store encrypted tokens
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await db.query(
      `INSERT INTO oauth_tokens (
        user_id,
        access_token_encrypted,
        refresh_token_encrypted,
        token_hash,
        expires_at,
        scope
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id)
      DO UPDATE SET
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
        token_hash = EXCLUDED.token_hash,
        expires_at = EXCLUDED.expires_at,
        scope = EXCLUDED.scope,
        updated_at = NOW()`,
      [
        user.id,
        encryptToken(tokens.access_token),
        encryptToken(tokens.refresh_token || ''),
        hashToken(tokens.access_token),
        expiresAt,
        tokens.scope,
      ]
    );

    logger.info('Stored OAuth tokens', { userId: user.id });

    // Store user ID in session
    req.session.user_id = user.id;

    // Redirect to frontend with success
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        timezone: user.timezone,
      },
      message: 'Successfully connected to Microsoft Outlook',
    });
  } catch (error) {
    logger.error('OAuth callback failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to complete OAuth authorization',
    });
  }
}

/**
 * GET /api/auth/status
 * Check if user is authenticated and has valid tokens
 */
export async function getAuthStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.session.user_id;

    if (!userId) {
      res.json({
        authenticated: false,
        message: 'No active session',
      });
      return;
    }

    // Get user and token info
    const user = await db.queryOne<User>('SELECT * FROM users WHERE id = $1', [userId]);

    if (!user) {
      res.json({
        authenticated: false,
        message: 'User not found',
      });
      return;
    }

    const token = await db.queryOne<OAuthToken>(
      'SELECT * FROM oauth_tokens WHERE user_id = $1',
      [userId]
    );

    if (!token) {
      res.json({
        authenticated: false,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
        },
        message: 'No OAuth tokens found - please reconnect',
      });
      return;
    }

    // Check if token is expired
    const isExpired = new Date(token.expires_at) < new Date();

    res.json({
      authenticated: !isExpired,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        timezone: user.timezone,
      },
      tokenExpired: isExpired,
      lastSync: token.last_sync_at,
    });
  } catch (error) {
    logger.error('Failed to check auth status', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to check authentication status',
    });
  }
}

/**
 * POST /api/auth/disconnect
 * Revoke access and delete tokens
 */
export async function disconnectOutlook(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.session.user_id;

    if (!userId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No active session',
      });
      return;
    }

    // Delete OAuth tokens
    await db.query('DELETE FROM oauth_tokens WHERE user_id = $1', [userId]);

    // Clear session
    req.session.destroy((err) => {
      if (err) {
        logger.error('Failed to destroy session', {
          error: err.message,
        });
      }
    });

    logger.info('User disconnected from Outlook', { userId });

    res.json({
      success: true,
      message: 'Successfully disconnected from Microsoft Outlook',
    });
  } catch (error) {
    logger.error('Failed to disconnect', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to disconnect from Outlook',
    });
  }
}
