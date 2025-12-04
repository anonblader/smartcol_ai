// scripts/create-user.ts
import { DatabaseClient } from '../src/services/database.client';

async function createUser(email: string, displayName: string) {
  const db = new DatabaseClient();

  const result = await db.query(
    `INSERT INTO users (email, display_name, microsoft_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING user_id`,
    [email, displayName, 'manual-' + Date.now()]
  );

  const userId = result.rows[0].user_id;

  // Create default settings
  await db.query(
    `INSERT INTO user_settings (user_id)
     VALUES ($1)`,
    [userId]
  );

  console.log(`User created: ${userId}`);
}

createUser('user@example.com', 'Test User');