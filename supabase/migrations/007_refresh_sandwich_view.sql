-- Recreate view so it picks up columns added since original creation
-- (slug, bite_bounds). PostgreSQL expands SELECT * at view creation time,
-- so new table columns require a full drop + recreate.
DROP VIEW IF EXISTS sandwiches_with_count;

CREATE VIEW sandwiches_with_count AS
  SELECT
    s.*,
    count(b.id)::int as bite_count
  FROM sandwiches s
  LEFT JOIN bites b ON b.sandwich_id = s.id
  GROUP BY s.id;

GRANT SELECT ON sandwiches_with_count TO anon, authenticated;
