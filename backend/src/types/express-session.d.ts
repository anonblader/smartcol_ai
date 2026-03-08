/**
 * Express Session Type Extensions
 */

import 'express-session';

declare module 'express-session' {
  interface SessionData {
    oauth_state?: string;
    user_id?: string;
  }
}
