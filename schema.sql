create table trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  destination text not null,
  preferences jsonb, itinerary jsonb,
  share_token text unique,
  created_at timestamptz default now()
);
alter table trips enable row level security;
create policy "owner full access" on trips for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public read via token" on trips for select using (share_token is not null);
