/**
 * Fetch publications using SerpAPI's Google Scholar Author API and write data/publications.json
 * Usage:
 *   SERPAPI_API_KEY=xxxx SCHOLAR_ID=yyyy node scripts/fetch_serpapi_scholar_author.js
 * Optional env:
 *   HL=en           # Google Scholar interface language
 *   PAGE_SIZE=100   # 20..100 (SerpAPI max 100)
 *   MAX_PAGES=30    # safety cap
 *
 * Docs: https://serpapi.com/google-scholar-author-api
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetch } from 'undici';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.SERPAPI_API_KEY;
const SCHOLAR_ID = process.env.SCHOLAR_ID;
const HL = process.env.HL || 'en';
const PAGE_SIZE = Math.max(20, Math.min(parseInt(process.env.PAGE_SIZE || '100', 10), 100));
const MAX_PAGES = Math.max(1, Math.min(parseInt(process.env.MAX_PAGES || '30', 10), 100));

if (!API_KEY) { console.error('Missing SERPAPI_API_KEY'); process.exit(1); }
if (!SCHOLAR_ID) { console.error('Missing SCHOLAR_ID'); process.exit(1); }

function buildURL({ start = 0 }){
  const base = new URL('https://serpapi.com/search.json');
  base.searchParams.set('engine', 'google_scholar_author');
  base.searchParams.set('author_id', SCHOLAR_ID);
  base.searchParams.set('hl', HL);
  base.searchParams.set('api_key', API_KEY);
  base.searchParams.set('num', String(PAGE_SIZE));
  base.searchParams.set('start', String(start));
  // You could also set sort=pubdate to bias newest first (we sort later anyway)
  // base.searchParams.set('sort', 'pubdate');
  return base.toString();
}

async function getJSON(url){
  const res = await fetch(url, { headers: { 'User-Agent': 'personal-homepage-starter/1.0' } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  return await res.json();
}

function mapArticle(a){
  const title = a.title || 'Untitled';
  // SerpAPI returns authors as a string "...", keep verbatim
  const authors = a.authors || '';
  const year = a.year ? parseInt(a.year, 10) : null;
  const venue = a.publication || '';
  // Prefer 'link' to the Scholar citation page; external link may appear as resources
  const url = a.resources?.[0]?.link || a.link || '';
  const citations = a.cited_by?.value ? parseInt(a.cited_by.value, 10) : 0;
  return { title, authors, venue, year, citations, url };
}

async function run(){
  const all = [];
  let start = 0;
  for (let page=0; page<MAX_PAGES; page++){
    const url = buildURL({ start });
    const json = await getJSON(url);

    // articles array contains this page of works
    const articles = Array.isArray(json.articles) ? json.articles : [];
    for (const a of articles) all.push(mapArticle(a));

    if (articles.length < PAGE_SIZE) break; // last page
    start += PAGE_SIZE;
  }

  // Dedup by title + year, then sort by year desc, citations desc
  const seen = new Set();
  const pubs = [];
  for (const p of all){
    const key = `${(p.title || '').toLowerCase()}__${p.year || ''}`;
    if (!seen.has(key)){ seen.add(key); pubs.push(p); }
  }
  pubs.sort((a,b)=> (b.year||0)-(a.year||0) || (b.citations||0)-(a.citations||0));

  const out = {
    updated_at: new Date().toISOString(),
    author: SCHOLAR_ID,
    publications: pubs
  };

  const outPath = path.join(__dirname, '..', 'data', 'publications.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`SerpAPI: wrote ${pubs.length} publications to data/publications.json`);
}

run().catch(err => { console.error(err.message || err); process.exit(2); });
