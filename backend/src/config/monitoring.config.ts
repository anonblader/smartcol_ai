// src/config/monitoring.config.ts
import { ApplicationInsights } from '@azure/monitor-opentelemetry-exporter';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export const initializeMonitoring = () => {
  const provider = new NodeTracerProvider();

  const exporter = new ApplicationInsights({
    connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
  });

  provider.addSpanProcessor(exporter);
  provider.register();

  console.log('Application Insights initialized');
};

// Custom logging
export const logger = {
  info: (message: string, meta?: any) => {
    console.log(JSON.stringify({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      ...meta
    }));
  },

  error: (message: string, error?: Error, meta?: any) => {
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: error?.message,
      stack: error?.stack,
      timestamp: new Date().toISOString(),
      ...meta
    }));
  },

  warn: (message: string, meta?: any) => {
    console.warn(JSON.stringify({
      level: 'warn',
      message,
      timestamp: new Date().toISOString(),
      ...meta
    }));
  }
};
