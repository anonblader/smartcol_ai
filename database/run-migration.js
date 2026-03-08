#!/usr/bin/env node
/**
 * SmartCol AI Database Migration Runner
 *
 * Runs SQL migration files against PostgreSQL database.
 *
 * Usage:
 *   node run-migration.js [migration-file]
 *   node run-migration.js migrations/001_initial_schema.sql
 *
 * Environment Variables:
 *   DATABASE_HOST     - PostgreSQL host (default: localhost)
 *   DATABASE_PORT     - PostgreSQL port (default: 5432)
 *   DATABASE_NAME     - Database name (default: smartcol)
 *   DATABASE_USER     - Database user (default: postgres)
 *   DATABASE_PASSWORD - Database password
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

// Configuration
const config = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'smartcol',
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD,
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function runMigration(sqlFilePath) {
  const client = new Client(config);

  try {
    // Read SQL file
    log(`\n📂 Reading migration file: ${sqlFilePath}`, 'cyan');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    if (!sql.trim()) {
      log('❌ Migration file is empty!', 'red');
      process.exit(1);
    }

    log(`✅ Read ${sql.split('\n').length} lines`, 'green');

    // Connect to database
    log(`\n🔌 Connecting to database: ${config.database}@${config.host}:${config.port}`, 'cyan');
    await client.connect();
    log('✅ Connected successfully', 'green');

    // Check database version
    const versionResult = await client.query('SELECT version()');
    log(`📊 PostgreSQL Version: ${versionResult.rows[0].version.split(',')[0]}`, 'blue');

    // Run migration
    log('\n🚀 Running migration...', 'cyan');
    const startTime = Date.now();

    await client.query(sql);

    const duration = Date.now() - startTime;
    log(`✅ Migration completed in ${duration}ms`, 'green');

    // Verify tables
    log('\n📋 Verifying tables...', 'cyan');
    const tablesResult = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    log(`✅ Created ${tablesResult.rows.length} tables:`, 'green');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.tablename}`);
    });

    // Check indexes
    const indexesResult = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_indexes
      WHERE schemaname = 'public'
    `);
    log(`✅ Created ${indexesResult.rows[0].count} indexes`, 'green');

    // Check views
    const viewsResult = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_views
      WHERE schemaname = 'public'
    `);
    log(`✅ Created ${viewsResult.rows[0].count} views`, 'green');

    log('\n🎉 Migration completed successfully!', 'green');

  } catch (error) {
    log('\n❌ Migration failed!', 'red');
    log(`Error: ${error.message}`, 'red');

    if (error.position) {
      log(`Position in SQL: ${error.position}`, 'yellow');
    }

    if (error.detail) {
      log(`Detail: ${error.detail}`, 'yellow');
    }

    process.exit(1);

  } finally {
    await client.end();
    log('\n🔌 Disconnected from database\n', 'cyan');
  }
}

async function checkConnection() {
  const client = new Client(config);

  try {
    log('🔍 Testing database connection...', 'cyan');
    await client.connect();

    const result = await client.query('SELECT NOW() as current_time');
    log(`✅ Connection successful! Server time: ${result.rows[0].current_time}`, 'green');

    await client.end();
    return true;

  } catch (error) {
    log('❌ Connection failed!', 'red');
    log(`Error: ${error.message}`, 'red');
    log('\nPlease check your database configuration in backend/.env:', 'yellow');
    log(`  DATABASE_HOST=${config.host}`, 'yellow');
    log(`  DATABASE_PORT=${config.port}`, 'yellow');
    log(`  DATABASE_NAME=${config.database}`, 'yellow');
    log(`  DATABASE_USER=${config.user}`, 'yellow');
    log(`  DATABASE_PASSWORD=${config.password ? '****' : '(not set)'}`, 'yellow');

    return false;
  }
}

async function listMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');

  try {
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    log('\n📋 Available migrations:', 'cyan');
    files.forEach((file, index) => {
      const filePath = path.join(migrationsDir, file);
      const stats = fs.statSync(filePath);
      const size = (stats.size / 1024).toFixed(1);
      console.log(`   ${index + 1}. ${file} (${size} KB)`);
    });
    log('');

    return files;

  } catch (error) {
    log('❌ Could not read migrations directory', 'red');
    log(`Error: ${error.message}`, 'red');
    return [];
  }
}

// Main
async function main() {
  log('╔════════════════════════════════════════════╗', 'blue');
  log('║  SmartCol AI - Database Migration Runner  ║', 'blue');
  log('╚════════════════════════════════════════════╝', 'blue');

  const args = process.argv.slice(2);
  const command = args[0];

  // Handle commands
  if (command === '--help' || command === '-h') {
    log('\nUsage:', 'cyan');
    log('  node run-migration.js <migration-file>  Run specific migration');
    log('  node run-migration.js --list            List available migrations');
    log('  node run-migration.js --check           Check database connection');
    log('  node run-migration.js --all             Run all migrations');
    log('');
    return;
  }

  if (command === '--list') {
    await listMigrations();
    return;
  }

  if (command === '--check') {
    await checkConnection();
    return;
  }

  if (command === '--all') {
    const migrations = await listMigrations();
    const migrationsDir = path.join(__dirname, 'migrations');

    for (const migration of migrations) {
      const filePath = path.join(migrationsDir, migration);
      log(`\n${'='.repeat(60)}`, 'blue');
      log(`Running: ${migration}`, 'blue');
      log('='.repeat(60), 'blue');
      await runMigration(filePath);
    }
    return;
  }

  // Run specific migration
  if (!command) {
    log('❌ No migration file specified!', 'red');
    log('Usage: node run-migration.js <migration-file>', 'yellow');
    log('   or: node run-migration.js --all', 'yellow');
    log('   or: node run-migration.js --list', 'yellow');
    process.exit(1);
  }

  // Resolve file path
  let sqlFilePath = command;
  if (!path.isAbsolute(sqlFilePath)) {
    sqlFilePath = path.join(__dirname, sqlFilePath);
  }

  // Check file exists
  if (!fs.existsSync(sqlFilePath)) {
    log(`❌ File not found: ${sqlFilePath}`, 'red');
    process.exit(1);
  }

  // Run migration
  await runMigration(sqlFilePath);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    log(`\n❌ Unexpected error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runMigration, checkConnection };
