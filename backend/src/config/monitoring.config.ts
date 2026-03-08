/**
 * Monitoring and Logging Configuration
 *
 * Structured JSON logging for production environments.
 * TODO: Add Azure Application Insights integration for production.
 */

export const initializeMonitoring = () => {
  // TODO: Initialize Azure Application Insights when ready
  // For now, just use console logging
  console.log('Monitoring initialized (console logging)');
};

// Custom structured logger
export const logger = {
  info: (message: string, meta?: any) => {
    console.log(
      JSON.stringify({
        level: 'info',
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      })
    );
  },

  error: (message: string, meta?: any) => {
    console.error(
      JSON.stringify({
        level: 'error',
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      })
    );
  },

  warn: (message: string, meta?: any) => {
    console.warn(
      JSON.stringify({
        level: 'warn',
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      })
    );
  },

  debug: (message: string, meta?: any) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        JSON.stringify({
          level: 'debug',
          message,
          timestamp: new Date().toISOString(),
          ...meta,
        })
      );
    }
  },
};
