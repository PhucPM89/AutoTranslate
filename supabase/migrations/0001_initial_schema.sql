-- Trạm Chữ — initial schema
--
-- Scope on purpose: this database holds metadata and events only. Chapter text
-- never lives here; it is served from R2 through the CDN. That keeps the reader
-- hot path off the database entirely.
--
-- No `users` table: readers stay anonymous and bookmarks/history remain in the
-- browser's IndexedDB, which is the existing behaviour and needs no migration.

create extension if not exists "pgcrypto";
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- categories
create table if not exists categories (
  id          bigserial primary key,
  slug        text        not null unique,
  name        text        not null,
  -- Fanqie's own category id, so the crawler can map without a lookup table.
  source_id   integer,
  created_at  timestamptz not null default now()
);

-- --------------------------------------------------------------------- books
create table if not exists books (
  id                text        primary key,          -- e.g. fanqie-7143038691944959011
  title             text        not null,
  author            text        not null default '',
  description       text        not null default '',
  cover_url         text        not null default '',
  status            text        not null default 'Đang cập nhật',
  total_chapters    integer     not null default 0,
  translated_chapters integer   not null default 0,
  -- Chapter objects live under books/{id}/r{revision}/, so the reader needs this
  -- to build a URL and a re-ingest can publish to fresh immutable keys.
  revision          integer     not null default 1,
  source            text        not null default 'admin',   -- admin | fanqie
  source_id         text,
  source_url        text,
  featured          boolean     not null default false,
  published         boolean     not null default true,
  last_crawled_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint books_source_unique unique (source, source_id)
);

-- Search hits title and author together, so one trigram index covers both.
create index if not exists books_search_idx
  on books using gin ((title || ' ' || author) gin_trgm_ops);
create index if not exists books_status_idx     on books (status)     where published;
create index if not exists books_featured_idx   on books (featured)   where published;
create index if not exists books_updated_idx    on books (updated_at desc);
create index if not exists books_created_idx    on books (created_at desc);

-- ------------------------------------------------------------ book_categories
create table if not exists book_categories (
  book_id     text   not null references books (id) on delete cascade,
  category_id bigint not null references categories (id) on delete cascade,
  primary key (book_id, category_id)
);
create index if not exists book_categories_category_idx on book_categories (category_id);

-- ------------------------------------------------------------------ chapters
-- Metadata only: `content` is deliberately absent. The reader never queries this
-- table; it exists for the table of contents fallback, for admin views and for
-- the ingest pipeline to know what still needs translating.
create table if not exists chapters (
  id                 bigserial   primary key,
  book_id            text        not null references books (id) on delete cascade,
  chapter_number     integer     not null,
  title              text        not null default '',
  revision           integer     not null default 1,
  original_url       text        not null default '',
  translated_url     text        not null default '',
  translation_status text        not null default 'pending',
  characters         integer     not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint chapters_status_check
    check (translation_status in ('pending', 'processing', 'completed', 'failed', 'retrying')),
  -- Makes re-ingest idempotent: upsert on this key instead of inserting twice.
  constraint chapters_unique unique (book_id, revision, chapter_number)
);
create index if not exists chapters_book_idx   on chapters (book_id, chapter_number);
create index if not exists chapters_status_idx on chapters (translation_status)
  where translation_status <> 'completed';

-- ----------------------------------------------------------- analytics_events
-- INSERT-only. Replaces the read-modify-write on a single JSON file, which lost
-- counts under concurrency. Nothing here identifies a person: the session id is a
-- random value the browser keeps for one session and no IP or user agent is kept.
create table if not exists analytics_events (
  id           bigserial   primary key,
  event_type   text        not null,
  book_id      text,
  chapter_number integer,
  session_id   text,
  created_at   timestamptz not null default now(),
  constraint analytics_event_type_check check (event_type in ('visit', 'read'))
);
create index if not exists analytics_created_idx on analytics_events (created_at desc);
create index if not exists analytics_book_idx    on analytics_events (book_id, created_at desc);

-- Dashboards read this instead of scanning raw rows.
create or replace view analytics_daily as
select
  date_trunc('day', created_at)::date            as day,
  count(*) filter (where event_type = 'visit')   as visits,
  count(*) filter (where event_type = 'read')    as reads,
  count(distinct session_id)                     as sessions
from analytics_events
group by 1
order by 1 desc;

-- --------------------------------------------------------------- updated_at
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists books_touch on books;
create trigger books_touch before update on books
  for each row execute function touch_updated_at();

drop trigger if exists chapters_touch on chapters;
create trigger chapters_touch before update on chapters
  for each row execute function touch_updated_at();

-- --------------------------------------------------------------------- RLS
-- The browser only ever uses the anon key. It may read published catalogue rows
-- and insert analytics events; everything else requires the service role, which
-- stays server-side only.
alter table books            enable row level security;
alter table chapters         enable row level security;
alter table categories       enable row level security;
alter table book_categories  enable row level security;
alter table analytics_events enable row level security;

drop policy if exists books_public_read on books;
create policy books_public_read on books for select using (published);

drop policy if exists chapters_public_read on chapters;
create policy chapters_public_read on chapters for select
  using (exists (select 1 from books b where b.id = chapters.book_id and b.published));

drop policy if exists categories_public_read on categories;
create policy categories_public_read on categories for select using (true);

drop policy if exists book_categories_public_read on book_categories;
create policy book_categories_public_read on book_categories for select using (true);

-- Insert-only for anonymous clients: no select, no update, no delete.
drop policy if exists analytics_anon_insert on analytics_events;
create policy analytics_anon_insert on analytics_events for insert with check (true);
