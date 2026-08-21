-- Trạm Chữ — Migration 0002: User Reading Progress & Bookmarks
--
-- Stores reader bookmarks and reading progress in a compact, index-backed table.
-- Average record size is ~80 bytes, keeping 1,000 users well within 2 MB (<0.4% of 500 MB quota).

create table if not exists user_bookmarks (
  user_id         uuid        not null references auth.users (id) on delete cascade,
  book_id         text        not null references books (id) on delete cascade,
  chapter_index   integer     not null default 0,
  chapter_title   text        not null default '',
  progress_pct    integer     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, book_id)
);

create index if not exists user_bookmarks_user_idx on user_bookmarks (user_id, updated_at desc);

-- --------------------------------------------------------------------- RLS
alter table user_bookmarks enable row level security;

drop policy if exists user_bookmarks_select on user_bookmarks;
create policy user_bookmarks_select on user_bookmarks for select
  using (auth.uid() = user_id);

drop policy if exists user_bookmarks_insert on user_bookmarks;
create policy user_bookmarks_insert on user_bookmarks for insert
  with check (auth.uid() = user_id);

drop policy if exists user_bookmarks_update on user_bookmarks;
create policy user_bookmarks_update on user_bookmarks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_bookmarks_delete on user_bookmarks;
create policy user_bookmarks_delete on user_bookmarks for delete
  using (auth.uid() = user_id);
