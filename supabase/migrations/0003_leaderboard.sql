-- Trạm Chữ — Migration 0003: Reader Leaderboard & Gamification
--
-- Compact table storing reader cultivation progress, EXP, school, and titles.
-- Indexed on exp desc for instant top-20 querying.

create table if not exists reader_leaderboard (
  id              text        primary key,
  display_name    text        not null default 'Ẩn danh đạo hữu',
  school          text        not null default 'cultivation',
  exp             bigint      not null default 0,
  chapters_read   integer     not null default 0,
  level_title     text        not null default 'Phàm Nhân',
  badge_class     text        not null default 'rank-1',
  avatar_url      text,
  updated_at      timestamptz not null default now()
);

create index if not exists reader_leaderboard_exp_idx on reader_leaderboard (exp desc, updated_at desc);
create index if not exists reader_leaderboard_school_idx on reader_leaderboard (school, exp desc);

-- --------------------------------------------------------------------- RLS
alter table reader_leaderboard enable row level security;

-- Everyone can read the leaderboard
drop policy if exists reader_leaderboard_select on reader_leaderboard;
create policy reader_leaderboard_select on reader_leaderboard for select
  using (true);

-- Readers can insert or update their own row
drop policy if exists reader_leaderboard_insert on reader_leaderboard;
create policy reader_leaderboard_insert on reader_leaderboard for insert
  with check (true);

drop policy if exists reader_leaderboard_update on reader_leaderboard;
create policy reader_leaderboard_update on reader_leaderboard for update
  using (true)
  with check (true);
