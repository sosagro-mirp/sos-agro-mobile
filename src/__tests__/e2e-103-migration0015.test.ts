/**
 * Spec 103 — Flujo del encuestador por productor en el móvil (H6).
 * Migración m0015 (DM10): anclas en `surveys`, tablas de la foto de cobertura
 * y reconstrucción de `consent_records` conservando todas las filas. Cubre el
 * criterio C15 de `spec/103_encuestador_movil_por_productor.md`.
 *
 * ARRANCA EN ROJO: m0015 no existe en `src/storage/db/migrations/index.ts` ni
 * el esquema de Drizzle declara las columnas/tablas nuevas (Fase 2).
 *
 * Además de revisar el SQL, los casos de C15 ejecutan la cadena real de
 * migraciones m0000 → m0015 sobre una SQLite en memoria (`node:sqlite`, del
 * propio Node; no es una dependencia nueva), con constancias de campaña ya
 * guardadas antes de m0015, y comprueban que sobreviven intactas.
 *
 * ── Contrato de m0015 ────────────────────────────────────────────────────────
 *
 *   - Entrada `{ idx: 15, tag: 'm0015' }` en el journal y clave `m0015` en
 *     `migrations` (sentencias separadas por `--> statement-breakpoint`).
 *   - `ALTER TABLE surveys ADD COLUMN farm_id text` y `... farm_crop_id text`.
 *   - `coverage_snapshot` (fila única: `id`, `computed_at`, `downloaded_at`, `columns`).
 *   - `farmer_coverage_cache` (`farmer_id` PK, `name`, `document_id`,
 *     `department_id`, `town_id`, `crop_ids`, `farms_count`,
 *     `has_pending_consent`, `summary`, `detail`, `computed_at`) con índice por `name`.
 *   - `consent_records` reconstruida: tabla nueva con `session_id` NULLABLE,
 *     `farmer_id` y `survey_id`; copia de todas las filas; borrado de la vieja
 *     y renombrado. Sin BEGIN/COMMIT propios: el migrador de Drizzle ya
 *     envuelve todas las migraciones en una transacción.
 *
 *   Esquema Drizzle (`schema.ts`): `surveys.farmId`/`farmCropId`,
 *   `consentRecords.sessionId` sin `notNull`, `consentRecords.farmerId`/`surveyId`,
 *   y tablas exportadas `coverageSnapshot` y `farmerCoverageCache`.
 */

import migrations from '../storage/db/migrations';
import * as schema from '../storage/db/schema';

type Migrations = {
  journal: { entries: { idx: number; tag: string }[] };
  migrations: Record<string, string>;
};
const m = migrations as unknown as Migrations;
const m0015 = (): string => {
  const sql = m.migrations.m0015;
  if (!sql) throw new Error('Spec 103 — la migración m0015 todavía no existe');
  return sql;
};

// ─── SQLite real en memoria (node:sqlite) ────────────────────────────────────

interface NodeSqlite {
  exec(sql: string): void;
  prepare(sql: string): { all(...p: unknown[]): Record<string, unknown>[]; run(...p: unknown[]): unknown };
  close(): void;
}

function openMemoryDb(): NodeSqlite {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (p: string) => NodeSqlite };
  return new DatabaseSync(':memory:');
}

function runMigration(db: NodeSqlite, tag: string) {
  const sql = m.migrations[tag];
  if (!sql) throw new Error(`Spec 103 — falta la migración ${tag}`);
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim()) db.exec(statement);
  }
}

function migrateUpTo(db: NodeSqlite, lastIdx: number) {
  for (const entry of [...m.journal.entries].sort((a, b) => a.idx - b.idx)) {
    if (entry.idx > lastIdx) break;
    runMigration(db, `m${String(entry.idx).padStart(4, '0')}`);
  }
}

const columnsOf = (db: NodeSqlite, table: string) =>
  db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number }[];

const CONSENTS_BEFORE = [
  ['local_consent_a', 'local_session_a', 'doc-1', 'Ana Pérez', 1, 1, 0, 0, 1, 1762590000000, 'pending', 1762590001000],
  ['local_consent_b', '33333333-3333-4333-8333-333333333103', 'doc-1', null, 1, 0, 1, 0, 0, 1762500000000, 'synced', 1762500001000],
  ['local_consent_c', 'local_session_c', 'doc-1', 'Carlos', 1, 0, 0, 1, 0, 1762400000000, 'failed', 1762400001000],
];

function seedConsents(db: NodeSqlite) {
  const insert = db.prepare(
    'INSERT INTO consent_records (id, session_id, consent_document_id, respondent_name, accepted_data_processing, accepted_photo, accepted_audio, accepted_video, accepted_follow_up_contact, accepted_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const row of CONSENTS_BEFORE) insert.run(...row);
}

// ═══ Journal y SQL ═══════════════════════════════════════════════════════════

describe('m0015 — journal y SQL', () => {
  it('está registrada en el journal con idx 15', () => {
    expect(m.journal.entries).toEqual(expect.arrayContaining([expect.objectContaining({ idx: 15, tag: 'm0015' })]));
    expect(typeof m.migrations.m0015).toBe('string');
  });

  it('agrega farm_id y farm_crop_id a surveys', () => {
    const sql = m0015();
    expect(sql).toMatch(/ALTER TABLE `?surveys`? ADD COLUMN `?farm_id`? text/i);
    expect(sql).toMatch(/ALTER TABLE `?surveys`? ADD COLUMN `?farm_crop_id`? text/i);
  });

  it('crea coverage_snapshot y farmer_coverage_cache con índice por nombre', () => {
    const sql = m0015();
    expect(sql).toMatch(/CREATE TABLE[^;]*`?coverage_snapshot`?/i);
    expect(sql).toMatch(/CREATE TABLE[^;]*`?farmer_coverage_cache`?/i);
    expect(sql).toMatch(/CREATE INDEX[^;]*`?farmer_coverage_cache`?\s*\(\s*`?name`?\s*\)/i);
  });

  it('reconstruye consent_records copiando antes de borrar, sin BEGIN/COMMIT propios', () => {
    const sql = m0015();
    const copyAt = sql.search(/INSERT INTO[^;]*SELECT[^;]*FROM\s+`?consent_records`?/i);
    const dropAt = sql.search(/DROP TABLE\s+`?consent_records`?/i);
    const renameAt = sql.search(/ALTER TABLE[^;]*RENAME TO\s+`?consent_records`?/i);

    expect(copyAt).toBeGreaterThanOrEqual(0);
    expect(dropAt).toBeGreaterThan(copyAt);
    expect(renameAt).toBeGreaterThan(dropAt);
    expect(sql).not.toMatch(/\bBEGIN\b|\bCOMMIT\b/i);
  });
});

// ═══ C15 — ejecución real ════════════════════════════════════════════════════

describe('m0015 — C15: ejecución real sobre SQLite', () => {
  let db: NodeSqlite;

  beforeEach(() => {
    db = openMemoryDb();
    migrateUpTo(db, 14);
    seedConsents(db);
  });

  afterEach(() => db.close());

  it('la cadena m0000 → m0014 de hoy corre en el arnés (control)', () => {
    expect(db.prepare('SELECT COUNT(*) AS n FROM consent_records').all()[0].n).toBe(3);
  });

  it('conserva todas las constancias existentes con su session_id y sus datos', () => {
    runMigration(db, 'm0015');

    const rows = db
      .prepare('SELECT id, session_id, consent_document_id, respondent_name, accepted_data_processing, accepted_photo, accepted_audio, accepted_video, accepted_follow_up_contact, accepted_at, status, created_at FROM consent_records ORDER BY id')
      .all()
      .map((r) => Object.values(r));

    expect(rows).toEqual(CONSENTS_BEFORE);
  });

  it('session_id pasa a admitir nulos y aparecen farmer_id y survey_id', () => {
    runMigration(db, 'm0015');

    const cols = columnsOf(db, 'consent_records');
    expect(cols.find((c) => c.name === 'session_id')?.notnull).toBe(0);
    expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining(['farmer_id', 'survey_id']));

    db.prepare(
      'INSERT INTO consent_records (id, session_id, farmer_id, consent_document_id, accepted_data_processing, accepted_at, status, created_at) VALUES (?, NULL, ?, ?, 1, ?, ?, ?)',
    ).run('local_consent_new', 'aaaaaaaa-0000-4000-8000-000000000103', 'doc-1', 1762600000000, 'pending', 1762600001000);
    expect(db.prepare('SELECT COUNT(*) AS n FROM consent_records').all()[0].n).toBe(4);
  });

  it('conserva los defaults de las autorizaciones y del estado', () => {
    runMigration(db, 'm0015');

    db.prepare(
      'INSERT INTO consent_records (id, survey_id, consent_document_id, accepted_data_processing, accepted_at, created_at) VALUES (?, ?, ?, 1, ?, ?)',
    ).run('local_consent_def', 'local_survey_x', 'doc-1', 1762600000000, 1762600001000);
    const row = db.prepare("SELECT accepted_photo, accepted_audio, accepted_video, accepted_follow_up_contact, status FROM consent_records WHERE id = 'local_consent_def'").all()[0];
    expect(row).toEqual({ accepted_photo: 0, accepted_audio: 0, accepted_video: 0, accepted_follow_up_contact: 0, status: 'pending' });
  });

  it('agrega las columnas nuevas y las tablas de la foto', () => {
    runMigration(db, 'm0015');

    expect(columnsOf(db, 'surveys').map((c) => c.name)).toEqual(expect.arrayContaining(['farm_id', 'farm_crop_id']));
    expect(columnsOf(db, 'coverage_snapshot').map((c) => c.name)).toEqual(
      expect.arrayContaining(['computed_at', 'downloaded_at', 'columns']),
    );
    expect(columnsOf(db, 'farmer_coverage_cache').map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'farmer_id', 'name', 'document_id', 'department_id', 'town_id', 'crop_ids',
        'farms_count', 'has_pending_consent', 'summary', 'detail', 'computed_at',
      ]),
    );
  });

  it('no toca las encuestas existentes', () => {
    db.prepare("INSERT INTO surveys (id, instrument_id, status, created_at, updated_at) VALUES ('local_survey_old', 'i-1', 'completed', 1, 2)").run();

    runMigration(db, 'm0015');

    const row = db.prepare("SELECT id, status, farm_id, farm_crop_id FROM surveys WHERE id = 'local_survey_old'").all()[0];
    expect(row).toEqual({ id: 'local_survey_old', status: 'completed', farm_id: null, farm_crop_id: null });
  });
});

// ═══ Esquema Drizzle ═════════════════════════════════════════════════════════

describe('schema.ts — C15: el esquema de Drizzle refleja m0015', () => {
  const colName = (c: unknown) => (c as { name?: string } | undefined)?.name;
  const s = schema as unknown as Record<string, Record<string, unknown>>;

  it('surveys.farmId → farm_id y surveys.farmCropId → farm_crop_id', () => {
    expect(colName(s.surveys.farmId)).toBe('farm_id');
    expect(colName(s.surveys.farmCropId)).toBe('farm_crop_id');
  });

  it('consentRecords: sessionId opcional, farmerId y surveyId', () => {
    expect((s.consentRecords.sessionId as { notNull: boolean }).notNull).toBe(false);
    expect(colName(s.consentRecords.farmerId)).toBe('farmer_id');
    expect(colName(s.consentRecords.surveyId)).toBe('survey_id');
  });

  it('exporta coverageSnapshot y farmerCoverageCache', () => {
    expect(s.coverageSnapshot).toBeDefined();
    expect(s.farmerCoverageCache).toBeDefined();
    expect(colName(s.farmerCoverageCache.farmerId)).toBe('farmer_id');
    expect(colName(s.farmerCoverageCache.hasPendingConsent)).toBe('has_pending_consent');
  });
});
