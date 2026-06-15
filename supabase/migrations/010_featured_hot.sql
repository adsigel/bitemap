-- Add featured flag for manually curated sandwiches
ALTER TABLE sandwiches ADD COLUMN featured boolean NOT NULL DEFAULT false;

-- Recreate view to pick up featured (s.* expands at view-creation time, not query time)
DROP VIEW IF EXISTS sandwiches_with_count;
CREATE VIEW sandwiches_with_count AS
  SELECT
    s.*,
    count(b.id)::int as bite_count
  FROM sandwiches s
  LEFT JOIN bites b ON b.sandwich_id = s.id
  GROUP BY s.id;
GRANT SELECT ON sandwiches_with_count TO anon, authenticated;

-- Hot sandwiches: top 20% of 24h bite velocity, minimum floor of 5 bites.
-- The percentile threshold rises automatically as overall traffic grows,
-- so "hot" always means relatively trending, not just absolutely busy.
CREATE OR REPLACE VIEW hot_sandwiches AS
  WITH velocities AS (
    SELECT sandwich_id, COUNT(*) AS bites_24h
    FROM bites
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY sandwich_id
  ),
  threshold AS (
    SELECT GREATEST(
      PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY bites_24h),
      5
    ) AS min_bites
    FROM velocities
  )
  SELECT v.sandwich_id
  FROM velocities v, threshold t
  WHERE v.bites_24h >= t.min_bites;

GRANT SELECT ON hot_sandwiches TO anon, authenticated;
