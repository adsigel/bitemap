-- Creator content fields on sandwiches
alter table sandwiches add column creator_note text;
alter table sandwiches add column creator_url  text;

-- Per-user feature flag: controls access to creator_note / creator_url editing
alter table profiles add column creator_features boolean not null default false;

-- To enable for a user: update profiles set creator_features = true where id = '<user-id>';
