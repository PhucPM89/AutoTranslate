-- Restrict community writes to authenticated readers and add bounded input
-- constraints. These checks are deliberately NOT VALID so deployment is not
-- blocked by historical rows; PostgreSQL still enforces them for new writes.

-- A reader may create/update only the leaderboard row whose id is their auth uid.
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
  add constraint reader_leaderboard_display_name_length check (char_length(display_name) between 1 and 60) not valid,
  add constraint reader_leaderboard_school_value check (school in ('cultivation', 'scholarly', 'modern')) not valid,
  add constraint reader_leaderboard_exp_range check (exp between 0 and 1000000000) not valid,
  add constraint reader_leaderboard_chapters_range check (chapters_read between 0 and 10000000) not valid,
  add constraint reader_leaderboard_badge_value check (badge_class ~ '^rank-([1-9]|10)$') not valid,
  add constraint reader_leaderboard_avatar_url check (
    avatar_url is null or (char_length(avatar_url) <= 1000 and avatar_url ~ '^https://')
  ) not valid;

-- Reading comments remains public; posting requires a real Supabase session.
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
  add constraint paragraph_comments_book_id_length check (char_length(book_id) between 1 and 100) not valid,
  add constraint paragraph_comments_author_length check (char_length(author_name) between 1 and 60) not valid,
  add constraint paragraph_comments_index_range check (
    chapter_index between 0 and 100000 and paragraph_index between 0 and 100000
  ) not valid;

create index if not exists idx_comments_chapter_created
  on paragraph_comments (book_id, chapter_index, created_at asc);

-- Suggestions are write-only for readers; only the service role/admin reviews them.
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
  add constraint glossary_suggestions_lengths check (
    char_length(book_id) between 1 and 100
    and char_length(source_term) between 1 and 120
    and char_length(suggested_term) between 1 and 120
    and char_length(coalesce(context_snippet, '')) <= 500
    and char_length(coalesce(note, '')) <= 1000
  ) not valid,
  add constraint glossary_suggestions_status_value check (status in ('pending', 'approved', 'rejected')) not valid;

-- Bound public analytics and progress payloads to prevent oversized rows.
alter table analytics_events
  add constraint analytics_book_id_length check (book_id is null or char_length(book_id) <= 100) not valid,
  add constraint analytics_session_id_length check (session_id is null or char_length(session_id) <= 100) not valid,
  add constraint analytics_chapter_range check (chapter_number is null or chapter_number between 0 and 100000) not valid;

alter table user_bookmarks
  add constraint user_bookmarks_book_id_length check (char_length(book_id) between 1 and 100) not valid,
  add constraint user_bookmarks_chapter_range check (chapter_index between 0 and 100000) not valid,
  add constraint user_bookmarks_progress_range check (progress_pct between 0 and 100) not valid,
  add constraint user_bookmarks_title_length check (char_length(chapter_title) <= 300) not valid;

-- The aggregate dashboard is admin-only. The service role remains able to read it.
revoke all on analytics_daily from anon, authenticated;
grant select on analytics_daily to service_role;

-- Admin user statistics need counts, not every bookmark row. This view keeps
-- the Worker response proportional to users instead of total bookmarks.
create or replace view user_bookmark_counts as
select user_id, count(*)::bigint as bookmark_count
from user_bookmarks
group by user_id;

revoke all on user_bookmark_counts from anon, authenticated;
grant select on user_bookmark_counts to service_role;

-- Top-book analytics used to download an arbitrary 2,000 raw events and count
-- them in JavaScript, which was both inaccurate and payload-heavy.
create or replace view analytics_book_totals as
select book_id, count(*)::bigint as reads
from analytics_events
where event_type = 'read' and book_id is not null
group by book_id;

revoke all on analytics_book_totals from anon, authenticated;
grant select on analytics_book_totals to service_role;
