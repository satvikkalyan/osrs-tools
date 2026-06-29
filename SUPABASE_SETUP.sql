-- OSRS Flip Finder — Supabase setup for global view + flip tracking
-- Run this entire block in your Supabase project's SQL Editor (supabase.com → project → SQL Editor)
-- If you already ran a previous version, the ALTER TABLE line below will add the flip_count column.

-- 1. Table to store per-item view + flip counts
create table if not exists item_views (
    item_id     integer primary key,
    name        text    not null,
    icon        text    default '',
    view_count  integer not null default 0,
    flip_count  integer not null default 0
);

-- Add flip_count column if this table already exists from a previous setup
alter table item_views add column if not exists flip_count integer not null default 0;

-- 2. Atomic view upsert — called every time a user opens an item chart
create or replace function increment_view(p_item_id integer, p_name text, p_icon text)
returns void
language sql
security definer
as $$
    insert into item_views (item_id, name, icon, view_count, flip_count)
    values (p_item_id, p_name, p_icon, 1, 0)
    on conflict (item_id) do update
        set view_count = item_views.view_count + 1,
            name       = excluded.name,
            icon       = excluded.icon;
$$;

-- 3. Atomic flip upsert — called when user clicks "Placed order" in the chart modal
create or replace function increment_flip(p_item_id integer, p_name text, p_icon text)
returns void
language sql
security definer
as $$
    insert into item_views (item_id, name, icon, view_count, flip_count)
    values (p_item_id, p_name, p_icon, 0, 1)
    on conflict (item_id) do update
        set flip_count = item_views.flip_count + 1,
            name       = excluded.name,
            icon       = excluded.icon;
$$;

-- 4. Row-level security: anonymous users can READ
alter table item_views enable row level security;

drop policy if exists "public_read" on item_views;
create policy "public_read"
    on item_views
    for select
    to anon
    using (true);

-- 5. Grant execute on both functions to anonymous users
grant execute on function increment_view(integer, text, text) to anon;
grant execute on function increment_flip(integer, text, text) to anon;

-- Done! Trending sidebar now sorts by flip/view ratio (items you actually traded rank first).
