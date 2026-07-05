/* ═══════════════════════════════════════════════════════════
   MAIN.JS — i18n, Navbar, Scroll animations
   ═══════════════════════════════════════════════════════════ */

// ─── i18n ─────────────────────────────────────────────────

let currentLang = localStorage.getItem('fifusa-lang') || 'ru';
let translations = {};

async function loadTranslations(lang) {
  if (translations[lang]) return translations[lang];
  try {
    const res = await fetch(`/i18n/${lang}.json`);
    translations[lang] = await res.json();
  } catch {
    translations[lang] = {};
  }
  return translations[lang];
}

function t(key) {
  const keys = key.split('.');
  let val = translations[currentLang];
  for (const k of keys) val = val?.[k];
  return val || key;
}

async function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('fifusa-lang', lang);
  await loadTranslations(lang);
  applyTranslations();
  updateLangButtons();
  // Notify other scripts (e.g. news.js)
  document.dispatchEvent(new CustomEvent('fifusa:langchange', { detail: { lang } }));
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const val = t(el.dataset.i18n);
    if (val && val !== el.dataset.i18n) {
      // Use innerHTML if translation contains HTML tags, textContent otherwise
      if (/<[a-z][\s\S]*>/i.test(val)) {
        el.innerHTML = val;
      } else {
        el.textContent = val;
      }
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const val = t(el.dataset.i18nPlaceholder);
    if (val) el.placeholder = val;
  });
}


function updateLangButtons() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });
}

// ─── NAVBAR ───────────────────────────────────────────────

function initNavbar() {
  const navbar = document.querySelector('.navbar');
  const toggle = document.getElementById('mobileToggle');
  const nav = document.getElementById('navMenu');

  // Scroll glass effect — apply 'scrolled' after 30px
  const applyScroll = () => {
    navbar?.classList.toggle('scrolled', window.scrollY > 30);
  };
  window.addEventListener('scroll', applyScroll, { passive: true });
  applyScroll(); // run once on load for inner pages that start scrolled

  // Mobile toggle
  toggle?.addEventListener('click', () => {
    nav?.classList.toggle('open');
    // Animate hamburger lines
    const spans = toggle.querySelectorAll('span');
    const isOpen = nav?.classList.contains('open');
    if (spans[0]) spans[0].style.transform = isOpen ? 'rotate(45deg) translate(5px, 5px)' : '';
    if (spans[1]) spans[1].style.opacity = isOpen ? '0' : '';
    if (spans[2]) spans[2].style.transform = isOpen ? 'rotate(-45deg) translate(5px, -5px)' : '';
  });

  // Close nav on link click (mobile)
  nav?.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
    });
  });

  // Active link highlight
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    const isHome = path === '/' && href === '/';
    const isMatch = href !== '/' && path.startsWith(href.replace('.html', ''));
    if (isHome || isMatch) link.classList.add('active');
  });

  // Lang buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });
}

// ─── SCROLL REVEAL ────────────────────────────────────────

let revealObserver;

function initScrollReveal() {
  revealObserver = new IntersectionObserver(
    (entries) => entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        revealObserver.unobserve(e.target);
      }
    }),
    { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
}

// Call this after dynamic content is injected
function observeNewRevealElements() {
  document.querySelectorAll('.reveal:not(.visible)').forEach(el => {
    revealObserver?.observe(el);
  });
}

// ─── DATE FORMAT ──────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const locale = { ru: 'ru-RU', en: 'en-US', es: 'es-ES' }[currentLang] || 'ru-RU';
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ─── API HELPERS ──────────────────────────────────────────

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── INIT ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadTranslations(currentLang);
  initNavbar();
  applyTranslations();
  updateLangButtons();
  initScrollReveal();
  // Signal that FIFUSA is fully initialised and translations are ready
  document.dispatchEvent(new CustomEvent('fifusa:ready', { detail: { lang: currentLang } }));
});

// ─── EXPORT ───────────────────────────────────────────────

window.FIFUSA = {
  t,
  setLanguage,
  formatDate,
  apiFetch,
  getCurrentLang: () => currentLang,
  observeNewRevealElements,
};
