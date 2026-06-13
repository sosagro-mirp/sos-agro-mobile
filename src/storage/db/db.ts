import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as schema from './schema';
import migrations from './migrations';

const sqlite = SQLite.openDatabaseSync('sosagro.db');

export const db = drizzle(sqlite, { schema });

export async function runMigrations(): Promise<void> {
  await migrate(db, migrations);
}
