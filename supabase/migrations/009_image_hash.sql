ALTER TABLE sandwiches ADD COLUMN image_hash text;

-- Partial unique index: only enforces uniqueness on rows that have a hash,
-- so existing sandwiches without one don't conflict.
CREATE UNIQUE INDEX sandwiches_image_hash_unique
  ON sandwiches (image_hash)
  WHERE image_hash IS NOT NULL;
