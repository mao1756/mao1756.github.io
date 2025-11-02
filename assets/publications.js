// Client-side renderer for publications.json
const state = {
  pubs: [],
  filtered: [],
  groupByYear: true,
  sort: 'year-desc',
  query: ''
};

const el = (sel) => document.querySelector(sel);

function normalize(str){ return (str||'').toLowerCase(); }

function applyFilters(){
  const q = normalize(state.query);
  state.filtered = state.pubs.filter(p => {
    const hay = `${p.title} ${p.authors||''} ${p.venue||''}`.toLowerCase();
    return hay.includes(q);
  });

  switch(state.sort){
    case 'year-desc': state.filtered.sort((a,b) => (b.year||0)-(a.year||0)); break;
    case 'year-asc': state.filtered.sort((a,b) => (a.year||0)-(b.year||0)); break;
    case 'cites-desc': state.filtered.sort((a,b) => (b.citations||0)-(a.citations||0)); break;
    case 'cites-asc': state.filtered.sort((a,b) => (a.citations||0)-(b.citations||0)); break;
    case 'title-asc': state.filtered.sort((a,b) => a.title.localeCompare(b.title)); break;
    case 'title-desc': state.filtered.sort((a,b) => b.title.localeCompare(a.title)); break;
  }
}

function render(){
  applyFilters();
  const root = el('#pub-list');
  root.innerHTML = '';

  if (state.groupByYear){
    const groups = {};
    for (const p of state.filtered){
      const y = p.year || 'No year';
      groups[y] = groups[y] || [];
      groups[y].push(p);
    }
    const years = Object.keys(groups).sort((a,b) => (b==='No year')?1:(a==='No year')?-1:(+b)-(+a));
    for (const y of years){
      const h = document.createElement('h2');
      h.className = 'pub-year';
      h.textContent = y;
      root.appendChild(h);
      for (const p of groups[y]) root.appendChild(renderItem(p));
    }
  } else {
    for (const p of state.filtered) root.appendChild(renderItem(p));
  }
}

function renderItem(p){
  const item = document.createElement('article');
  item.className = 'pub-item';

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.innerHTML = `📅 <small>${p.year || '—'}</small>`;

  const info = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'pub-title';
  if (p.url){
    const a = document.createElement('a'); a.href = p.url; a.textContent = p.title; a.target = '_blank'; a.rel = 'noopener noreferrer';
    title.appendChild(a);
  } else {
    title.textContent = p.title;
  }
  const meta = document.createElement('div');
  meta.className = 'pub-meta';
  meta.textContent = [p.authors, p.venue].filter(Boolean).join(' · ');

  info.appendChild(title);
  info.appendChild(meta);

  const cites = document.createElement('span');
  cites.className = 'badge';
  cites.textContent = `⬆︎ ${p.citations || 0} cites`;

  item.appendChild(badge);
  item.appendChild(info);
  item.appendChild(cites);
  return item;
}

function debounce(fn, ms=200){
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}

async function init(){
  try{
    const res = await fetch('data/publications.json', {cache:'no-store'});
    const json = await res.json();
    state.pubs = Array.isArray(json.publications) ? json.publications : [];
    state.filtered = state.pubs.slice();
    const last = document.getElementById('pub-last-updated');
    if (json.updated_at && last){
      const dt = new Date(json.updated_at);
      last.textContent = `Last updated: ${dt.toLocaleString()}`;
    }
  }catch(e){
    state.pubs = []; state.filtered = [];
    console.error('Failed to load publications.json', e);
  }

  el('#groupByYear').addEventListener('change', (ev)=>{ state.groupByYear = ev.target.checked; render(); });
  el('#sort').addEventListener('change', (ev)=>{ state.sort = ev.target.value; render(); });
  el('#search').addEventListener('input', debounce((ev)=>{ state.query = ev.target.value; render(); }, 150));

  render();
}

document.addEventListener('DOMContentLoaded', init);
