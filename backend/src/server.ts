/**
 * Server Entry Point
 *
 * Initializes database, monitoring, and starts the Express server.
 */

import http from 'http';
import app from './app';
import { initializeMonitoring, logger } from './config/monitoring.config';
import { config, logConfig } from './config/env';
import { initializeDatabase, shutdownDatabase } from './services/database.client';

const port = config.port;

/**
 * Start the server
 */
async function startServer() {
  try {
    // Initialize monitoring
    initializeMonitoring();

    // Log configuration (safe for logging)
    logger.info('Starting SmartCol AI Backend', logConfig());

    // Initialize database connection
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // Create HTTP server
    const server = http.createServer(app);

    // Start listening
    server.listen(port, () => {
      logger.info(`Server listening on port ${port}`, {
        environment: config.env,
        port,
      });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await shutdownDatabase();
          logger.info('Database connections closed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          process.exit(1);
        }
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
      });
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
}

// Start the server
startServer();