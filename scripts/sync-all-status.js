'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
for (const name of ['.env', '.env.local']) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
    }
  }
}

const { createStorage, LAYOUT } = require('../server/storage');
const { createSupabase } = require('../server/supabase');
const { publishCatalogSnapshot } = require('../server/ingest/catalog-snapshot');

const storage = createStorage();
const db = createSupabase();
const BOOK_ID = 'fanqie-7027679289931729920';

async function main() {
  console.log('=== SYNCING ALL STATUS FOR', BOOK_ID, '===');

  // 1. Read main index.json
  const mainIndexKey = LAYOUT.bookIndex(BOOK_ID);
  const mainIndexRaw = await storage.get(mainIndexKey);
  if (!mainIndexRaw) throw new Error('Main index not found at ' + mainIndexKey);
  const mainIndex = JSON.parse(mainIndexRaw.toString('utf8'));
  console.log('[1] Main index:', {
    totalChapters: mainIndex.totalChapters,
    translatedChapters: mainIndex.translatedChapters,
    updatedAt: mainIndex.updatedAt
  });

  // 2. Sync to r1/index.json
  const r1Key = `books/${BOOK_ID}/r1/index.json`;
  await storage.put(r1Key, JSON.stringify(mainIndex, null, 2), {
    contentType: 'application/json; charset=utf-8',
    cacheControl: 'no-cache, no-store, must-revalidate'
  });
  console.log('[2] Synced r1/index.json successfully!');

  // 3. Update Supabase
  if (db) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    
    // Direct PATCH to Supabase REST API
    const patchRes = await fetch(`${supabaseUrl}/rest/v1/books?id=eq.${BOOK_ID}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        translated_chapters: mainIndex.translatedChapters,
        total_chapters: mainIndex.totalChapters,
        status: 'Hoàn thành',
        updated_at: new Date().toISOString()
      })
    });
    const patchData = await patchRes.json();
    console.log('[3] Supabase updated:', patchData);
  }

  // 4. Publish catalog snapshot
  console.log('[4] Publishing catalog snapshot...');
  const snapshot = await publishCatalogSnapshot({ storage, db });
  const bookInSnap = snapshot.books.find(b => b.id === BOOK_ID);
  console.log('[4] Book in catalog snapshot:', bookInSnap);

  // 5. Test fetching from CDN
  const https = require('https');
  for (const testUrl of [
    `https://cdn.tram-chu.online/books/${BOOK_ID}/index.json?t=${Date.now()}`,
    `https://cdn.tram-chu.online/books/${BOOK_ID}/r1/index.json?t=${Date.now()}`,
    `https://cdn.tram-chu.online/catalog/latest.json?t=${Date.now()}`
  ]) {
    await new Promise(resolve => {
      https.get(testUrl, { headers: { 'Cache-Control': 'no-cache' } }, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.books) {
              const b = data.books.find(x => x.id === BOOK_ID);
              console.log(`[CDN] ${testUrl.split('?')[0]} -> status=${res.statusCode}, book translated=${b?.translatedChapters}/${b?.chapterCount}`);
            } else {
              console.log(`[CDN] ${testUrl.split('?')[0]} -> status=${res.statusCode}, translated=${data.translatedChapters}/${data.totalChapters}`);
            }
          } catch (e) {
            console.log(`[CDN] ${testUrl.split('?')[0]} -> error parsing:`, e.message);
          }
          resolve();
        });
      });
    });
  }

  console.log('\n=== SYNC COMPLETED SUCCESSFULLY! ===');
}

main().catch(console.error);
