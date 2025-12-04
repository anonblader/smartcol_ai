import http from 'http';
import app from './app';
import { initializeMonitoring, logger } from './config/monitoring.config';

const port = process.env.PORT || 3001;

initializeMonitoring();

const server = http.createServer(app);

server.listen(port, () => {
  logger.info(`Backend listening on port ${port}`);
});