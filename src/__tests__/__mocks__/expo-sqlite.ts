// Minimal mock for expo-sqlite used by Drizzle.
// The actual db module (src/storage/db/db.ts) is mocked at the test level,
// so this mock just prevents the import from failing.

export const openDatabaseSync = jest.fn(() => ({
  execSync: jest.fn(),
  runSync: jest.fn(),
  getFirstSync: jest.fn(() => null),
  getAllSync: jest.fn(() => []),
  prepareSync: jest.fn(() => ({
    executeSync: jest.fn(() => ({ rows: [] })),
    finalizeSync: jest.fn(),
  })),
}));

export const SQLiteDatabase = jest.fn();
