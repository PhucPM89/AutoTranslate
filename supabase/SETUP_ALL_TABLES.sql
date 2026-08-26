-- =====================================================================
-- Trạm Chữ — Script Khởi tạo và Cập nhật Database Supabase Toàn diện
-- Chạy toàn bộ script này trong: Supabase Dashboard > SQL Editor > Run
-- =====================================================================

-- 1. Bỏ ràng buộc khóa ngoại cho bảng user_bookmarks (hỗ trợ truyện CDN)
alter table if exists user_bookmarks
  drop constraint if exists user_bookmarks_book_id_fkey;

-- 2. Bảng Xếp Hạng Độc Giả / Cảnh Giới Tu Vi (reader_leaderboard)
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

alter table reader_leaderboard enable row level security;

-- Reading the leaderboard is public
drop policy if exists reader_leaderboard_select on reader_leaderboard;
create policy reader_leaderboard_select on reader_leaderboard for select using (true);

-- Readers may create or update only their own authenticated profile row
drop policy if exists reader_leaderboard_insert on reader_leaderboard;
create policy reader_leaderboard_insert on reader_leaderboard for insert
  to authenticated
  with check ((select auth.uid())::text = id);

drop policy if exists reader_leaderboard_update on reader_leaderboard;
create policy reader_leaderboard_update on reader_leaderboard for update
  to authenticated
  using ((select auth.uid())::text = id)
  with check ((select auth.uid())::text = id);

alter table reader_leaderboard
  drop constraint if exists reader_leaderboard_display_name_length,
  add constraint reader_leaderboard_display_name_length check (char_length(display_name) between 1 and 60) not valid,
  drop constraint if exists reader_leaderboard_school_value,
  add constraint reader_leaderboard_school_value check (school in ('cultivation', 'scholarly', 'modern')) not valid,
  drop constraint if exists reader_leaderboard_exp_range,
  add constraint reader_leaderboard_exp_range check (exp between 0 and 1000000000) not valid,
  drop constraint if exists reader_leaderboard_chapters_range,
  add constraint reader_leaderboard_chapters_range check (chapters_read between 0 and 10000000) not valid,
  drop constraint if exists reader_leaderboard_badge_value,
  add constraint reader_leaderboard_badge_value check (badge_class ~ '^rank-([1-9]|10)$') not valid,
  drop constraint if exists reader_leaderboard_avatar_url,
  add constraint reader_leaderboard_avatar_url check (
    avatar_url is null or (char_length(avatar_url) <= 1000 and avatar_url ~ '^https://')
  ) not valid;

-- 3. Bảng Bình luận theo từng đoạn văn (paragraph_comments)
create table if not exists paragraph_comments (
  id              bigserial   primary key,
  book_id         text        not null,
  chapter_index   integer     not null default 0,
  paragraph_index integer     not null default 0,
  author_name     text        not null default 'Độc giả',
  content         text        not null check (char_length(content) between 1 and 280),
  likes_count     integer     not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_comments_chapter on paragraph_comments (book_id, chapter_index, paragraph_index);
create index if not exists idx_comments_created on paragraph_comments (created_at desc);
create index if not exists idx_comments_chapter_created on paragraph_comments (book_id, chapter_index, created_at asc);

alter table paragraph_comments enable row level security;

drop policy if exists paragraph_comments_select on paragraph_comments;
create policy paragraph_comments_select on paragraph_comments for select using (true);

drop policy if exists paragraph_comments_insert on paragraph_comments;
create policy paragraph_comments_insert on paragraph_comments for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and char_length(content) between 1 and 280
    and char_length(author_name) between 1 and 60
    and chapter_index between 0 and 100000
    and paragraph_index between 0 and 100000
  );

alter table paragraph_comments
  drop constraint if exists paragraph_comments_book_id_length,
  add constraint paragraph_comments_book_id_length check (char_length(book_id) between 1 and 100) not valid,
  drop constraint if exists paragraph_comments_author_length,
  add constraint paragraph_comments_author_length check (char_length(author_name) between 1 and 60) not valid,
  drop constraint if exists paragraph_comments_index_range,
  add constraint paragraph_comments_index_range check (
    chapter_index between 0 and 100000 and paragraph_index between 0 and 100000
  ) not valid;

-- 4. Bảng Gợi ý thuật ngữ / Báo lỗi dịch (glossary_suggestions)
create table if not exists glossary_suggestions (
  id              bigserial   primary key,
  book_id         text        not null,
  source_term     text        not null,
  suggested_term  text        not null,
  context_snippet text        default '',
  note            text        default '',
  status          text        not null default 'pending',
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz
);

create index if not exists idx_glossary_book_status on glossary_suggestions (book_id, status);

alter table glossary_suggestions enable row level security;

-- Suggestions are reviewed by admin/service role only
drop policy if exists glossary_suggestions_select on glossary_suggestions;
drop policy if exists glossary_suggestions_insert on glossary_suggestions;
create policy glossary_suggestions_insert on glossary_suggestions for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and char_length(source_term) between 1 and 120
    and char_length(suggested_term) between 1 and 120
    and char_length(coalesce(context_snippet, '')) <= 500
    and char_length(coalesce(note, '')) <= 1000
    and status = 'pending'
  );

alter table glossary_suggestions
  drop constraint if exists glossary_suggestions_lengths,
  add constraint glossary_suggestions_lengths check (
    char_length(book_id) between 1 and 100
    and char_length(source_term) between 1 and 120
    and char_length(suggested_term) between 1 and 120
    and char_length(coalesce(context_snippet, '')) <= 500
    and char_length(coalesce(note, '')) <= 1000
  ) not valid,
  drop constraint if exists glossary_suggestions_status_value,
  add constraint glossary_suggestions_status_value check (status in ('pending', 'approved', 'rejected')) not valid;

-- 5. Bảng Thống kê sự kiện (analytics_events)
create table if not exists analytics_events (
  id              bigserial   primary key,
  event_type      text        not null,
  book_id         text,
  chapter_number  integer,
  session_id      text,
  created_at      timestamptz not null default now(),
  constraint analytics_event_type_check check (event_type in ('visit', 'read'))
);

create index if not exists analytics_created_idx on analytics_events (created_at desc);
create index if not exists analytics_book_idx    on analytics_events (book_id, created_at desc);

alter table analytics_events enable row level security;

drop policy if exists analytics_events_insert on analytics_events;
drop policy if exists analytics_anon_insert on analytics_events;
create policy analytics_anon_insert on analytics_events for insert with check (true);

alter table analytics_events
  drop constraint if exists analytics_book_id_length,
  add constraint analytics_book_id_length check (book_id is null or char_length(book_id) <= 100) not valid,
  drop constraint if exists analytics_session_id_length,
  add constraint analytics_session_id_length check (session_id is null or char_length(session_id) <= 100) not valid,
  drop constraint if exists analytics_chapter_range,
  add constraint analytics_chapter_range check (chapter_number is null or chapter_number between 0 and 100000) not valid;

-- 6. Views thống kê nội bộ cho Admin Dashboard
create or replace view analytics_daily as
select
  date_trunc('day', created_at)::date            as day,
  count(*) filter (where event_type = 'visit')   as visits,
  count(*) filter (where event_type = 'read')    as reads,
  count(distinct session_id)                     as sessions
from analytics_events
group by 1
order by 1 desc;

revoke all on analytics_daily from anon, authenticated;
grant select on analytics_daily to service_role;

create or replace view user_bookmark_counts as
select user_id, count(*)::bigint as bookmark_count
from user_bookmarks
group by user_id;

revoke all on user_bookmark_counts from anon, authenticated;
grant select on user_bookmark_counts to service_role;

create or replace view analytics_book_totals as
select book_id, count(*)::bigint as reads
from analytics_events
where event_type = 'read' and book_id is not null
group by book_id;

revoke all on analytics_book_totals from anon, authenticated;
grant select on analytics_book_totals to service_role;
