/**
 * Database Client Service
 *
 * PostgreSQL connection pool management with query utilities.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config/env';
import { logger } from '../config/monitoring.config';

/**
 * PostgreSQL connection pool
 */
class DatabaseClient {
  private pool: Pool;
  private isConnected = false;

  constructor() {
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      min: config.database.poolMin,
      max: config.database.poolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected database pool error', { error: err.message });
    });

    this.pool.on('connect', () => {
      logger.debug('New database connection established');
    });

    this.pool.on('remove', () => {
      logger.debug('Database connection removed from pool');
    });
  }

  /**
   * Initialize database connection and verify connectivity
   */
  async connect(): Promise<void> {
    try {
      logger.info('Connecting to database...', {
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
      });

      // Test connection
      const result = await this.pool.query('SELECT NOW() as current_time, version() as version');
      const { current_time, version } = result.rows[0];

      this.isConnected = true;

      logger.info('Database connected successfully', {
        currentTime: current_time,
        version: version.split(',')[0], // PostgreSQL version
        poolSize: config.database.poolMax,
      });
    } catch (error) {
      logger.error('Failed to connect to database', {
        error: error instanceof Error ? error.message : 'Unknown error',
        host: config.database.host,
        port: config.database.port,
      });
      throw error;
    }
  }

  /**
   * Close database connection pool
   */
  async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database disconnected');
    } catch (error) {
      logger.error('Error disconnecting from database', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Execute a SQL query
   */
  async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();

    try {
      if (config.debug.enableQueryLogging) {
        logger.debug('Executing query', { sql: text, params });
      }

      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - startTime;

      if (config.debug.enableQueryLogging) {
        logger.debug('Query executed', {
          duration,
          rowCount: result.rowCount,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Query execution failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sql: text,
        params,
        duration,
      });
      throw error;
    }
  }

  /**
   * Execute a query and return first row or null
   */
  async queryOne<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<T | null> {
    const result = await this.query<T>(text, params);
    return result.rows[0] || null;
  }

  /**
   * Execute a query and return all rows
   */
  async queryMany<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<T[]> {
    const result = await this.query<T>(text, params);
    return result.rows;
  }

  /**
   * Execute query within a transaction
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      logger.debug('Transaction started');

      const result = await callback(client);

      await client.query('COMMIT');
      logger.debug('Transaction committed');

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction rolled back', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get a client from the pool for manual transaction management
   */
  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  /**
   * Check if database is connected
   */
  isHealthy(): boolean {
    return this.isConnected;
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}

// Export singleton instance
export const db = new DatabaseClient();

/**
 * Initialize database connection on module load
 */
export async function initializeDatabase(): Promise<void> {
  await db.connect();
}

/**
 * Graceful shutdown
 */
export async function shutdownDatabase(): Promise<void> {
  await db.disconnect();
}

// Helper functions for common queries

/**
 * Insert a record and return the inserted row
 */
export async function insertOne<T extends QueryResultRow>(
  table: string,
  data: Record<string, any>
): Promise<T> {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

  const sql = `
    INSERT INTO ${table} (${keys.join(', ')})
    VALUES (${placeholders})
    RETURNING *
  `;

  const result = await db.queryOne<T>(sql, values);
  if (!result) {
    throw new Error(`Failed to insert into ${table}`);
  }

  return result;
}

/**
 * Update a record by ID
 */
export async function updateById<T extends QueryResultRow>(
  table: string,
  id: string,
  data: Record<string, any>
): Promise<T | null> {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

  const sql = `
    UPDATE ${table}
    SET ${setClause}, updated_at = NOW()
    WHERE id = $${keys.length + 1}
    RETURNING *
  `;

  return await db.queryOne<T>(sql, [...values, id]);
}

/**
 * Delete a record by ID
 */
export async function deleteById(table: string, id: string): Promise<boolean> {
  const sql = `DELETE FROM ${table} WHERE id = $1`;
  const result = await db.query(sql, [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Find records with pagination
 */
export async function findWithPagination<T extends QueryResultRow>(
  table: string,
  options: {
    where?: string;
    params?: any[];
    orderBy?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ rows: T[]; total: number }> {
  const { where, params = [], orderBy = 'created_at DESC', limit = 50, offset = 0 } = options;

  // Count total
  const countSql = `SELECT COUNT(*) as count FROM ${table}${where ? ` WHERE ${where}` : ''}`;
  const countResult = await db.queryOne<{ count: string }>(countSql, params);
  const total = parseInt(countResult?.count ?? '0', 10);

  // Get rows
  const dataSql = `
    SELECT * FROM ${table}
    ${where ? `WHERE ${where}` : ''}
    ORDER BY ${orderBy}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  const rows = await db.queryMany<T>(dataSql, [...params, limit, offset]);

  return { rows, total };
}
