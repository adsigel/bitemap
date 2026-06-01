ALTER TABLE sandwiches ADD COLUMN slug text;

UPDATE sandwiches
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(TRIM(title), '[^a-zA-Z0-9\s\-]', '', 'g'),
    '[\s\-]+', '-', 'g'
  )
) || '-' || SUBSTRING(REPLACE(id::text, '-', ''), 1, 8);

ALTER TABLE sandwiches ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX sandwiches_slug_idx ON sandwiches(slug);
