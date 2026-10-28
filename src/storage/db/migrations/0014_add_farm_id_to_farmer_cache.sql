-- Spec 96 — finca del productor en la caché de identidad (nullable, sin backfill).
ALTER TABLE `farmer_cache` ADD COLUMN `farm_id` text;
