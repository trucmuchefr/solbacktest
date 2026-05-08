create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  wallets text[] not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'error')),
  result jsonb,
  created_at timestamptz default now()
);

alter table analyses enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on table public.analyses to anon, authenticated;
grant select, insert, update on table public.analyses to service_role;

drop policy if exists "Anyone can create an analysis" on analyses;
drop policy if exists "Anyone can read analyses" on analyses;

create policy "Anyone can create an analysis"
on public.analyses
for insert
to anon, authenticated
with check (true);

create policy "Anyone can read analyses"
on public.analyses
for select
to anon, authenticated
using (true);

create index if not exists analyses_status_created_at_idx
on analyses (status, created_at);
