-- Snapshot each bite's uniqueness percentile (vs that sandwich's other
-- bites) at placement time, so a user's Bitemark reflects what the crowd
-- looked like when they bit -- not a value that drifts every time someone
-- else bites the same sandwich later.
alter table bites add column uniqueness_percentile int;
