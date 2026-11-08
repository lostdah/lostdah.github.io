/**
 * Huellas al Lodo — Core Site Infrastructure (site.js)
 * ----------------------------------------------------------------------
 * Centralizes shared UI behavior across all 15 pages:
 * 1. Dark Mode toggle & localStorage persistence (+ custom 'huellas:theme-change' event)
 * 2. Collapsible Sidebar drawer, backdrop & Escape key handling
 * 3. Active navigation link & sidebar page highlighting
 * 4. Universal Back-to-Top button (works on window scroll AND inside body.dev-mobile-sim)
 * 5. Unified mobile viewport detection: window.isHuellasMobileViewport()
 */
(function () {
  // 1. Unified Mobile Viewport Helper (True Mobile OR Dev Mobile Sim)
  window.isHuellasMobileViewport = function () {
    return document.body.classList.contains('dev-mobile-sim') || window.innerWidth <= 768;
  };

  // Page -> Top Nav Group mapping
  const PAGE_META = {
    'index.html':                { page: 'inicio',               group: 'inicio' },
    '':                          { page: 'inicio',               group: 'inicio' },
    'antecedentes.html':         { page: 'antecedentes',         group: 'inicio' },
    'terreno.html':              { page: 'terreno',              group: 'inicio' },
    'hallazgos.html':            { page: 'hallazgos',            group: 'inicio' },
    'problema.html':             { page: 'problema',             group: 'inicio' },
    'requerimientos.html':       { page: 'requerimientos',       group: 'inicio' },
    'solucion.html':             { page: 'solucion',             group: 'solucion' },
    'lluvia-de-ideas.html':      { page: 'lluvia-de-ideas',      group: 'solucion' },
    'propuesta-conceptual.html': { page: 'propuesta-conceptual', group: 'solucion' },
    'prototipado.html':          { page: 'prototipado',          group: 'solucion' },
    'reportar.html':             { page: 'reportar',             group: 'solucion' },
    'propuesta-final.html':      { page: 'propuesta-final',      group: 'solucion' },
    'blogs.html':                { page: 'blogs',                group: 'blogs' },
    'bibliografia.html':         { page: 'bibliografia',         group: 'bibliografia' },
    'quienes-somos.html':        { page: 'quienes-somos',        group: 'quienes-somos' }
  };

  function initSiteUI() {
    // ----- A. Dark Mode -----
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (localStorage.getItem('dark-mode') === 'enabled') {
      document.body.classList.add('dark-mode');
      if (darkModeToggle) darkModeToggle.innerHTML = '&#9728;&#65039;';
    }
    if (darkModeToggle) {
      darkModeToggle.addEventListener('click', (e) => {
        e.preventDefault();
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('dark-mode', isDark ? 'enabled' : 'disabled');
        darkModeToggle.innerHTML = isDark ? '&#9728;&#65039;' : '&#127769;';
        window.dispatchEvent(new CustomEvent('huellas:theme-change', { detail: { darkMode: isDark } }));
      });
    }

    // ----- B. Collapsible Sidebar -----
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const menuToggle = document.getElementById('menuToggle');
    const sidebarClose = document.getElementById('sidebarClose');

    function openSidebar() {
      const topOffset = document.body.classList.contains('dev-mobile-sim')
        ? (document.body.scrollTop || 0) + 'px'
        : '';
      if (sidebar) {
        sidebar.style.top = topOffset;
        sidebar.classList.add('open');
      }
      if (backdrop) {
        backdrop.style.top = topOffset;
        backdrop.classList.add('show');
      }
    }
    function closeSidebar() {
      if (sidebar) {
        sidebar.classList.remove('open');
        sidebar.style.top = '';
      }
      if (backdrop) {
        backdrop.classList.remove('show');
        backdrop.style.top = '';
      }
    }

    if (menuToggle) menuToggle.addEventListener('click', openSidebar);
    if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSidebar();
    });

    // ----- C. Active Navigation Highlighting -----
    const rawFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const meta = PAGE_META[rawFile] || {
      page: document.body.dataset.page || 'inicio',
      group: document.body.dataset.group || 'inicio'
    };

    document.querySelectorAll('.nav-links a[data-group]').forEach(a => {
      a.classList.toggle('active', a.dataset.group === meta.group);
    });
    document.querySelectorAll('.sidebar .sb-link[data-page]').forEach(a => {
      a.classList.toggle('current', a.dataset.page === meta.page);
    });

    // ----- D. Universal Back-to-Top Button (Desktop + Dev Mobile Sim) -----
    let backToTopBtn = document.getElementById('backToTopBtn');
    if (!backToTopBtn && document.querySelector('.top-nav')) {
      backToTopBtn = document.createElement('button');
      backToTopBtn.id = 'backToTopBtn';
      backToTopBtn.className = 'back-to-top';
      backToTopBtn.type = 'button';
      backToTopBtn.title = 'Volver arriba';
      backToTopBtn.setAttribute('aria-label', 'Volver arriba');
      backToTopBtn.innerHTML = '&uarr; Volver arriba';
      document.body.appendChild(backToTopBtn);
    }

    if (backToTopBtn) {
      function getScrollOffset() {
        if (document.body.classList.contains('dev-mobile-sim')) {
          return Math.max(document.body.scrollTop || 0, window.scrollY || 0);
        }
        return window.scrollY || document.documentElement.scrollTop || 0;
      }

      function syncBackToTopVisibility() {
        backToTopBtn.classList.toggle('visible', getScrollOffset() > 320);
      }

      window.addEventListener('scroll', syncBackToTopVisibility, { passive: true });
      document.body.addEventListener('scroll', syncBackToTopVisibility, { passive: true });
      window.addEventListener('huellas:viewport-change', syncBackToTopVisibility);

      backToTopBtn.addEventListener('click', () => {
        if (document.body.classList.contains('dev-mobile-sim') && document.body.scrollTop > 0) {
          document.body.scrollTo({ top: 0, behavior: 'smooth' });
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      syncBackToTopVisibility();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSiteUI);
  } else {
    initSiteUI();
  }
})();
