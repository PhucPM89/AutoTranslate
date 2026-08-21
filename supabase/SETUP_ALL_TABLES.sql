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

drop policy if exists reader_leaderboard_select on reader_leaderboard;
create policy reader_leaderboard_select on reader_leaderboard for select using (true);

drop policy if exists reader_leaderboard_insert on reader_leaderboard;
create policy reader_leaderboard_insert on reader_leaderboard for insert with check (true);

drop policy if exists reader_leaderboard_update on reader_leaderboard;
create policy reader_leaderboard_update on reader_leaderboard for update using (true) with check (true);

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

alter table paragraph_comments enable row level security;

drop policy if exists paragraph_comments_select on paragraph_comments;
create policy paragraph_comments_select on paragraph_comments for select using (true);

drop policy if exists paragraph_comments_insert on paragraph_comments;
create policy paragraph_comments_insert on paragraph_comments for insert
  with check (char_length(content) between 1 and 280);

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

drop policy if exists glossary_suggestions_select on glossary_suggestions;
create policy glossary_suggestions_select on glossary_suggestions for select using (true);

drop policy if exists glossary_suggestions_insert on glossary_suggestions;
create policy glossary_suggestions_insert on glossary_suggestions for insert
  with check (char_length(source_term) >= 1 and char_length(suggested_term) >= 1);

-- 5. Bảng Thống kê sự kiện (analytics_events)
create table if not exists analytics_events (
  id              bigserial   primary key,
  event_type      text        not null,
  book_id         text,
  session_id      text,
  created_at      timestamptz not null default now()
);

alter table analytics_events enable row level security;

drop policy if exists analytics_events_insert on analytics_events;
create policy analytics_events_insert on analytics_events for insert with check (true);
