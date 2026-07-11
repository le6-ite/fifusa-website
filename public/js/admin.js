/* ═══════════════════════════════════════════════════════════
   ADMIN.JS — Admin Panel Logic
   ═══════════════════════════════════════════════════════════ */

const TOKEN = localStorage.getItem('fifusa-token');

// ─── AUTH CHECK ───────────────────────────────────────────

if (!TOKEN) {
  window.location.href = '/admin/login.html';
}

document.getElementById('adminUsername').textContent =
  localStorage.getItem('fifusa-admin-user') || 'admin';

function logout() {
  localStorage.removeItem('fifusa-token');
  localStorage.removeItem('fifusa-admin-user');
  window.location.href = '/admin/login.html';
}

// ─── API HELPER ───────────────────────────────────────────

async function adminFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    logout();
    return null;
  }
  return res;
}

// ─── ESCAPING ─────────────────────────────────────────────
// Everything rendered into the admin tables goes through here. Contact
// messages especially: they are public input, and unescaped HTML there
// would run scripts inside the authenticated admin session.

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─── TOAST ────────────────────────────────────────────────

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ─── SECTION NAVIGATION ───────────────────────────────────

const sectionTitles = {
  dashboard: 'Дашборд',
  news: 'Новости',
  media: 'Медиа',
  documents: 'Документы',
  partners: 'Партнёры',
  messages: 'Сообщения',
};

function showSection(name) {
  // Hide all sections
  document.querySelectorAll('[id^="section-"]').forEach(s => s.style.display = 'none');
  document.getElementById(`section-${name}`).style.display = 'block';

  // Update nav
  document.querySelectorAll('.admin-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === name);
  });

  document.getElementById('sectionTitle').textContent = sectionTitles[name] || name;

  // Load data
  const loaders = { news: loadNews, media: loadMedia, documents: loadDocuments, partners: loadPartners, messages: loadMessages, dashboard: loadDashboard };
  loaders[name]?.();
}

// ─── MODAL ────────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Close on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ─── LANG TABS ────────────────────────────────────────────

function switchLangTab(btn, prefix, lang) {
  const modal = btn.closest('.modal');
  modal.querySelectorAll('.lang-tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  modal.querySelectorAll('.lang-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`${prefix}-lang-${lang}`);
  if (panel) panel.classList.add('active');
}

// ─── IMAGE PREVIEW ────────────────────────────────────────

function previewImage(input, previewId, areaId) {
  const file = input.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const preview = document.getElementById(previewId);
  if (preview) {
    preview.style.display = 'block';
    preview.innerHTML = `<img src="${url}" style="width:100%;border-radius:8px;">`;
  }
}

// ─── NEWS: MULTI-IMAGE GALLERY (new, unsaved uploads) ─────

let pendingNewsFiles = [];   // File objects picked but not yet uploaded
let existingNewsImages = []; // { id, image_path, sort_order } already saved on the server

const MAX_NEWS_IMAGES = 10;

function handleNewsFiles(input) {
  const files = Array.from(input.files || []);
  const room = MAX_NEWS_IMAGES - existingNewsImages.length - pendingNewsFiles.length;
  if (files.length > room) {
    showToast(`Максимум ${MAX_NEWS_IMAGES} изображений на новость`, 'error');
  }
  pendingNewsFiles = pendingNewsFiles.concat(files.slice(0, Math.max(0, room)));
  input.value = '';
  renderPendingNewsImages();
}

function renderPendingNewsImages() {
  const wrap = document.getElementById('newsPendingImages');
  wrap.innerHTML = pendingNewsFiles.map((file, i) => `
    <div class="news-image-thumb">
      <img src="${URL.createObjectURL(file)}">
      <div class="news-image-thumb-actions">
        <button type="button" onclick="movePendingImage(${i},-1)" ${i===0?'disabled':''}>‹</button>
        <button type="button" onclick="movePendingImage(${i},1)" ${i===pendingNewsFiles.length-1?'disabled':''}>›</button>
        <button type="button" onclick="removePendingImage(${i})">✕</button>
      </div>
      <span class="news-image-thumb-badge">новое</span>
    </div>
  `).join('');
}

function movePendingImage(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= pendingNewsFiles.length) return;
  [pendingNewsFiles[i], pendingNewsFiles[j]] = [pendingNewsFiles[j], pendingNewsFiles[i]];
  renderPendingNewsImages();
}

function removePendingImage(i) {
  pendingNewsFiles.splice(i, 1);
  renderPendingNewsImages();
}

// ─── NEWS: EXISTING IMAGES (already saved, editing only) ──

async function loadExistingNewsImages(newsId) {
  const res = await adminFetch(`/api/admin/news/${newsId}/images`);
  const data = res ? await res.json() : { items: [] };
  existingNewsImages = data.items || [];
  renderExistingNewsImages();
}

function renderExistingNewsImages() {
  const wrap = document.getElementById('newsExistingImages');
  wrap.innerHTML = existingNewsImages.map((img, i) => `
    <div class="news-image-thumb">
      <img src="${img.image_path}">
      <div class="news-image-thumb-actions">
        <button type="button" onclick="moveExistingImage(${i},-1)" ${i===0?'disabled':''}>‹</button>
        <button type="button" onclick="moveExistingImage(${i},1)" ${i===existingNewsImages.length-1?'disabled':''}>›</button>
        <button type="button" onclick="removeExistingImage(${img.id})">✕</button>
      </div>
      ${i===0 ? '<span class="news-image-thumb-badge">обложка</span>' : ''}
    </div>
  `).join('');
}

async function moveExistingImage(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= existingNewsImages.length) return;
  [existingNewsImages[i], existingNewsImages[j]] = [existingNewsImages[j], existingNewsImages[i]];
  renderExistingNewsImages();
  const id = document.getElementById('newsId').value;
  await adminFetch(`/api/admin/news/${id}/images/order`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order: existingNewsImages.map(img => img.id) }),
  });
}

async function removeExistingImage(imageId) {
  const id = document.getElementById('newsId').value;
  await adminFetch(`/api/admin/news/${id}/images/${imageId}`, { method: 'DELETE' });
  existingNewsImages = existingNewsImages.filter(img => img.id !== imageId);
  renderExistingNewsImages();
}

// ─── NEWS: PUBLISHED-AT HELPERS ────────────────────────────

function sqlDateToLocalInput(sqlDate) {
  if (!sqlDate) return '';
  return sqlDate.slice(0, 16).replace(' ', 'T');
}

function localInputToSqlDate(inputValue) {
  if (!inputValue) return '';
  return inputValue.replace('T', ' ') + ':00';
}

function toggleMediaType() {
  const type = document.getElementById('mediaType').value;
  document.getElementById('mediaPhotoUpload').style.display = type === 'photo' ? 'block' : 'none';
  document.getElementById('mediaVideoUrl').style.display = type === 'video' ? 'block' : 'none';
}

// ─── DASHBOARD ────────────────────────────────────────────

async function loadDashboard() {
  try {
    const [news, media, docs, msgs] = await Promise.all([
      adminFetch('/api/admin/news'),
      adminFetch('/api/admin/media'),
      adminFetch('/api/admin/documents'),
      adminFetch('/api/admin/messages'),
    ]);

    const nd = news ? await news.json() : { items: [] };
    const md = media ? await media.json() : { items: [] };
    const dd = docs ? await docs.json() : { items: [] };
    const msgd = msgs ? await msgs.json() : { items: [] };

    document.getElementById('statNews').textContent = nd.items.length;
    document.getElementById('statMedia').textContent = md.items.length;
    document.getElementById('statDocs').textContent = dd.items.length;
    document.getElementById('statMsgs').textContent = msgd.items.length;

    const unread = msgd.items.filter(m => !m.is_read).length;
    if (unread > 0) {
      const badge = document.getElementById('msgBadge');
      badge.textContent = unread;
      badge.style.display = 'inline';
    }
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}

// ─── NEWS ─────────────────────────────────────────────────

async function loadNews() {
  const res = await adminFetch('/api/admin/news');
  const data = await res.json();
  const tbody = document.getElementById('newsTableBody');

  if (!data.items.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--color-text-muted);">Новостей нет. Добавьте первую!</td></tr>';
    return;
  }

  tbody.innerHTML = data.items.map(n => `
    <tr>
      <td><strong>${esc(n.title_ru) || '—'}</strong></td>
      <td style="font-size:0.85rem;color:var(--color-text-muted);">${new Date(n.published_at).toLocaleDateString('ru-RU')}</td>
      <td><span class="badge ${n.is_published ? 'badge-success' : 'badge-muted'}">${n.is_published ? 'Опубликована' : 'Скрыта'}</span></td>
      <td style="display:flex;gap:0.5rem;">
        <button class="btn btn-ghost" style="padding:0.35rem 0.75rem;font-size:0.8rem;" onclick="editNews(${n.id})">✏️ Редактировать</button>
        <button class="btn btn-danger" style="padding:0.35rem 0.75rem;font-size:0.8rem;" onclick="deleteNews(${n.id})">🗑️ Удалить</button>
      </td>
    </tr>
  `).join('');
}

async function saveNews() {
  const id = document.getElementById('newsId').value;
  const formData = new FormData();
  formData.append('title_ru', document.getElementById('newsTitleRu').value);
  formData.append('title_en', document.getElementById('newsTitleEn').value);
  formData.append('title_es', document.getElementById('newsTitleEs').value);
  formData.append('body_ru', document.getElementById('newsBodyRu').value);
  formData.append('body_en', document.getElementById('newsBodyEn').value);
  formData.append('body_es', document.getElementById('newsBodyEs').value);
  formData.append('is_published', document.getElementById('newsPublished').checked ? '1' : '0');

  const publishedAtInput = document.getElementById('newsPublishedAt').value;
  if (publishedAtInput) formData.append('published_at', localInputToSqlDate(publishedAtInput));

  pendingNewsFiles.forEach(file => formData.append('images', file));

  if (!formData.get('title_ru')) {
    showToast('Заголовок (RU) обязателен', 'error');
    return;
  }

  const url = id ? `/api/admin/news/${id}` : '/api/admin/news';
  const method = id ? 'PUT' : 'POST';
  const res = await adminFetch(url, { method, body: formData });
  const data = await res.json();

  if (res.ok) {
    showToast(id ? 'Новость обновлена!' : 'Новость создана!');
    closeModal('newsModal');
    clearNewsForm();
    loadNews();
  } else {
    showToast(data.error || 'Ошибка сохранения', 'error');
  }
}

async function editNews(id) {
  const res = await adminFetch('/api/admin/news');
  const data = await res.json();
  const news = data.items.find(n => n.id === id);
  if (!news) return;

  document.getElementById('newsId').value = news.id;
  document.getElementById('newsTitleRu').value = news.title_ru || '';
  document.getElementById('newsTitleEn').value = news.title_en || '';
  document.getElementById('newsTitleEs').value = news.title_es || '';
  document.getElementById('newsBodyRu').value = news.body_ru || '';
  document.getElementById('newsBodyEn').value = news.body_en || '';
  document.getElementById('newsBodyEs').value = news.body_es || '';
  document.getElementById('newsPublished').checked = !!news.is_published;
  document.getElementById('newsPublishedAt').value = sqlDateToLocalInput(news.published_at);
  document.getElementById('newsModalTitle').textContent = 'Редактировать новость';

  pendingNewsFiles = [];
  renderPendingNewsImages();
  await loadExistingNewsImages(news.id);

  openModal('newsModal');
}

async function deleteNews(id) {
  if (!confirm('Удалить эту новость?')) return;
  const res = await adminFetch(`/api/admin/news/${id}`, { method: 'DELETE' });
  if (res.ok) { showToast('Новость удалена'); loadNews(); }
  else showToast('Ошибка удаления', 'error');
}

function clearNewsForm() {
  ['newsId','newsTitleRu','newsTitleEn','newsTitleEs','newsBodyRu','newsBodyEn','newsBodyEs'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('newsPublished').checked = true;
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  document.getElementById('newsPublishedAt').value = now.toISOString().slice(0, 16);
  document.getElementById('newsImageInput').value = '';
  document.getElementById('newsModalTitle').textContent = 'Добавить новость';

  pendingNewsFiles = [];
  existingNewsImages = [];
  renderPendingNewsImages();
  renderExistingNewsImages();
}

// ─── MEDIA ────────────────────────────────────────────────

async function loadMedia() {
  const res = await adminFetch('/api/admin/media');
  const data = await res.json();
  const tbody = document.getElementById('mediaTableBody');

  if (!data.items.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--color-text-muted);">Медиа нет. Добавьте первое!</td></tr>';
    return;
  }

  tbody.innerHTML = data.items.map(m => `
    <tr>
      <td><strong>${esc(m.title_ru) || '—'}</strong></td>
      <td><span class="badge badge-gold">${m.media_type === 'video' ? '🎥 Видео' : '📷 Фото'}</span></td>
      <td style="font-size:0.85rem;color:var(--color-text-muted);">${m.event_date || '—'}</td>
      <td>
        <button class="btn btn-danger" style="padding:0.35rem 0.75rem;font-size:0.8rem;" onclick="deleteMedia(${m.id})">🗑️ Удалить</button>
      </td>
    </tr>
  `).join('');
}

async function saveMedia() {
  const formData = new FormData();
  formData.append('title_ru', document.getElementById('mediaTitleRu').value);
  formData.append('title_en', document.getElementById('mediaTitleEn').value);
  formData.append('title_es', document.getElementById('mediaTitleEs').value);
  formData.append('description_ru', document.getElementById('mediaDescRu').value);
  formData.append('description_en', document.getElementById('mediaDescEn').value);
  formData.append('description_es', document.getElementById('mediaDescEs').value);
  formData.append('media_type', document.getElementById('mediaType').value);
  formData.append('embed_url', document.getElementById('mediaEmbedUrl').value);
  formData.append('event_date', document.getElementById('mediaEventDate').value);

  const coverInput = document.getElementById('mediaCoverInput').files[0] ||
                     document.getElementById('mediaCoverVideoInput').files[0];
  if (coverInput) formData.append('cover', coverInput);

  const res = await adminFetch('/api/admin/media', { method: 'POST', body: formData });
  if (res.ok) {
    showToast('Медиа добавлено!');
    closeModal('mediaModal');
    loadMedia();
  } else {
    const d = await res.json();
    showToast(d.error || 'Ошибка', 'error');
  }
}

async function deleteMedia(id) {
  if (!confirm('Удалить?')) return;
  const res = await adminFetch(`/api/admin/media/${id}`, { method: 'DELETE' });
  if (res.ok) { showToast('Медиа удалено'); loadMedia(); }
}

// ─── DOCUMENTS ────────────────────────────────────────────

async function loadDocuments() {
  const res = await adminFetch('/api/admin/documents');
  const data = await res.json();
  const tbody = document.getElementById('docsTableBody');

  if (!data.items.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--color-text-muted);">Документов нет. Загрузите первый!</td></tr>';
    return;
  }

  tbody.innerHTML = data.items.map(d => `
    <tr>
      <td><strong>${esc(d.title_ru) || '—'}</strong></td>
      <td><span class="badge badge-muted">${d.category || 'general'}</span></td>
      <td style="font-size:0.85rem;color:var(--color-text-muted);">${new Date(d.created_at).toLocaleDateString('ru-RU')}</td>
      <td style="display:flex;gap:0.5rem;">
        <a class="btn btn-ghost" href="${d.file_path}" target="_blank" style="padding:0.35rem 0.75rem;font-size:0.8rem;">👁️ Открыть</a>
        <button class="btn btn-danger" style="padding:0.35rem 0.75rem;font-size:0.8rem;" onclick="deleteDocument(${d.id})">🗑️ Удалить</button>
      </td>
    </tr>
  `).join('');
}

async function saveDocument() {
  const file = document.getElementById('docFileInput').files[0];
  if (!file) { showToast('Выберите PDF файл', 'error'); return; }

  const formData = new FormData();
  formData.append('title_ru', document.getElementById('docTitleRu').value);
  formData.append('title_en', document.getElementById('docTitleEn').value);
  formData.append('title_es', document.getElementById('docTitleEs').value);
  formData.append('category', document.getElementById('docCategory').value);
  formData.append('file', file);

  const res = await adminFetch('/api/admin/documents', { method: 'POST', body: formData });
  if (res.ok) {
    showToast('Документ загружен!');
    closeModal('docModal');
    loadDocuments();
  } else {
    const d = await res.json();
    showToast(d.error || 'Ошибка', 'error');
  }
}

async function deleteDocument(id) {
  if (!confirm('Удалить документ?')) return;
  const res = await adminFetch(`/api/admin/documents/${id}`, { method: 'DELETE' });
  if (res.ok) { showToast('Документ удалён'); loadDocuments(); }
}

// ─── PARTNERS ─────────────────────────────────────────────

async function loadPartners() {
  const res = await adminFetch('/api/admin/partners');
  const data = await res.json();
  const tbody = document.getElementById('partnersTableBody');

  if (!data.items.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--color-text-muted);">Партнёров нет</td></tr>';
    return;
  }

  tbody.innerHTML = data.items.map(p => `
    <tr>
      <td>${p.logo_path ? `<img src="${esc(p.logo_path)}" style="height:36px;object-fit:contain;">` : '—'}</td>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${p.website_url ? `<a href="${esc(p.website_url)}" target="_blank" rel="noopener" style="color:var(--color-gold);font-size:0.85rem;">Открыть ↗</a>` : '—'}</td>
      <td>${p.sort_order}</td>
      <td>
        <button class="btn btn-danger" style="padding:0.35rem 0.75rem;font-size:0.8rem;" onclick="deletePartner(${p.id})">🗑️ Удалить</button>
      </td>
    </tr>
  `).join('');
}

async function savePartner() {
  const name = document.getElementById('partnerName').value;
  if (!name) { showToast('Введите название', 'error'); return; }

  const formData = new FormData();
  formData.append('name', name);
  formData.append('website_url', document.getElementById('partnerUrl').value);
  formData.append('sort_order', document.getElementById('partnerOrder').value);
  const logo = document.getElementById('partnerLogoInput').files[0];
  if (logo) formData.append('logo', logo);

  const id = document.getElementById('partnerId').value;
  const url = id ? `/api/admin/partners/${id}` : '/api/admin/partners';
  const method = id ? 'PUT' : 'POST';
  const res = await adminFetch(url, { method, body: formData });
  if (res.ok) {
    showToast('Партнёр сохранён!');
    closeModal('partnerModal');
    loadPartners();
    document.getElementById('partnerId').value = '';
  }
}

async function deletePartner(id) {
  if (!confirm('Удалить партнёра?')) return;
  const res = await adminFetch(`/api/admin/partners/${id}`, { method: 'DELETE' });
  if (res.ok) { showToast('Партнёр удалён'); loadPartners(); }
}

// ─── MESSAGES ─────────────────────────────────────────────

async function loadMessages() {
  const res = await adminFetch('/api/admin/messages');
  const data = await res.json();
  const tbody = document.getElementById('msgsTableBody');

  if (!data.items.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-text-muted);">Сообщений нет</td></tr>';
    return;
  }

  tbody.innerHTML = data.items.map(m => `
    <tr style="${!m.is_read ? 'background:rgba(245,197,24,0.03)' : ''}">
      <td><strong>${esc(m.name)}</strong></td>
      <td><a href="mailto:${esc(m.email)}" style="color:var(--color-gold);">${esc(m.email)}</a></td>
      <td style="max-width:300px;font-size:0.85rem;color:var(--color-text-muted);">${esc(m.message.substring(0,120))}${m.message.length > 120 ? '...' : ''}</td>
      <td style="font-size:0.8rem;color:var(--color-text-dim);">${new Date(m.created_at).toLocaleDateString('ru-RU')}</td>
      <td><span class="badge ${m.is_read ? 'badge-muted' : 'badge-gold'}">${m.is_read ? 'Прочитано' : 'Новое'}</span></td>
      <td style="display:flex;gap:0.5rem;">
        ${!m.is_read ? `<button class="btn btn-ghost" style="padding:0.35rem 0.75rem;font-size:0.8rem;" onclick="markRead(${m.id})">✓ Прочитано</button>` : ''}
        <button class="btn btn-danger" style="padding:0.35rem 0.75rem;font-size:0.8rem;" onclick="deleteMessage(${m.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

async function markRead(id) {
  await adminFetch(`/api/admin/messages/${id}/read`, { method: 'PUT' });
  loadMessages();
}

async function deleteMessage(id) {
  if (!confirm('Удалить сообщение?')) return;
  const res = await adminFetch(`/api/admin/messages/${id}`, { method: 'DELETE' });
  if (res.ok) { showToast('Сообщение удалено'); loadMessages(); }
}

// ─── INIT ─────────────────────────────────────────────────

loadDashboard();
