-- Add approval state to sandwiches.
-- Admin-seeded sandwiches (uploaded_by IS NULL) default to approved.
-- User-submitted sandwiches start pending.

alter table sandwiches add column approved boolean not null default false;

-- Approve all existing admin-seeded sandwiches
update sandwiches set approved = true where uploaded_by is null;

-- Refresh the view to filter out unapproved sandwiches
drop view sandwiches_with_count;
create view sandwiches_with_count as
  select
    s.*,
    count(b.id)::int as bite_count
  from sandwiches s
  left join bites b on b.sandwich_id = s.id
  where s.approved = true
  group by s.id;
