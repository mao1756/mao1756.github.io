/**
 * Fetch publications from a public Google Scholar profile and write data/publications.json
 * Usage (in CI): SCHOLAR_ID=xxxxxxxx node scripts/fetch_scholar.js
 * Notes:
 *  - Google Scholar has no official public API. This script scrapes the public profile HTML.
 *  - It may break if the DOM changes or if rate-limited. Use responsibly and per site terms.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as sleep } from 'timers/promises';
import * as cheerio from 'cheerio';
import { fetch } from 'undici';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHOLAR_ID = process.env.SCHOLAR_ID;
if (!SCHOLAR_ID) {
  console.error('Missing SCHOLAR_ID env var.');
  process.exit(1);
}

const BASE = `https://scholar.google.com/citations?hl=en&user=${encodeURIComponent(SCHOLAR_ID)}`;

async function fetchPage(start = 0, size = 100){
  const url = `${BASE}&cstart=${start}&pagesize=${size}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml'
    }
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  return html;
}

function parse(html){
  const $ = cheerio.load(html);
  const pubs = [];
  const name = $('#gsc_prf_in').first().text().trim();
  $('.gsc_a_tr').each((_, row) => {
    const $row = $(row);
    const titleEl = $row.find('.gsc_a_t a.gsc_a_at').first();
    const title = titleEl.text().trim();
    const href = titleEl.attr('href') || '';
    const url = href ? new URL(href, 'https://scholar.google.com').toString() : '';
    const lines = $row.find('.gsc_a_t .gs_gray');
    const authors = lines.eq(0).text().trim();
    const venue = lines.eq(1).text().trim();
    const year = parseInt($row.find('.gsc_a_y span').text().trim(), 10) || null;
    const citesText = $row.find('.gsc_a_c a').text().trim();
    const citations = parseInt(citesText, 10) || 0;

    if (title) pubs.push({ title, authors, venue, year, citations, url });
  });
  const count = pubs.length;
  return { name, pubs, count };
}

async function run(){
  const all = [];
  let start = 0;
  let name = null;
  for (let i=0; i<10; i++){ // cap to 1000 items
    const html = await fetchPage(start, 100);
    const { name: n, pubs, count } = parse(html);
    if (!name) name = n || null;
    all.push(...pubs);
    if (count < 100) break;
    start += 100;
    await sleep(800); // be gentle
  }

  // Deduplicate by title + year
  const seen = new Set();
  const dedup = [];
  for (const p of all){
    const key = `${(p.title||'').toLowerCase()}__${p.year||''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(p);
  }

  dedup.sort((a,b)=> (b.year||0)-(a.year||0) || (b.citations||0)-(a.citations||0));

  const out = {
    updated_at: new Date().toISOString(),
    author: name || 'Unknown',
    publications: dedup
  };

  const outPath = path.join(__dirname, '..', 'data', 'publications.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${dedup.length} publications to data/publications.json`);
}

run().catch(err => {
  console.error(err);
  process.exit(2);
});
