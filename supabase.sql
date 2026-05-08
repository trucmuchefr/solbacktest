create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) default auth.uid(),
  name text not null,
  wallets text[] not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'error')),
  result jsonb,
  created_at timestamptz default now()
);

alter table public.analyses
add column if not exists user_id uuid references auth.users(id) default auth.uid();

alter table public.analyses enable row level security;

grant usage on schema public to authenticated;
grant select, insert on table public.analyses to authenticated;
grant select, insert, update on table public.analyses to service_role;

drop policy if exists "Anyone can create an analysis" on public.analyses;
drop policy if exists "Anyone can read analyses" on public.analyses;
drop policy if exists "Users can create their analyses" on public.analyses;
drop policy if exists "Users can read their analyses" on public.analyses;

create policy "Users can create their analyses"
on public.analyses
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can read their analyses"
on public.analyses
for select
to authenticated
using (auth.uid() = user_id);

create index if not exists analyses_status_created_at_idx
on public.analyses (status, created_at);

create index if not exists analyses_user_created_at_idx
on public.analyses (user_id, created_at desc);
