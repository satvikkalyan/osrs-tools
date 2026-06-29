-- OSRS Flip Finder — Supabase setup for global view tracking
-- Run this entire block in your Supabase project's SQL Editor (supabase.com → project → SQL Editor)

-- 1. Table to store per-item view counts
create table if not exists item_views (
    item_id     integer primary key,
    name        text    not null,
    icon        text    default '',
    view_count  integer not null default 0
);

-- 2. Atomic upsert function — safe under concurrent writes
--    Called by the app every time a user opens an item chart.
create or replace function increment_view(p_item_id integer, p_name text, p_icon text)
returns void
language sql
security definer   -- runs with table-owner rights, bypasses RLS for writes
as $$
    insert into item_views (item_id, name, icon, view_count)
    values (p_item_id, p_name, p_icon, 1)
    on conflict (item_id) do update
        set view_count = item_views.view_count + 1,
            name       = excluded.name,
            icon       = excluded.icon;
$$;

-- 3. Row-level security: allow anonymous users to READ the table
--    (they call increment_view to write, which runs as security definer)
alter table item_views enable row level security;

create policy "public_read"
    on item_views
    for select
    to anon
    using (true);

-- 4. Grant execute on the function to anonymous (unauthenticated) users
grant execute on function increment_view(integer, text, text) to anon;

-- Done! Now go to Settings → API in your Supabase project and copy:
--   • Project URL  → paste as SUPABASE_URL in js/constants.js
--   • anon / public key → paste as SUPABASE_ANON_KEY in js/constants.js
