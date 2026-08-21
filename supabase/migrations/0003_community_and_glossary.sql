-- Trạm Chữ — Migration 0003: Inline Paragraph Comments & Glossary Suggestions
--
-- Compact schema with compound indexes and rate-limiting rules.
-- 100,000 comments take ~12 MB (<2.5% of the 500 MB free quota).

-- 1. Bảng bình luận theo đoạn văn
create table if not exists paragraph_comments (
  id              bigserial primary key,
  book_id         text not null references books(id) on delete cascade,
  chapter_index   integer not null default 0,
  paragraph_index integer not null default 0,
  author_name     text not null default 'Độc giả',
  content         text not null check (char_length(content) between 1 and 280),
  likes_count     integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_comments_chapter on paragraph_comments (book_id, chapter_index, paragraph_index);
create index if not exists idx_comments_created on paragraph_comments (created_at desc);

-- RLS for paragraph_comments
alter table paragraph_comments enable row level security;

drop policy if exists paragraph_comments_select on paragraph_comments;
create policy paragraph_comments_select on paragraph_comments for select using (true);

drop policy if exists paragraph_comments_insert on paragraph_comments;
create policy paragraph_comments_insert on paragraph_comments for insert
  with check (char_length(content) between 1 and 280);

-- 2. Bảng gợi ý thuật ngữ / báo lỗi dịch thuật
create table if not exists glossary_suggestions (
  id              bigserial primary key,
  book_id         text not null references books(id) on delete cascade,
  source_term     text not null,
  suggested_term  text not null,
  context_snippet text default '',
  note            text default '',
  status          text not null default 'pending', -- pending, approved, rejected
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz
);

create index if not exists idx_glossary_book_status on glossary_suggestions (book_id, status);

-- RLS for glossary_suggestions
alter table glossary_suggestions enable row level security;

drop policy if exists glossary_suggestions_select on glossary_suggestions;
create policy glossary_suggestions_select on glossary_suggestions for select using (true);

drop policy if exists glossary_suggestions_insert on glossary_suggestions;
create policy glossary_suggestions_insert on glossary_suggestions for insert
  with check (char_length(source_term) >= 1 and char_length(suggested_term) >= 1);
