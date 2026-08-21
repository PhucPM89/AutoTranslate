-- Trạm Chữ — Migration 0004: Drop Foreign Key on user_bookmarks(book_id)
-- Allows reader progress and bookmarks for CDN-stored Fanqie novels and custom uploads.

alter table if exists user_bookmarks
  drop constraint if exists user_bookmarks_book_id_fkey;
