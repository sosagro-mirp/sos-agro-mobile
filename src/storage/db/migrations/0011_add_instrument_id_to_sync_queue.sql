-- Spec 70, Fase 10 — instrumentId para las entradas 'skip-step' de sync_queue.
-- El enum de itemType ('survey' | 'farm-plot' | 'skip-step') es solo TypeScript;
-- la columna ya era `text` sin CHECK en SQLite.
ALTER TABLE `sync_queue` ADD COLUMN `instrument_id` text;
