-- Creator feedback messages from the public /support page (insert via service role API only).

create table if not exists creator_feedback (
  id          bigint generated always as identity primary key,
  name        text,
  email       text,
  message     text not null check (char_length(trim(message)) >= 10),
  created_at  timestamptz not null default now()
);

create index if not exists creator_feedback_created_at_idx
  on creator_feedback (created_at desc);

alter table creator_feedback enable row level security;

-- No public policies: reads/writes go through server API with service role.
