// Publications renderer (search/sort/group by year)
const S={pubs:[],filtered:[],groupByYear:true,sort:'year-desc',query:''};const $=s=>document.querySelector(s);
function apply(){const q=(S.query||'').toLowerCase();S.filtered=S.pubs.filter(p=>(`${p.title} ${p.authors||''} ${p.venue||''}`).toLowerCase().includes(q));
  const cmp={'year-desc':(a,b)=>(b.year||0)-(a.year||0),'year-asc':(a,b)=>(a.year||0)-(b.year||0),'cites-desc':(a,b)=>(b.citations||0)-(a.citations||0),'cites-asc':(a,b)=>(a.citations||0)-(b.citations||0),'title-asc':(a,b)=>a.title.localeCompare(b.title),'title-desc':(a,b)=>b.title.localeCompare(a.title)}[S.sort];S.filtered.sort(cmp);}
function item(p){const it=document.createElement('article');it.className='pub-item';
  const b=document.createElement('span');b.className='badge';b.innerHTML=`📅 <small>${p.year||'—'}</small>`;
  const info=document.createElement('div');const t=document.createElement('div');t.className='pub-title';
  if(p.url){const a=document.createElement('a');a.href=p.url;a.textContent=p.title;a.target='_blank';a.rel='noopener';t.appendChild(a);}else t.textContent=p.title;
  const m=document.createElement('div');m.className='pub-meta';m.textContent=[p.authors,p.venue].filter(Boolean).join(' · ');
  info.appendChild(t);info.appendChild(m);const c=document.createElement('span');c.className='badge';c.textContent=`⬆︎ ${p.citations||0} cites`;
  it.appendChild(b);it.appendChild(info);it.appendChild(c);return it;}
function render(){apply();const root=$('#pub-list');root.innerHTML='';if(S.groupByYear){const g={};for(const p of S.filtered){const y=p.year||'No year';(g[y]=g[y]||[]).push(p);}
  Object.keys(g).sort((a,b)=>(b==='No year')?1:(a==='No year')?-1:(+b)-(+a)).forEach(y=>{const h=document.createElement('h2');h.className='pub-year';h.textContent=y;root.appendChild(h);g[y].forEach(p=>root.appendChild(item(p)));});}
  else S.filtered.forEach(p=>root.appendChild(item(p)));}
function debounce(f,m=200){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),m);}}
async function init(){try{const r=await fetch('data/publications.json',{cache:'no-store'});const j=await r.json();S.pubs=Array.isArray(j.publications)?j.publications:[];S.filtered=[...S.pubs];const last=document.getElementById('pub-last-updated');if(j.updated_at&&last){const dt=new Date(j.updated_at);last.textContent=`Last updated: ${dt.toLocaleString()}`;}}catch(e){S.pubs=[];S.filtered=[];}
  $('#groupByYear')?.addEventListener('change',e=>{S.groupByYear=e.target.checked;render();});$('#sort')?.addEventListener('change',e=>{S.sort=e.target.value;render();});$('#search')?.addEventListener('input',debounce(e=>{S.query=e.target.value;render();},150));render();}
document.addEventListener('DOMContentLoaded',init);
