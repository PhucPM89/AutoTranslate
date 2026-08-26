"use strict";

// User bookmarking and reading progress synchronization.
//
// Keeps bookmarks in localStorage for fast local reads and offline use, and
// syncs to Supabase `user_bookmarks` via REST when the reader is signed in.
// All operations are debounced and fail-safe: network errors never block reading.

const LOCAL_KEY = "tramChu.userBookmarks";
const SYNC_DEBOUNCE_MS = 2000;

function readLocalBookmarks(storage) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(LOCAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalBookmarks(storage, data) {
  if (!storage) return;
  try {
    storage.setItem(LOCAL_KEY, JSON.stringify(data || {}));
  } catch {
    // Quota or private browsing.
  }
}

function cleanId(id) {
  return String(id || "").replace(/^(cdn|library):/, "").split(":")[0];
}

function mergeBookmarks(local = {}, remote = []) {
  const merged = {};
  for (const [key, item] of Object.entries(local || {})) {
    if (!item) continue;
    const cid = cleanId(item.bookId || key);
    if (!cid) continue;
    merged[cid] = {
      ...item,
      bookId: cid
    };
  }
  for (const item of remote || []) {
    if (!item || !item.book_id) continue;
    const bookId = cleanId(item.book_id);
    if (!bookId) continue;
    const existing = merged[bookId];
    const remoteTime = new Date(item.updated_at || 0).getTime();
    const localTime = existing ? new Date(existing.updatedAt || 0).getTime() : 0;

    if (!existing || remoteTime >= localTime) {
      merged[bookId] = {
        bookId,
        chapterIndex: Number(item.chapter_index) || 0,
        chapterTitle: String(item.chapter_title || ""),
        progressPct: Number(item.progress_pct) || 0,
        updatedAt: item.updated_at || new Date().toISOString()
      };
    }
  }
  return merged;
}

function createUserSync({ url, anonKey, authClient, storage, fetchImpl = fetch, syncDebounceMs = SYNC_DEBOUNCE_MS }) {
  const base = String(url || "").replace(/\/$/, "");
  let bookmarks = mergeBookmarks(readLocalBookmarks(storage), []);
  const listeners = new Set();
  const pendingSync = new Map();
  let syncTimer = null;

  function emit() {
    for (const listener of listeners) {
      try {
        listener(bookmarks);
      } catch (err) {
        console.warn("Bookmark listener error:", err);
      }
    }
  }

  function getSessionToken() {
    const session = authClient?.getSession();
    return session?.accessToken || null;
  }

  function getUserId() {
    const session = authClient?.getSession();
    return session?.user?.id || null;
  }

  async function fetchRemote() {
    const token = getSessionToken();
    if (!token || !base || !anonKey) return [];
    try {
      const res = await fetchImpl(
        `${base}/rest/v1/user_bookmarks?select=book_id,chapter_index,chapter_title,progress_pct,updated_at`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`
          }
        }
      );
      if (!res.ok) return [];
      return (await res.json()) || [];
    } catch {
      return [];
    }
  }

  async function sendRemoteUpsert(items) {
    const token = getSessionToken();
    const userId = getUserId();
    if (!token || !userId || !base || !anonKey || !items || !items.length) return false;

    // Deduplicate items by cleaned bookId (keep the latest updated_at) to prevent Postgres Error 21000
    const dedupeMap = new Map();
    for (const b of items) {
      if (!b) continue;
      const bId = cleanId(b.bookId);
      if (!bId) continue;
      
      const existing = dedupeMap.get(bId);
      if (!existing || new Date(b.updatedAt || 0).getTime() >= new Date(existing.updatedAt || 0).getTime()) {
        dedupeMap.set(bId, {
          user_id: userId,
          book_id: bId,
          chapter_index: b.chapterIndex || 0,
          chapter_title: b.chapterTitle || "",
          progress_pct: Math.round(b.progressPct || 0),
          updated_at: b.updatedAt || new Date().toISOString()
        });
      }
    }

    const payload = Array.from(dedupeMap.values());
    if (!payload.length) return false;

    try {
      const res = await fetchImpl(`${base}/rest/v1/user_bookmarks?on_conflict=user_id,book_id`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function sendRemoteDelete(bookId) {
    const token = getSessionToken();
    if (!token || !base || !anonKey) return false;
    try {
      const res = await fetchImpl(`${base}/rest/v1/user_bookmarks?book_id=eq.${encodeURIComponent(cleanId(bookId))}`, {
        method: "DELETE",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`
        }
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function flushPending() {
    syncTimer = null;
    if (!pendingSync.size) return;
    const toSend = Array.from(pendingSync.values());
    pendingSync.clear();
    const sent = await sendRemoteUpsert(toSend);
    if (!sent) {
      // Preserve unsent progress. A later save/sync will retry it; silently
      // dropping the batch made cross-device state stale after one network flap.
      for (const item of toSend) {
        const key = cleanId(item.bookId);
        if (key && !pendingSync.has(key)) pendingSync.set(key, item);
      }
    }
  }

  function scheduleSync(bookmark) {
    pendingSync.set(cleanId(bookmark.bookId), bookmark);
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => flushPending().catch(() => {}), syncDebounceMs);
  }

  async function syncAll() {
    const token = getSessionToken();
    if (!token) return bookmarks;
    const remote = await fetchRemote();
    bookmarks = mergeBookmarks(bookmarks, remote);
    writeLocalBookmarks(storage, bookmarks);
    emit();

    // If local had items not yet in remote, push them up.
    const localOnly = Object.values(bookmarks).filter(
      (local) => local && cleanId(local.bookId) && !remote.some((r) => cleanId(r.book_id) === cleanId(local.bookId))
    );
    if (localOnly.length) {
      await sendRemoteUpsert(localOnly);
    }
    return bookmarks;
  }

  // Subscribe to auth state changes: when user signs in, trigger sync.
  if (authClient?.subscribe) {
    authClient.subscribe((session) => {
      if (session?.accessToken) {
        syncAll().catch(() => {});
      }
    });
  }

  return {
    getBookmarks: () => bookmarks,
    isBookmarked: (bookId) => {
      const cid = cleanId(bookId);
      return Boolean(cid && (bookmarks[cid] || bookmarks[bookId]));
    },
    getBookmark: (bookId) => {
      const cid = cleanId(bookId);
      return (cid && bookmarks[cid]) || bookmarks[bookId] || null;
    },

    toggleBookmark(bookId, info = {}) {
      const cid = cleanId(bookId);
      if (!cid) return false;
      const exists = Boolean(bookmarks[cid] || bookmarks[bookId]);
      if (exists) {
        delete bookmarks[cid];
        if (bookId !== cid) delete bookmarks[bookId];
        pendingSync.delete(cid);
        if (!pendingSync.size && syncTimer) {
          clearTimeout(syncTimer);
          syncTimer = null;
        }
        writeLocalBookmarks(storage, bookmarks);
        emit();
        sendRemoteDelete(cid).catch(() => {});
        return false;
      } else {
        const item = {
          bookId: cid,
          chapterIndex: info.chapterIndex || 0,
          chapterTitle: info.chapterTitle || "",
          progressPct: info.progressPct || 0,
          updatedAt: new Date().toISOString()
        };
        bookmarks[cid] = item;
        if (bookId !== cid) delete bookmarks[bookId];
        writeLocalBookmarks(storage, bookmarks);
        emit();
        scheduleSync(item);
        return true;
      }
    },

    saveProgress(bookId, { chapterIndex = 0, chapterTitle = "", progressPct = 0 } = {}) {
      const cid = cleanId(bookId);
      if (!cid) return;
      const current = bookmarks[cid] || bookmarks[bookId] || { bookId: cid };
      const item = {
        ...current,
        bookId: cid,
        chapterIndex: Number(chapterIndex) || 0,
        chapterTitle: String(chapterTitle || ""),
        progressPct: Math.round(Number(progressPct) || 0),
        updatedAt: new Date().toISOString()
      };
      bookmarks[cid] = item;
      if (bookId !== cid) delete bookmarks[bookId];
      writeLocalBookmarks(storage, bookmarks);
      emit();
      scheduleSync(item);
    },

    syncAll,
    subscribe(listener) {
      listeners.add(listener);
      listener(bookmarks);
      return () => listeners.delete(listener);
    }
  };
}

module.exports = {
  LOCAL_KEY,
  readLocalBookmarks,
  writeLocalBookmarks,
  cleanId,
  mergeBookmarks,
  createUserSync
};
