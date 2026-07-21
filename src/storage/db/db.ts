import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as schema from './schema';
import migrations from './migrations';

const sqlite = SQLite.openDatabaseSync('sosagro.db');

export const db = drizzle(sqlite, { schema });

export async function runMigrations(): Promise<void> {
  await migrate(db, migrations);

  // Belt-and-suspenders: in development, hot-reload skips the useEffect that
  // calls this function, so the drizzle migrate never runs for new migrations.
  // Running the ALTER TABLE explicitly here (catching the "duplicate column"
  // error if it already exists) ensures the schema is always up-to-date.
  try {
    sqlite.execSync('ALTER TABLE surveys ADD COLUMN farmer_id text');
  } catch {
    // Column already exists — ignore.
  }
  try {
    sqlite.execSync('ALTER TABLE surveys ADD COLUMN backend_survey_id text');
  } catch {
    // Column already exists — ignore.
  }
}
