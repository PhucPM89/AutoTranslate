const fetch = globalThis.fetch;

async function testSearch(query) {
  const url = 'https://m.qidian.com/search?kw=' + encodeURIComponent(query);
  console.log('Fetching', url);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  console.log('Status:', response.status);
  const html = await response.text();
  const itemRegex = /<a\b[^>]*data-bid=["'](\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    const bid = match[1];
    const block = match[2];
    const nameMatch = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const authorMatch = block.match(/<p[^>]*class=["'][^"']*searchBookAuthor[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    console.log('Found:', bid, nameMatch ? nameMatch[1].trim() : '', authorMatch ? authorMatch[1].trim() : '');
  }
}

async function run() {
  await testSearch('纯洁滴小龙');
}
run();
