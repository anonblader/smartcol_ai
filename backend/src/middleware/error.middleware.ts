/**
 * Error Middleware
 *
 * Centralised Express error handler. Catches both known AppErrors and
 * unexpected exceptions, returning a consistent JSON response shape.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/monitoring.config';

/**
 * Typed application error.
 * Throw this anywhere in route handlers or services to produce a clean HTTP error.
 *
 * Example:
 *   throw new AppError(404, 'NotFound', 'Event not found');
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Express error-handling middleware (must be registered LAST in app.ts).
 */
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  const stack   = err instanceof Error ? err.stack   : undefined;

  logger.error('Unhandled error', { message, stack });

  res.status(500).json({
    error:   'InternalServerError',
    message: 'An unexpected error occurred',
  });
}
