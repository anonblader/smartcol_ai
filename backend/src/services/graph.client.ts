/**
 * Microsoft Graph API Client
 *
 * Handles OAuth 2.0 authentication and Microsoft Graph API interactions.
 */

import axios, { AxiosInstance } from 'axios';
import { config } from '../config/env';
import { logger } from '../config/monitoring.config';
import { GraphEvent, GraphUser, GraphTokenResponse } from '../types';

/**
 * Microsoft Graph API Client
 */
class GraphClient {
  private httpClient: AxiosInstance;
  private authUrl: string;

  constructor() {
    this.httpClient = axios.create({
      baseURL: config.graph.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.authUrl = config.graph.authUrl;

    // Add response interceptor for logging
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Graph API request failed', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.response?.data?.error?.message || error.message,
        });
        throw error;
      }
    );
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthUrl(state: string): string {
    const scopes = config.azure.scopes.join(' ');
    const params = new URLSearchParams({
      client_id: config.azure.clientId,
      response_type: 'code',
      redirect_uri: config.azure.redirectUri,
      response_mode: 'query',
      scope: scopes,
      state,
      prompt: 'select_account', // Force account selection
    });

    const url = `${this.authUrl}/authorize?${params.toString()}`;
    logger.debug('Generated OAuth URL', { state, scopes });

    return url;
  }

  /**
   * Exchange authorization code for access/refresh tokens
   */
  async exchangeCodeForTokens(code: string): Promise<GraphTokenResponse> {
    try {
      logger.info('Exchanging authorization code for tokens');

      const params = new URLSearchParams({
        client_id: config.azure.clientId,
        client_secret: config.azure.clientSecret,
        code,
        redirect_uri: config.azure.redirectUri,
        grant_type: 'authorization_code',
      });

      const response = await axios.post<GraphTokenResponse>(
        `${this.authUrl}/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      logger.info('Successfully exchanged code for tokens', {
        expiresIn: response.data.expires_in,
        scope: response.data.scope,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to exchange authorization code', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('Failed to exchange authorization code for tokens');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<GraphTokenResponse> {
    try {
      logger.info('Refreshing access token');

      const params = new URLSearchParams({
        client_id: config.azure.clientId,
        client_secret: config.azure.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });

      const response = await axios.post<GraphTokenResponse>(
        `${this.authUrl}/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      logger.info('Successfully refreshed access token', {
        expiresIn: response.data.expires_in,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to refresh access token', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('Failed to refresh access token');
    }
  }

  /**
   * Get user profile from Microsoft Graph
   */
  async getUserProfile(accessToken: string): Promise<GraphUser> {
    try {
      logger.info('Fetching user profile from Graph API');

      const response = await this.httpClient.get<GraphUser>('/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      logger.info('Successfully fetched user profile', {
        userId: response.data.id,
        email: response.data.mail,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to fetch user profile', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('Failed to fetch user profile');
    }
  }

  /**
   * Get calendar events from Microsoft Graph
   * Supports delta queries for incremental sync
   */
  async getCalendarEvents(
    accessToken: string,
    options: {
      deltaLink?: string;
      startDateTime?: string;
      endDateTime?: string;
      top?: number;
    } = {}
  ): Promise<{
    events: GraphEvent[];
    deltaLink: string;
    nextLink?: string;
  }> {
    try {
      const { deltaLink, startDateTime, endDateTime, top = 100 } = options;

      let url: string;

      if (deltaLink) {
        // Use delta link for incremental sync
        url = deltaLink;
        logger.info('Fetching calendar events using delta link');
      } else {
        // Initial sync or full sync with filters
        url = '/me/events/delta';
        const params = new URLSearchParams({
          $top: top.toString(),
        });

        if (startDateTime && endDateTime) {
          params.append('startDateTime', startDateTime);
          params.append('endDateTime', endDateTime);
        }

        url = `${url}?${params.toString()}`;
        logger.info('Fetching calendar events (full sync)', {
          startDateTime,
          endDateTime,
        });
      }

      // Use axios directly for full URLs (delta links), httpClient for relative paths
      const response = deltaLink
        ? await axios.get(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Prefer: 'odata.maxpagesize=100',
            },
          })
        : await this.httpClient.get(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Prefer: 'odata.maxpagesize=100',
            },
          });

      const events = response.data.value as GraphEvent[];
      const newDeltaLink = response.data['@odata.deltaLink'] as string | undefined;
      const nextLink = response.data['@odata.nextLink'] as string | undefined;

      logger.info('Successfully fetched calendar events', {
        count: events.length,
        hasDeltaLink: !!newDeltaLink,
        hasNextLink: !!nextLink,
      });

      return {
        events,
        deltaLink: newDeltaLink || deltaLink || '',
        nextLink,
      };
    } catch (error) {
      logger.error('Failed to fetch calendar events', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('Failed to fetch calendar events');
    }
  }

  /**
   * Get all calendar events with pagination support
   */
  async getAllCalendarEvents(
    accessToken: string,
    startDateTime?: string,
    endDateTime?: string
  ): Promise<GraphEvent[]> {
    const allEvents: GraphEvent[] = [];
    let nextLink: string | undefined;

    do {
      const result = await this.getCalendarEvents(accessToken, {
        deltaLink: nextLink,
        startDateTime,
        endDateTime,
      });

      allEvents.push(...result.events);
      nextLink = result.nextLink;

      logger.debug('Fetched page of events', {
        pageCount: result.events.length,
        totalCount: allEvents.length,
        hasMore: !!nextLink,
      });
    } while (nextLink);

    logger.info('Fetched all calendar events', {
      totalCount: allEvents.length,
    });

    return allEvents;
  }

  /**
   * Get user's mailbox settings (timezone)
   */
  async getMailboxSettings(accessToken: string): Promise<{ timeZone: string }> {
    try {
      const response = await this.httpClient.get('/me/mailboxSettings', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return {
        timeZone: response.data.timeZone || 'UTC',
      };
    } catch (error) {
      logger.warn('Failed to fetch mailbox settings, using UTC', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { timeZone: 'UTC' };
    }
  }

  /**
   * Validate access token
   */
  async validateToken(accessToken: string): Promise<boolean> {
    try {
      await this.httpClient.get('/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const graphClient = new GraphClient();
