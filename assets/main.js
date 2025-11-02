// i18n + UI helpers
(function(){
  const LS_KEY = 'lang';
  const supported = ['en','ja'];
  const prefers = (navigator.language || 'en').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  let lang = localStorage.getItem(LS_KEY) || prefers;
  if (!supported.includes(lang)) lang = 'en';
  document.documentElement.lang = lang;

  async function loadDict(l){
    const res = await fetch(`assets/i18n/${l}.json`, { cache: 'no-store' });
    return await res.json();
  }

  function t(key){
    const parts = key.split('.');
    let cur = window.__i18nDict || {};
    for (const p of parts){ if (!cur || typeof cur !== 'object') return ''; cur = cur[p]; }
    return (cur == null) ? '' : String(cur);
  }

  function applyI18n(){
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const attr = el.getAttribute('data-i18n-attr');
      const val = t(key);
      if (!val) return;
      if (attr) el.setAttribute(attr, val);
      else el.textContent = val;
    });
    // Update lang toggle text
    const toggle = document.getElementById('langToggle');
    if (toggle){
      const other = (lang === 'ja') ? 'EN' : 'JP';
      const cur = (lang === 'ja') ? 'JP' : 'EN';
      toggle.innerHTML = `<span class="on">${cur}</span> / <span>${other}</span>`;
    }
    document.dispatchEvent(new CustomEvent('i18n:applied', { detail: { lang } }));
  }

  async function initI18n(){
    try {
      window.__i18nLang = lang;
      window.__i18nDict = await loadDict(lang);
      window.i18n = { lang: () => window.__i18nLang, t };
      applyI18n();
    } catch(e){
      console.error('i18n load failed', e);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // year
    const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
    initI18n();

    const menuToggle = document.getElementById('menuToggle');
    const headerActions = document.getElementById('headerActions');
    if (menuToggle && headerActions){
      const closeMenu = () => {
        if (!document.body.classList.contains('menu-open')) return;
        document.body.classList.remove('menu-open');
        menuToggle.setAttribute('aria-expanded', 'false');
      };
      menuToggle.addEventListener('click', () => {
        const isOpen = !document.body.classList.contains('menu-open');
        if (isOpen){
          document.body.classList.add('menu-open');
        } else {
          document.body.classList.remove('menu-open');
        }
        menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
      headerActions.querySelectorAll('.nav-link, .cta').forEach(el => {
        el.addEventListener('click', closeMenu);
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape'){ closeMenu(); }
      });
      const desktopMq = window.matchMedia('(min-width: 861px)');
      if (desktopMq.addEventListener){
        desktopMq.addEventListener('change', (event) => {
          if (event.matches) closeMenu();
        });
      } else if (desktopMq.addListener){
        desktopMq.addListener((event) => {
          if (event.matches) closeMenu();
        });
      }
    }

    // toggle handler
    const toggle = document.getElementById('langToggle');
    if (toggle) {
      toggle.addEventListener('click', async () => {
        lang = (window.__i18nLang === 'ja') ? 'en' : 'ja';
        localStorage.setItem(LS_KEY, lang);
        document.documentElement.lang = lang;
        window.__i18nLang = lang;
        window.__i18nDict = await loadDict(lang);
        applyI18n();
        // announce to pages that care
        document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang } }));
      });
    }
  });
})();
