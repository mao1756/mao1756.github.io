
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetch } from 'undici';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENALEX = 'https://api.openalex.org';
const AUTHOR_ID = process.env.OPENALEX_AUTHOR_ID || '';
const QUERY = process.env.OPENALEX_QUERY || '';

async function getJSON(url){
  const res = await fetch(url, { headers: { 'User-Agent': 'personal-homepage-starter/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return await res.json();
}

async function resolveAuthorId(){
  if (AUTHOR_ID) return AUTHOR_ID;
  if (!QUERY) throw new Error('Set OPENALEX_AUTHOR_ID (recommended) or OPENALEX_QUERY to resolve author.');
  const url = `${OPENALEX}/authors?search=${encodeURIComponent(QUERY)}&per_page=25`;
  const data = await getJSON(url);
  if (!data?.results?.length) throw new Error(`No author results for query: ${QUERY}`);
  const best = data.results.sort((a,b)=>(b.cited_by_count||0)-(a.cited_by_count||0))[0];
  return best?.id?.split('/').pop();
}

function mapWork(w){
  const title = w.title || 'Untitled';
  const year = w.publication_year || null;
  const citations = w.cited_by_count || 0;
  const authors = (w.authorships || []).map(a => a?.author?.display_name).filter(Boolean).join(', ');
  const venue = w.primary_location?.source?.display_name || w.host_venue?.display_name || '';
  let url = '';
  if (w.doi) url = `https://doi.org/${w.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//,'')}`;
  else if (w.primary_location?.landing_page_url) url = w.primary_location.landing_page_url;
  else if (w.open_access?.oa_url) url = w.open_access.oa_url;
  else if (w.id) url = w.id;
  return { title, authors, venue, year, citations, url };
}

async function fetchWorksForAuthor(authorId){
  const per_page = 200;
  let cursor = '*';
  const pubs = [];
  for (let i=0; i<20; i++){
    const url = `${OPENALEX}/works?filter=author.id:${authorId}&sort=publication_year:desc&per_page=${per_page}&cursor=${encodeURIComponent(cursor)}&select=title,publication_year,authorships,primary_location,host_venue,host_venues,cited_by_count,doi,open_access,id`;
    const data = await getJSON(url);
    for (const w of (data?.results || [])) pubs.push(mapWork(w));
    if (!data?.meta?.next_cursor) break;
    cursor = data.meta.next_cursor;
  }
  return pubs;
}

async function run(){
  const id = await resolveAuthorId();
  const authorJSON = await getJSON(`${OPENALEX}/authors/${id}`);
  const displayName = authorJSON?.display_name || 'Unknown';
  const works = await fetchWorksForAuthor(id);
  const seen = new Set(); const out = [];
  for (const p of works){ const key = `${(p.title||'').toLowerCase()}__${p.year||''}`; if (!seen.has(key)){ seen.add(key); out.push(p); } }
  out.sort((a,b)=> (b.year||0)-(a.year||0) || (b.citations||0)-(a.citations||0));
  const payload = { updated_at: new Date().toISOString(), author: displayName, publications: out };
  const file = path.join(__dirname, '..', 'data', 'publications.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  console.log(`OpenAlex: wrote ${out.length} publications for ${displayName}.`);
}

run().catch(e => { console.error(e.message || e); process.exit(2); });
