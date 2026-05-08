create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  wallets text[] not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'error')),
  result jsonb,
  created_at timestamptz default now()
);

alter table analyses enable row level security;

create policy "Anyone can create an analysis"
on analyses
for insert
to anon
with check (true);

create policy "Anyone can read analyses"
on analyses
for select
to anon
using (true);

create index if not exists analyses_status_created_at_idx
on analyses (status, created_at);
