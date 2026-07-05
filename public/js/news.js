/**
 * news.js — Shared JS for news.html and article.html
 * Handles: news listing with pagination, article detail, lang-switching re-render
 */
(function () {
  'use strict';

  /* ─────────────── HELPERS ─────────────── */

  function getLang() {
    return (typeof FIFUSA !== 'undefined' && FIFUSA.getCurrentLang)
      ? FIFUSA.getCurrentLang()
      : (localStorage.getItem('fifusa_lang') || 'ru');
  }

  function fmtDate(d) {
    return (typeof FIFUSA !== 'undefined' && FIFUSA.formatDate)
      ? FIFUSA.formatDate(d)
      : (d || '');
  }

  function apiFetch(url) {
    if (typeof FIFUSA !== 'undefined' && FIFUSA.apiFetch) return FIFUSA.apiFetch(url);
    return fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  function applyI18n() {
    if (typeof FIFUSA !== 'undefined' && FIFUSA.applyI18n) FIFUSA.applyI18n();
  }

  /* ═══════════════════════════════════════
       NEWS LISTING  (news.html)
     ═══════════════════════════════════════ */

  function isNewsPage() {
    return !!document.getElementById('newsContent');
  }

  /* ─── State ─── */
  const newsState = {
    items: [],
    currentPage: 1,
    totalPages: 1,
    limit: 9,
    loading: false,
  };

  /* ─── Build a single card ─── */
  function buildNewsCard(item) {
    const lang    = getLang();
    const title   = item['title_' + lang] || item.title_ru || item.title || '';
    const excerpt = item['excerpt_' + lang] || item.excerpt_ru || item.excerpt || item['body_' + lang] || '';
    const date    = fmtDate(item.date || item.published_at || item.created_at);
    const slug    = item.slug || item.id || '';
    const img     = item.image_url || item.cover_image || item.thumbnail || '';

    const imgHtml = img
      ? `<img class="news-card-img" src="${img}" alt="${title}" loading="lazy">`
      : `<div class="news-card-img-placeholder">⚽</div>`;

    const excerptHtml = excerpt
      ? `<p class="news-card-excerpt">${excerpt.replace(/<[^>]+>/g, '')}</p>`
      : '';

    const i18nReadMore = getLang() === 'en' ? 'Read More' : getLang() === 'es' ? 'Leer más' : 'Подробнее';

    return `
      <article class="news-card">
        ${imgHtml}
        <div class="news-card-body">
          ${date ? `<div class="news-card-date">${date}</div>` : ''}
          <h2 class="news-card-title">${title}</h2>
          ${excerptHtml}
        </div>
        <div class="news-card-footer">
          <a href="/article.html?slug=${encodeURIComponent(slug)}" class="btn-read-more" data-i18n="news.readmore">${i18nReadMore}</a>
        </div>
      </article>`;
  }

  /* ─── Render grid ─── */
  function renderNewsGrid() {
    const content = document.getElementById('newsContent');
    if (!newsState.items.length) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📰</div>
          <p data-i18n="news.empty">Новости не найдены</p>
        </div>`;
      applyI18n();
      return;
    }
    content.innerHTML = `<div class="news-grid">${newsState.items.map(buildNewsCard).join('')}</div>`;
    applyI18n();
  }

  /* ─── Render pagination ─── */
  function renderPagination() {
    const wrap = document.getElementById('paginationWrap');
    if (!wrap) return;
    if (newsState.totalPages <= 1) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';

    const { currentPage: cur, totalPages: total } = newsState;
    let html = '';

    // Prev
    html += `<button class="page-btn" id="pgPrev" ${cur <= 1 ? 'disabled' : ''} aria-label="Предыдущая">&#8592;</button>`;

    // Pages (show up to 5 around current)
    const pages = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (cur > 3) pages.push('…');
      for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) pages.push(i);
      if (cur < total - 2) pages.push('…');
      pages.push(total);
    }

    pages.forEach(p => {
      if (p === '…') {
        html += `<span class="page-btn" style="cursor:default;opacity:0.4">…</span>`;
      } else {
        html += `<button class="page-btn ${p === cur ? 'active' : ''}" data-page="${p}">${p}</button>`;
      }
    });

    // Next
    html += `<button class="page-btn" id="pgNext" ${cur >= total ? 'disabled' : ''} aria-label="Следующая">&#8594;</button>`;

    wrap.innerHTML = html;

    // Bind events
    wrap.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => fetchNews(Number(btn.dataset.page)));
    });
    const prev = wrap.querySelector('#pgPrev');
    const next = wrap.querySelector('#pgNext');
    if (prev && !prev.disabled) prev.addEventListener('click', () => fetchNews(cur - 1));
    if (next && !next.disabled) next.addEventListener('click', () => fetchNews(cur + 1));
  }

  /* ─── Fetch news ─── */
  async function fetchNews(page) {
    if (newsState.loading) return;
    newsState.loading = true;
    newsState.currentPage = page;

    const content = document.getElementById('newsContent');
    content.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;

    const wrap = document.getElementById('paginationWrap');
    if (wrap) wrap.style.display = 'none';

    try {
      const url  = `/api/news?page=${page}&limit=${newsState.limit}`;
      const data = await apiFetch(url);

      // Normalise response shape
      if (Array.isArray(data)) {
        newsState.items      = data;
        newsState.totalPages = 1;
      } else {
        newsState.items      = data.items || data.data || data.news || [];
        newsState.totalPages = data.totalPages || data.total_pages || Math.ceil((data.total || newsState.items.length) / newsState.limit) || 1;
      }

      renderNewsGrid();
      renderPagination();

      // Scroll to top of section
      const section = document.querySelector('.news-section');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      console.error('[news.js] fetch error:', err);
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <p>Ошибка загрузки новостей</p>
        </div>`;
    } finally {
      newsState.loading = false;
    }
  }

  /* ─── Init news page ─── */
  function initNewsPage() {
    fetchNews(1);

    // Re-render on language switch
    document.addEventListener('fifusa:langchange', function () {
      if (newsState.items.length) renderNewsGrid();
    });
  }

  /* ═══════════════════════════════════════
       ARTICLE DETAIL  (article.html)
     ═══════════════════════════════════════ */

  function isArticlePage() {
    return !!document.getElementById('articleContent');
  }

  function buildArticleHTML(article) {
    const lang    = getLang();
    const title   = article['title_' + lang]   || article.title_ru   || article.title   || '';
    const body    = article['body_' + lang]     || article.body_ru    || article.body    || article.content || '';
    const date    = fmtDate(article.date || article.published_at || article.created_at);
    const imgUrl  = article.image_url || article.cover_image || article.thumbnail || '';
    const category = article['category_' + lang] || article.category_ru || article.category || '';

    const imgHtml = imgUrl
      ? `<img class="article-hero-img" src="${imgUrl}" alt="${title}">`
      : '';

    const catHtml = category
      ? `<div class="article-category">${category}</div>`
      : '';

    const bodyHtml = body
      ? `<div class="article-body">${body.includes('<') ? body : body.split('\n\n').map(p => `<p>${p}</p>`).join('')}</div>`
      : '';

    return `
      <a href="/news.html" class="article-back" id="articleBackBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        <span data-i18n="article.back">Назад к новостям</span>
      </a>
      <div class="article-header">
        ${catHtml}
        <h1 class="article-title">${title}</h1>
        <div class="article-meta">
          ${date ? `<div class="article-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>${date}</span>
          </div>` : ''}
        </div>
      </div>
      ${imgHtml}
      <hr class="article-divider">
      ${bodyHtml}`;
  }

  function buildNotFoundHTML() {
    return `
      <div class="error-state">
        <div class="error-code">404</div>
        <h2 data-i18n="article.notfound">Статья не найдена</h2>
        <p data-i18n="article.notfound.desc">Возможно, она была удалена или перемещена.</p>
        <a href="/news.html" class="btn-read-more" style="display:inline-flex;align-items:center;gap:0.5rem;" data-i18n="article.back">← Назад к новостям</a>
      </div>`;
  }

  /* ─── Init article page ─── */
  async function initArticlePage() {
    const content = document.getElementById('articleContent');
    const params  = new URLSearchParams(window.location.search);
    const slug    = params.get('slug');

    if (!slug) {
      content.innerHTML = buildNotFoundHTML();
      applyI18n();
      return;
    }

    // Update page title dynamically once loaded
    try {
      const article = await apiFetch(`/api/news/${encodeURIComponent(slug)}`);

      if (!article || (!article.title_ru && !article.title)) {
        throw new Error('empty');
      }

      const lang  = getLang();
      const title = article['title_' + lang] || article.title_ru || article.title || '';
      document.title = title + ' — FIFUSA • UEFS';

      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        const excerpt = (article['excerpt_' + lang] || article.excerpt_ru || article.excerpt || '').replace(/<[^>]+>/g, '').substring(0, 160);
        if (excerpt) metaDesc.setAttribute('content', excerpt);
      }

      content.innerHTML = buildArticleHTML(article);
      applyI18n();

      // Re-render on lang change
      document.addEventListener('fifusa:langchange', function () {
        content.innerHTML = buildArticleHTML(article);
        applyI18n();
      });

    } catch (err) {
      if (err.message === '404' || err.message === 'empty') {
        content.innerHTML = buildNotFoundHTML();
      } else {
        content.innerHTML = buildNotFoundHTML();
        console.error('[news.js] article fetch error:', err);
      }
      applyI18n();
    }
  }

  /* ═══════════════════════════════════════
       BOOT
     ═══════════════════════════════════════ */

  function boot() {
    if (isNewsPage()) {
      initNewsPage();
    } else if (isArticlePage()) {
      initArticlePage();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
