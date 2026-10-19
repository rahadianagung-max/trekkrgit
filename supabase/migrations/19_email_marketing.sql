-- Email marketing (superadmin Email tab). Additive; server-only (service key).
create table if not exists email_templates (
  seg text primary key,                 -- A | B | C | D
  fields jsonb not null default '{}'::jsonb,
  brevo_campaign_id bigint,
  updated_at timestamptz not null default now(),
  updated_by text
);
create table if not exists email_optins (
  email text primary key,               -- lowercased
  seg text,
  source text,
  opted_in_at timestamptz not null default now()
);
alter table email_templates enable row level security;
alter table email_optins enable row level security;
