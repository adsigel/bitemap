-- Recreate view so it picks up scheduled_for and first_featured_date added
-- in 017. PostgreSQL expands SELECT * at view creation time; new columns
-- require drop + recreate. Additive/safe: just exposes more columns
-- through the view, doesn't change any existing column's behavior.
DROP VIEW IF EXISTS sandwiches_with_count;

CREATE VIEW sandwiches_with_count AS
  SELECT
    s.*,
    count(b.id)::int as bite_count
  FROM sandwiches s
  LEFT JOIN bites b ON b.sandwich_id = s.id
  GROUP BY s.id;

GRANT SELECT ON sandwiches_with_count TO anon, authenticated;
