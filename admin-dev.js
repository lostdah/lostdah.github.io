/**
 * Huellas al Lodo - Herramienta de Administración y Desarrollo (Dev Tool)
 * ----------------------------------------------------------------------
 * - Código Konami (↑ ↑ ↓ ↓ ← → ← → B A) en escritorio o sacudir/mover la pantalla
 *   arriba y abajo rápidamente por 4 segundos en móvil (o en Vista Móvil de Admin).
 * - Validación por hash criptográfico SHA-256 de la contraseña.
 * - Persistencia de sesión (sessionStorage) compartida en todas las páginas.
 * - Indicador discreto "(modo admin)" en rojo en el navbar junto al dark mode.
 * - Ctrl + M: Alterna la disposición móvil simulada en CUALQUIER página del sitio.
 * - Ctrl + S: Cierra la sesión de administrador desde cualquier página.
 * - Terminal retro interactivo estilo Linux Ubuntu (quiltro@huellas:~$) con herramientas
 *   completas de inspección, debugging de DOM/Storage/Console, telemetría y Firebase.
 */

(function () {
  // =========================================================================
  // PARÁMETRO DE SENSIBILIDAD PARA SACUDIR PANTALLA EN MÓVIL (4 SEGUNDOS)
  // =========================================================================
  // Cambia SHAKE_DIFFICULTY para ajustar qué tan fuerte/rápido hay que mover
  // la pantalla arriba y abajo durante 4 segundos para abrir la consola:
  //   - 0.5 = Más suave / fácil
  //   - 1.0 = Normal (por defecto)
  //   - 1.8 = Más duro / requiere mover mucho más rápido
  const MOBILE_SHAKE_CONFIG = {
    SHAKE_DIFFICULTY: 1.0,       // <-- CAMBIA ESTE PARÁMETRO A TU GUSTO (ej. 0.5 suave, 1.0 normal, 2.0 duro)
    DURATION_MS: 4000,           // Duración moviendo arriba y abajo (4000 ms = 4 segundos)
    BASE_STEP_PX: 10,            // Píxeles por tick (40ms) para considerar un movimiento rápido (escala con SHAKE_DIFFICULTY)
    BASE_MIN_DELTA_PX: 12,       // Recorrido vertical mínimo para confirmar un giro arriba<->abajo (px)
    REVERSAL_WINDOW_MS: 1500     // Tiempo máximo permitido entre cambios de dirección (arriba<->abajo)
  };
  window.HUELLAS_SHAKE_CONFIG = MOBILE_SHAKE_CONFIG;

  // Split-hash verification (v2):
  // - ADMIN_VERIFY_HASH verifies the password ('huellas-verify-v2:' + pwd)
  // - ADMIN_TOKEN_CHECK_HASH validates the derived API token ('huellas-token-check-v2:' + token)
  // Neither the plaintext password nor the API token itself is stored in source code.
  const ADMIN_VERIFY_HASH = '04bdb1628931672d470612ca04ea1f58026aaa7516267c51c2593cf11b0a89c8';
  const ADMIN_TOKEN_CHECK_HASH = '1899e27ac89d9aa6af3b58cefacbb3d3f913c5cb71929c4db65d351a9bd6dc38';

  // Pure-JS synchronous SHA-256 (works everywhere, including non-HTTPS LAN origins)
  function sha256HexSync(ascii) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    const bytes = Array.from(new TextEncoder().encode(String(ascii)));
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);
    const W = new Array(64);
    const rotr = (n, x) => (x >>> n) | (x << (32 - n));
    for (let i = 0; i < bytes.length; i += 64) {
      for (let t = 0; t < 16; t++) {
        W[t] = ((bytes[i + t * 4] << 24) | (bytes[i + t * 4 + 1] << 16) | (bytes[i + t * 4 + 2] << 8) | bytes[i + t * 4 + 3]) >>> 0;
      }
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3);
        const s1 = rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
        const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + temp1) >>> 0;
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(v => v.toString(16).padStart(8, '0')).join('');
  }

  // =========================================================================
  // 1. INTERCEPTORES GLOBALES DE DEBUGGING (Console, Errores y Firebase Sync)
  // =========================================================================
  const terminalConsoleBuffer = [];
  const MAX_CONSOLE_BUFFER = 250;

  // Interceptar console.log, info, warn, error
  const consoleLevels = ['log', 'info', 'warn', 'error'];
  consoleLevels.forEach(lvl => {
    const orig = console[lvl];
    console[lvl] = function (...args) {
      try {
        const timeStr = new Date().toTimeString().split(' ')[0];
        const formatted = args.map(a => {
          if (a === null) return 'null';
          if (a === undefined) return 'undefined';
          if (typeof a === 'object') {
            try { return JSON.stringify(a); } catch (_) { return String(a); }
          }
          return String(a);
        }).join(' ');
        terminalConsoleBuffer.push({
          time: timeStr,
          level: lvl,
          text: formatted
        });
        if (terminalConsoleBuffer.length > MAX_CONSOLE_BUFFER) {
          terminalConsoleBuffer.shift();
        }
      } catch (_) {}
      if (orig) orig.apply(console, args);
    };
  });

  // Capturar errores no controlados y promesas rechazadas
  window.addEventListener('error', (event) => {
    try {
      const timeStr = new Date().toTimeString().split(' ')[0];
      const srcFile = event.filename ? event.filename.split('/').pop().split('?')[0] : 'inline';
      terminalConsoleBuffer.push({
        time: timeStr,
        level: 'error',
        text: `Uncaught Error: ${event.message} (${srcFile}:${event.lineno}:${event.colno})`
      });
      if (terminalConsoleBuffer.length > MAX_CONSOLE_BUFFER) terminalConsoleBuffer.shift();
    } catch (_) {}
  });

  window.addEventListener('unhandledrejection', (event) => {
    try {
      const timeStr = new Date().toTimeString().split(' ')[0];
      const msg = event.reason ? (event.reason.message || String(event.reason)) : 'Unknown rejection';
      terminalConsoleBuffer.push({
        time: timeStr,
        level: 'error',
        text: `Unhandled Promise Rejection: ${msg}`
      });
      if (terminalConsoleBuffer.length > MAX_CONSOLE_BUFFER) terminalConsoleBuffer.shift();
    } catch (_) {}
  });

  // Interceptar fetch para registrar sincronizaciones en tiempo real con Firebase
  window.__HUELLAS_LAST_FIREBASE_SYNC = window.__HUELLAS_LAST_FIREBASE_SYNC || null;
  window.__HUELLAS_FIREBASE_URL = window.__HUELLAS_FIREBASE_URL || null;

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
    if (url && (url.includes('firebaseio.com') || url.includes('/huellas_state'))) {
      if (!window.__HUELLAS_FIREBASE_URL && url.includes('firebaseio.com')) {
        try {
          const u = new URL(url);
          window.__HUELLAS_FIREBASE_URL = u.origin;
        } catch (_) {}
      }
      try {
        const resp = await origFetch.apply(this, args);
        if (resp && (resp.ok || resp.status < 400)) {
          window.__HUELLAS_LAST_FIREBASE_SYNC = Date.now();
        }
        return resp;
      } catch (err) {
        throw err;
      }
    }
    return origFetch.apply(this, args);
  };

  // =========================================================================
  // 2. ESTADO DE ADMINISTRACIÓN Y VISTA MÓVIL
  // =========================================================================
  window.getHuellasAdminToken = function () {
    const tok = sessionStorage.getItem('HUELLAS_ADMIN_TOKEN') || '';
    if (!tok || tok.length !== 64) return '';
    if (sha256HexSync('huellas-token-check-v2:' + tok) === ADMIN_TOKEN_CHECK_HASH) {
      return tok;
    }
    return '';
  };

  window.isHuellasAdmin = function () {
    return sessionStorage.getItem('HUELLAS_ADMIN_SESSION') === 'true' && Boolean(window.getHuellasAdminToken());
  };

  async function verifyAdminPassword(pwd) {
    if (!pwd || typeof pwd !== 'string') return false;
    const hash = sha256HexSync('huellas-verify-v2:' + pwd);
    return hash === ADMIN_VERIFY_HASH;
  }

  function syncNavbarAdminTag() {
    const darkToggle = document.getElementById('darkModeToggle');
    let navTag = document.getElementById('navbarAdminTag');

    if (!navTag && darkToggle) {
      navTag = document.createElement('span');
      navTag.id = 'navbarAdminTag';
      navTag.className = 'nav-admin-tag';
      navTag.textContent = '(modo admin)';
    }

    if (navTag && darkToggle) {
      if (darkToggle.nextElementSibling !== navTag) {
        darkToggle.insertAdjacentElement('afterend', navTag);
      }
    }
  }

  let lastToggleTimestamp = 0;
  function toggleMobileDevView() {
    if (!window.isHuellasAdmin()) return;
    const now = Date.now();
    if (now - lastToggleTimestamp < 350) return;
    lastToggleTimestamp = now;

    const isCurrentlyMobile = document.body.classList.contains('dev-mobile-sim');
    const makeMobile = !isCurrentlyMobile;

    if (makeMobile) {
      document.body.classList.add('dev-mobile-sim');
      sessionStorage.setItem('HUELLAS_DEV_MOBILE_VIEW', 'true');
      if (typeof window.applyLayoutDisposition === 'function') {
        window.applyLayoutDisposition('mobile-qr');
      }
    } else {
      document.body.classList.remove('dev-mobile-sim');
      sessionStorage.setItem('HUELLAS_DEV_MOBILE_VIEW', 'false');
      if (typeof window.applyLayoutDisposition === 'function') {
        window.applyLayoutDisposition(window.innerWidth <= 768 ? 'mobile-qr' : 'map-first');
      }
    }
    window.dispatchEvent(new CustomEvent('huellas:viewport-change', { detail: { mobileSim: makeMobile } }));
  }

  function syncDevViewState() {
    const isAdmin = window.isHuellasAdmin();

    if (isAdmin) {
      document.body.classList.add('is-admin-mode');
    } else {
      document.body.classList.remove('is-admin-mode');
    }

    syncNavbarAdminTag();

    if (isAdmin && sessionStorage.getItem('HUELLAS_DEV_MOBILE_VIEW') === 'true') {
      document.body.classList.add('dev-mobile-sim');
      if (typeof window.applyLayoutDisposition === 'function') {
        window.applyLayoutDisposition('mobile-qr');
      }
    } else {
      document.body.classList.remove('dev-mobile-sim');
      if (typeof window.applyLayoutDisposition === 'function') {
        window.applyLayoutDisposition(window.innerWidth <= 768 ? 'mobile-qr' : 'map-first');
      }
    }

    if (typeof window.renderReportsFeed === 'function') {
      window.renderReportsFeed();
    }
    window.dispatchEvent(new CustomEvent('huellas:viewport-change', {
      detail: { mobileSim: document.body.classList.contains('dev-mobile-sim') }
    }));
  }

  function exitAdminMode() {
    sessionStorage.removeItem('HUELLAS_ADMIN_SESSION');
    sessionStorage.removeItem('HUELLAS_ADMIN_TOKEN');
    sessionStorage.removeItem('HUELLAS_DEV_MOBILE_VIEW');
    sessionStorage.removeItem('HUELLAS_SHOW_SHAKE_BAR');
    const bar = document.getElementById('huellasShakeProgressBar');
    if (bar) bar.remove();
    cachedProjectFiles = null;
    document.body.classList.remove('is-admin-mode');
    document.body.classList.remove('dev-mobile-sim');
    syncDevViewState();
  }
  window.huellasExitAdmin = exitAdminMode;

  // =========================================================================
  // 3. TERMINAL RETRO LINUX UBUNTU (quiltro@huellas)
  // =========================================================================
  let isPasswordPrompt = false;
  let commandHistory = [];
  try {
    const savedHist = sessionStorage.getItem('HUELLAS_TERM_HISTORY');
    if (savedHist) {
      const parsedHist = JSON.parse(savedHist);
      if (Array.isArray(parsedHist)) commandHistory = parsedHist;
    }
  } catch (_) {}
  let historyIndex = -1;
  let pendingSudoCommand = null;

  function saveTerminalOutputState() {
    try {
      const outputDiv = document.getElementById('linuxTermOutput');
      if (!outputDiv) return;
      while (outputDiv.children.length > 80) {
        outputDiv.removeChild(outputDiv.firstElementChild);
      }
      sessionStorage.setItem('HUELLAS_TERM_OUTPUT', outputDiv.innerHTML);
    } catch (_) {}
  }

  function saveCommandHistoryState() {
    try {
      sessionStorage.setItem('HUELLAS_TERM_HISTORY', JSON.stringify(commandHistory.slice(-100)));
    } catch (_) {}
  }

  // Archivos del sistema con permisos exclusivos de administrador (root)
  const ADMIN_RESTRICTED_FILES = [
    '.env',
    '.env.example',
    'reports_store.json',
    'backend.py',
    'main.py',
    'obfuscate_key.py',
    'admin-dev.js',
    '.gitignore',
    '.nojekyll'
  ];

  function isFileAdminRestricted(fileName) {
    if (!fileName) return false;
    const clean = fileName.replace(/^(\.\/|\/)/, '').trim().toLowerCase();
    return ADMIN_RESTRICTED_FILES.some(f => clean === f.toLowerCase() || clean.endsWith('/' + f.toLowerCase()));
  }

  // Sanitizador de JSON para colapsar streams binarios Base64 gigantes en la terminal
  function sanitizeJsonForDisplay(obj) {
    if (typeof obj === 'string') {
      if (obj.startsWith('data:image/') || (obj.startsWith('data:') && obj.includes(';base64,'))) {
        const mime = obj.slice(5, obj.indexOf(';')) || 'image';
        const sizeKB = (obj.length * 0.75 / 1024).toFixed(1);
        return `<binary image stream: ${mime} (~${sizeKB} KB)>`;
      }
      if (obj.length > 250 && /^[A-Za-z0-9+/=]+$/.test(obj.slice(0, 100))) {
        const sizeKB = (obj.length * 0.75 / 1024).toFixed(1);
        return `<raw base64 payload (~${sizeKB} KB)>`;
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitizeJsonForDisplay);
    }
    if (obj !== null && typeof obj === 'object') {
      const res = {};
      for (const k in obj) {
        res[k] = sanitizeJsonForDisplay(obj[k]);
      }
      return res;
    }
    return obj;
  }

  function ensureLinuxTerminalInDOM() {
    if (document.getElementById('linuxTerminalWindow')) return;
    const termDiv = document.createElement('div');
    termDiv.id = 'linuxTerminalWindow';
    termDiv.className = 'linux-terminal-window';
    termDiv.style.display = 'none';
    termDiv.innerHTML = `
      <div class="linux-terminal-titlebar" id="linuxTermTitlebar">
        <div class="linux-terminal-buttons">
          <button type="button" class="linux-btn linux-close" id="linuxTermCloseBtn" title="Cerrar (exit)">
            <svg viewBox="0 0 10 10" width="7" height="7"><path d="M1 1 L9 9 M9 1 L1 9" stroke="#333" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>
          <button type="button" class="linux-btn linux-min" id="linuxTermMinBtn" title="Minimizar">
            <svg viewBox="0 0 10 10" width="7" height="7"><path d="M1 5 L9 5" stroke="#333" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>
          <button type="button" class="linux-btn linux-max" id="linuxTermMaxBtn" title="Maximizar">
            <svg viewBox="0 0 10 10" width="7" height="7"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="#333" stroke-width="1.4"/></svg>
          </button>
        </div>
        <div class="linux-terminal-title" id="linuxTermTitle">quiltro@huellas: ~</div>
      </div>
      <div class="linux-terminal-body" id="linuxTermBody">
        <div id="linuxTermOutput"></div>
        <div class="linux-prompt-line" id="linuxPromptRow">
          <span class="linux-prompt-text" id="linuxPromptText">
            <span class="user-host">quiltro@huellas</span><span class="colon">:</span><span class="path">~</span><span class="symbol">$</span>
          </span>
          <span class="linux-input-container">
            <input type="text" id="linuxTermInput" class="linux-term-input" autocomplete="off" spellcheck="false" autofocus>
          </span>
        </div>
      </div>
    `;
    document.documentElement.appendChild(termDiv);

    // Controles de ventana
    document.getElementById('linuxTermCloseBtn').addEventListener('click', closeAdminAuthModal);
    
    let isMinimized = sessionStorage.getItem('HUELLAS_TERM_MINIMIZED') === 'true';
    if (isMinimized) termDiv.classList.add('minimized');
    document.getElementById('linuxTermMinBtn').addEventListener('click', () => {
      isMinimized = !termDiv.classList.contains('minimized');
      termDiv.classList.toggle('minimized', isMinimized);
      sessionStorage.setItem('HUELLAS_TERM_MINIMIZED', isMinimized ? 'true' : 'false');
    });

    let isMaximized = sessionStorage.getItem('HUELLAS_TERM_MAXIMIZED') === 'true';
    if (isMaximized) termDiv.classList.add('maximized');
    document.getElementById('linuxTermMaxBtn').addEventListener('click', () => {
      isMaximized = !termDiv.classList.contains('maximized');
      termDiv.classList.toggle('maximized', isMaximized);
      sessionStorage.setItem('HUELLAS_TERM_MAXIMIZED', isMaximized ? 'true' : 'false');
    });

    // Restaurar salida persistida entre cambios de página
    const savedOut = sessionStorage.getItem('HUELLAS_TERM_OUTPUT');
    const outputDiv = document.getElementById('linuxTermOutput');
    if (savedOut && outputDiv) {
      outputDiv.innerHTML = savedOut;
    }

    // Clic en el cuerpo de la terminal enfoca el input
    document.getElementById('linuxTermBody').addEventListener('click', () => {
      const input = document.getElementById('linuxTermInput');
      if (input) input.focus();
    });

    // Manejo de comandos (Enter, Historial con Flechas, Tab)
    const input = document.getElementById('linuxTermInput');
    input.addEventListener('keydown', handleTerminalKey);

    // Efecto Parallax suave al hacer scroll
    let lastScrollY = window.scrollY;
    let parallaxTimer = null;
    window.addEventListener('scroll', () => {
      if (termDiv.style.display === 'none') return;
      const deltaY = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      const lag = Math.max(-12, Math.min(12, deltaY * 0.18));
      termDiv.style.transform = `translateY(${lag}px)`;
      clearTimeout(parallaxTimer);
      parallaxTimer = setTimeout(() => {
        if (termDiv) termDiv.style.transform = 'translateY(0px)';
      }, 120);
    }, { passive: true });
  }

  function getPromptHtml() {
    const isRoot = window.isHuellasAdmin();
    if (isPasswordPrompt) {
      return `<span style="color:#ffffff;font-weight:bold;">[sudo] password for quiltro: </span>`;
    }
    if (isRoot) {
      return `<span class="user-host root">root@huellas</span><span class="colon">:</span><span class="path">~</span><span class="symbol">#</span> `;
    }
    return `<span class="user-host">quiltro@huellas</span><span class="colon">:</span><span class="path">~</span><span class="symbol">$</span> `;
  }

  function updatePromptDisplay() {
    const promptTextEl = document.getElementById('linuxPromptText');
    const titleEl = document.getElementById('linuxTermTitle');
    const input = document.getElementById('linuxTermInput');
    const isRoot = window.isHuellasAdmin();

    if (titleEl) {
      titleEl.textContent = isRoot ? 'root@huellas: ~' : 'quiltro@huellas: ~';
    }
    if (promptTextEl) {
      promptTextEl.innerHTML = getPromptHtml();
    }
    if (input) {
      input.type = isPasswordPrompt ? 'password' : 'text';
    }
  }

  function quoteLinuxInTextNodes(rootEl) {
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (node.nodeValue && /linux/i.test(node.nodeValue)) {
        node.nodeValue = node.nodeValue.replace(/(?<!["'])\b(linux)\b(?!["'])/gi, '"$1"');
      }
    });
  }

  function appendTerminalLine(contentHtml, isOutput = false) {
    const outputDiv = document.getElementById('linuxTermOutput');
    const body = document.getElementById('linuxTermBody');
    if (!outputDiv) return;

    const line = document.createElement('div');
    line.className = isOutput ? 'term-line output' : 'term-line';
    line.innerHTML = contentHtml;
    quoteLinuxInTextNodes(line);
    outputDiv.appendChild(line);
    saveTerminalOutputState();

    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }

  async function handleTerminalKey(e) {
    const input = document.getElementById('linuxTermInput');
    if (!input) return;

    // 1. Tecla Escape o Alt + T: cerrar terminal
    const isAltT = e.altKey && !e.ctrlKey && !e.metaKey && ((e.key && e.key.toLowerCase() === 't') || e.code === 'KeyT' || e.keyCode === 84 || e.which === 84);
    if (e.key === 'Escape' || isAltT) {
      e.preventDefault();
      e.stopPropagation();
      closeAdminAuthModal();
      return;
    }

    // 2. Ctrl + C: cancelar comando actual
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.code === 'KeyC')) {
      e.preventDefault();
      const promptHtml = getPromptHtml();
      appendTerminalLine(`${promptHtml}${escapeHtml(input.value)}^C`);
      input.value = '';
      isPasswordPrompt = false;
      updatePromptDisplay();
      return;
    }

    // 3. Ctrl + L: limpiar pantalla (clear)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.code === 'KeyL')) {
      e.preventDefault();
      const outputDiv = document.getElementById('linuxTermOutput');
      if (outputDiv) outputDiv.innerHTML = '';
      saveTerminalOutputState();
      return;
    }

    // 4. Historial con flechas arriba / abajo
    if (!isPasswordPrompt) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
          historyIndex++;
          input.value = commandHistory[commandHistory.length - 1 - historyIndex];
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex > 0) {
          historyIndex--;
          input.value = commandHistory[commandHistory.length - 1 - historyIndex];
        } else if (historyIndex === 0) {
          historyIndex = -1;
          input.value = '';
        }
        return;
      }

      // Autocompletado con Tab para comandos y archivos
      if (e.key === 'Tab') {
        e.preventDefault();
        const raw = input.value;
        const trimmed = raw.trim();
        if (trimmed.toLowerCase().startsWith('cat ') || trimmed.toLowerCase().startsWith('grep ')) {
          const parts = trimmed.split(/\s+/);
          const prefix = (parts[parts.length - 1] || '').toLowerCase();
          const files = await getProjectFiles();
          const match = files.find(f => f.name.toLowerCase().startsWith(prefix));
          if (match) {
            parts[parts.length - 1] = match.name;
            input.value = parts.join(' ');
          }
          return;
        }
        const available = [
          'help', 'sudo', 'login', 'admin', 'logout', 'ls', 'cat', 'grep',
          'dom', 'console', 'storage', 'cookies', 'top', 'whoami', 'pwd',
          'uname', 'date', 'status', 'mobile', 'desktop', 'shake', 'showbar',
          'echo', 'history', 'clr', 'clear', 'exit'
        ];
        if (trimmed) {
          const match = available.find(c => c.startsWith(trimmed.toLowerCase()));
          if (match) input.value = match;
        }
        return;
      }
    }

    // 5. Ejecutar al presionar Enter
    if (e.key === 'Enter') {
      e.preventDefault();
      const rawVal = input.value;
      input.value = '';
      historyIndex = -1;

      // Si estábamos esperando contraseña de sudo / login
      if (isPasswordPrompt) {
        appendTerminalLine(`${getPromptHtml()}${bulletMask(rawVal)}`);
        isPasswordPrompt = false;
        await verifyAndApplyPassword(rawVal);
        updatePromptDisplay();
        return;
      }

      const promptHtml = getPromptHtml();
      appendTerminalLine(`${promptHtml}${escapeHtml(rawVal)}`);

      let trimmed = rawVal.trim();
      if (!trimmed) return;

      // Soporte para !! (repetir último comando) y !n (repetir comando #n)
      if (trimmed === '!!') {
        if (commandHistory.length === 0) {
          appendTerminalLine('<span class="term-error">bash: !!: event not found</span>', true);
          return;
        }
        trimmed = commandHistory[commandHistory.length - 1];
        appendTerminalLine(`<span class="term-dim">${escapeHtml(trimmed)}</span>`, true);
      } else if (/^!\d+$/.test(trimmed)) {
        const idx = parseInt(trimmed.slice(1), 10);
        if (idx >= 1 && idx <= commandHistory.length) {
          trimmed = commandHistory[idx - 1];
          appendTerminalLine(`<span class="term-dim">${escapeHtml(trimmed)}</span>`, true);
        } else {
          appendTerminalLine(`<span class="term-error">bash: ${escapeHtml(trimmed)}: event not found</span>`, true);
          return;
        }
      }

      commandHistory.push(trimmed);
      if (commandHistory.length > 100) commandHistory.shift();
      saveCommandHistoryState();

      await executeLinuxCommand(trimmed);
      updatePromptDisplay();
    }
  }

  function bulletMask(str) {
    return '•'.repeat(str.length);
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => {
      switch (m) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return m;
      }
    });
  }

  function highlightJson(jsonStr) {
    return jsonStr.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      let cls = 'term-json-num';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'term-json-key';
        } else {
          cls = 'term-json-str';
        }
      } else if (/true|false/.test(match)) {
        cls = 'term-json-bool';
      } else if (/null/.test(match)) {
        cls = 'term-dim';
      }
      return `<span class="${cls}">${escapeHtml(match)}</span>`;
    });
  }

  async function verifyAndApplyPassword(pass) {
    const isValid = await verifyAdminPassword(pass);
    if (isValid) {
      const derivedToken = sha256HexSync('huellas-auth-token-v2:' + pass);
      sessionStorage.setItem('HUELLAS_ADMIN_TOKEN', derivedToken);
      sessionStorage.setItem('HUELLAS_ADMIN_SESSION', 'true');
      cachedProjectFiles = null;
      syncDevViewState();
      appendTerminalLine(`<span class="term-success">[sudo] Access granted. Welcome, root user.</span>`, true);
      appendTerminalLine(`<span class="term-info">Modo administrador habilitado (atajos: Alt+T abrir consola, Ctrl+M vista móvil, Ctrl+S salir).</span>`, true);
      if (pendingSudoCommand) {
        const cmdToRun = pendingSudoCommand;
        pendingSudoCommand = null;
        await executeLinuxCommand(cmdToRun);
      }
    } else {
      pendingSudoCommand = null;
      appendTerminalLine(`<span class="term-error">[sudo] 1 incorrect password attempt. Access denied.</span>`, true);
    }
  }

  // Obtener lista de archivos del proyecto (dinámica vía /api/files con fallback completo)
  const FALLBACK_FILES = [
    { name: "uploads", is_dir: true, size: 4096, mtime: 1729500000 },
    { name: ".env", is_dir: false, size: 315, mtime: 1729500000 },
    { name: ".env.example", is_dir: false, size: 173, mtime: 1729500000 },
    { name: "admin-dev.js", is_dir: false, size: 71434, mtime: 1729500000 },
    { name: "site.js", is_dir: false, size: 6617, mtime: 1729500000 },
    { name: "antecedentes.html", is_dir: false, size: 9532, mtime: 1729500000 },
    { name: "backend.py", is_dir: false, size: 24500, mtime: 1729500000 },
    { name: "bibliografia.html", is_dir: false, size: 9593, mtime: 1729500000 },
    { name: "blogs.html", is_dir: false, size: 33245, mtime: 1729500000 },
    { name: "hallazgos.html", is_dir: false, size: 8486, mtime: 1729500000 },
    { name: "honse.html", is_dir: false, size: 20098, mtime: 1729500000 },
    { name: "honse_jumpscare.png", is_dir: false, size: 227750, mtime: 1729500000 },
    { name: "index.html", is_dir: false, size: 11424, mtime: 1729500000 },
    { name: "lluvia-de-ideas.html", is_dir: false, size: 16024, mtime: 1729500000 },
    { name: "logo-perros.png", is_dir: false, size: 46554, mtime: 1729500000 },
    { name: "main.py", is_dir: false, size: 1568, mtime: 1729500000 },
    { name: "peuros.jpg", is_dir: false, size: 280795, mtime: 1729500000 },
    { name: "problema.html", is_dir: false, size: 14466, mtime: 1729500000 },
    { name: "propuesta-conceptual.html", is_dir: false, size: 8962, mtime: 1729500000 },
    { name: "propuesta-final.html", is_dir: false, size: 13233, mtime: 1729500000 },
    { name: "prototipado.html", is_dir: false, size: 10629, mtime: 1729500000 },
    { name: "quienes-somos.html", is_dir: false, size: 7294, mtime: 1729500000 },
    { name: "reportar.html", is_dir: false, size: 84809, mtime: 1729500000 },
    { name: "reports_store.json", is_dir: false, size: 580517, mtime: 1729500000 },
    { name: "requerimientos.html", is_dir: false, size: 8027, mtime: 1729500000 },
    { name: "solucion.html", is_dir: false, size: 31395, mtime: 1729500000 },
    { name: "style.css", is_dir: false, size: 62582, mtime: 1729500000 },
    { name: "terreno.html", is_dir: false, size: 8845, mtime: 1729500000 }
  ];

  let cachedProjectFiles = null;
  async function getProjectFiles() {
    if (cachedProjectFiles) return cachedProjectFiles;
    try {
      const headers = {};
      if (window.isHuellasAdmin()) {
        headers['X-Huellas-Admin-Token'] = window.getHuellasAdminToken();
      }
      const res = await fetch('/api/files', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.files) && data.files.length > 0) {
          cachedProjectFiles = data.files;
          return cachedProjectFiles;
        }
      }
    } catch (_) {}
    cachedProjectFiles = FALLBACK_FILES;
    return cachedProjectFiles;
  }

  function formatFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return '4.0K';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + 'M';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + 'K';
    return bytes + 'B';
  }

  function getFileColorClass(filename, is_dir) {
    if (is_dir) return 'term-dir';
    const ext = filename.split('.').pop().toLowerCase();
    if (['js', 'py', 'sh'].includes(ext)) return 'term-exec';
    if (['html', 'css', 'json', 'md', 'txt', 'env'].includes(ext)) return 'term-file';
    if (['png', 'jpg', 'jpeg', 'wav', 'gif'].includes(ext)) return 'term-archive';
    if (['pdf'].includes(ext)) return 'term-info';
    return 'term-file';
  }

  async function executeLinuxCommand(cmdLine) {
    const parts = cmdLine.split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);

    // Si el usuario escribe la contraseña directamente en el prompt (comparación por hash sin texto plano)
    if (args.length === 0 && (await verifyAdminPassword(parts[0]) || await verifyAdminPassword(cmd))) {
      await verifyAndApplyPassword( (await verifyAdminPassword(parts[0])) ? parts[0] : cmd );
      return;
    }

    switch (cmd) {
      case 'help':
        appendTerminalLine(`
<span class="term-info">GNU bash, version 5.1-huellas (x86_64-pc-"linux"-gnu)</span>
Available commands:
  <span class="term-exec">sudo &lt;cmd&gt;</span>     Execute command with root privileges (or prompt password)
  <span class="term-exec">admin [pass]</span>   Log in as administrator (or prompt password)
  <span class="term-exec">login</span>          Prompt for admin password
  <span class="term-exec">logout</span>         Exit root administrator session
  <span class="term-exec">status</span>         Realtime server, Firebase RTDB sync &amp; client telemetry
  <span class="term-exec">ls [-lStr] [*]</span> List directory contents (sort by size/time, glob filter)
  <span class="term-exec">cat &lt;f&gt; [-n]</span>   Display file contents (JSON syntax, range, context search)
  <span class="term-exec">grep &lt;p&gt; &lt;f&gt;</span>   Search for regex/text patterns in file(s)
  <span class="term-exec">dom &lt;sel&gt;</span>      Inspect DOM elements (visibility, geometry, text)
  <span class="term-exec">console [-ewl]</span> Stream browser console logs, warnings and uncaught errors
  <span class="term-exec">storage [rm]</span>   Inspect/clear localStorage, sessionStorage &amp; cookies
  <span class="term-exec">cookies</span>        List parsed document cookies
  <span class="term-exec">top</span>            Process monitor, JS heap memory &amp; load timings
  <span class="term-exec">echo &lt;$VAR&gt;</span>    Display text and expand environment variables ($USER, $THEME...)
  <span class="term-exec">history [-c]</span>   Display or clear command history (supports !n and !!)
  <span class="term-exec">mobile</span>         Toggle mobile simulation view (Ctrl + M)
  <span class="term-exec">desktop</span>        Switch to desktop view
  <span class="term-exec">shake [val]</span>    View or adjust mobile vertical shake difficulty (default: 1.0)
  <span class="term-exec">showbar</span>        Toggle shake gesture debug progress bar (root only)
  <span class="term-exec">whoami / pwd</span>   Print user and current directory
  <span class="term-exec">uname [-a]</span>     Print system information ("Linux")
  <span class="term-exec">date</span>           Display current date and time
  <span class="term-exec">clr</span>            Clear terminal screen (Ctrl + L)
  <span class="term-exec">exit</span>           Close this terminal window (Esc)
`, true);
        break;

      case 'login':
      case 'admin':
      case 'su':
        if (args.length > 0) {
          if (args[0].toLowerCase() === 'su' || args[0].toLowerCase() === 'admin') {
            if (args[1]) {
              await verifyAndApplyPassword(args[1]);
            } else {
              isPasswordPrompt = true;
            }
          } else {
            await verifyAndApplyPassword(args[0]);
          }
        } else {
          isPasswordPrompt = true;
        }
        break;

      case 'sudo': {
        if (args.length === 0) {
          appendTerminalLine('<span class="term-dim">usage: sudo &lt;command&gt; [args...] (or "sudo su")</span>', true);
          break;
        }

        const subCmd = args[0].toLowerCase();
        if (subCmd === 'su' || subCmd === 'admin') {
          if (args[1]) {
            await verifyAndApplyPassword(args[1]);
          } else {
            isPasswordPrompt = true;
          }
          break;
        }

        // Si ya es root, ejecutar el comando inmediatamente
        if (window.isHuellasAdmin()) {
          await executeLinuxCommand(args.join(' '));
          break;
        }

        // Si no es root, solicitar password y almacenar comando pendiente
        pendingSudoCommand = args.join(' ');
        isPasswordPrompt = true;
        break;
      }

      case 'logout':
        if (window.isHuellasAdmin()) {
          exitAdminMode();
          appendTerminalLine(`<span class="term-info">Session closed for root. Returned to unprivileged mode.</span>`, true);
        } else {
          appendTerminalLine(`<span class="term-dim">quiltro: not currently in admin session.</span>`, true);
        }
        break;

      case 'ls':
      case 'dir': {
        const files = await getProjectFiles();
        let filtered = [...files];

        let isLong = false;
        let sortBySize = false;
        let sortByTime = false;
        let reverseSort = false;
        let globPattern = '';

        for (const a of args) {
          if (a.startsWith('-')) {
            if (a.includes('l')) isLong = true;
            if (a.includes('S')) sortBySize = true;
            if (a.includes('t')) sortByTime = true;
            if (a.includes('r')) reverseSort = true;
          } else {
            globPattern = a;
          }
        }

        // Filtrado por extensión o comodín (*.html, *.css, etc.)
        if (globPattern) {
          const cleanPattern = globPattern.replace(/^\.\//, '');
          if (cleanPattern.includes('*')) {
            const regex = new RegExp('^' + cleanPattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i');
            filtered = filtered.filter(f => regex.test(f.name));
          } else {
            filtered = filtered.filter(f => f.name.toLowerCase().includes(cleanPattern.toLowerCase()));
          }
        }

        // Ordenamiento
        if (sortBySize) {
          filtered.sort((a, b) => (b.size || 0) - (a.size || 0));
        } else if (sortByTime) {
          filtered.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
        }

        if (reverseSort) {
          filtered.reverse();
        }

        if (isLong) {
          const totalKB = Math.round(filtered.reduce((acc, f) => acc + (f.size || 0), 0) / 1024);
          let out = `<div class="term-line" style="white-space:nowrap;"><span class="term-dim">total ${totalKB}</span></div>`;
          out += `<div class="term-line" style="white-space:nowrap;"><span class="term-dir">drwxr-xr-x 2 quiltro quiltro  4096 Oct 21 15:40 ./</span></div>`;
          out += `<div class="term-line" style="white-space:nowrap;"><span class="term-dir">drwxr-xr-x 4 root    root     4096 Oct 21 15:00 ../</span></div>`;
          out += filtered.map(f => {
            const isDir = f.is_dir || f.name.endsWith('/');
            const cleanName = f.name.replace(/\/$/, '');
            const isRestricted = isFileAdminRestricted(cleanName);
            const perm = isDir
              ? (isRestricted ? 'drwx------' : 'drwxr-xr-x')
              : (isRestricted ? '-rw-------' : (['js','py'].some(e => cleanName.endsWith('.' + e)) ? '-rwxr-xr-x' : '-rw-r--r--'));
            const ownerStr = isRestricted
              ? '<span style="color:#ef2929;font-weight:bold;">root    root   </span>'
              : '<span class="term-dim">quiltro quiltro</span>';
            const sizeStr = formatFileSize(f.size).padStart(6, ' ');
            const colorCls = getFileColorClass(cleanName, isDir);
            const disp = cleanName + (isDir ? '/' : '');
            return `<div class="term-line" style="white-space:nowrap;"><span class="term-dim">${perm} 1 </span>${ownerStr} <span class="term-dim">${sizeStr} Oct 21</span> <span class="${colorCls}">${escapeHtml(disp)}</span></div>`;
          }).join('');
          appendTerminalLine(out, true);
        } else {
          // Exactamente un archivo por línea (estilo ls -1) con white-space: nowrap
          const items = filtered.map(f => {
            const isDir = f.is_dir || f.name.endsWith('/');
            const cleanName = f.name.replace(/\/$/, '');
            const isRestricted = isFileAdminRestricted(cleanName);
            const colorCls = getFileColorClass(cleanName, isDir);
            const disp = cleanName + (isDir ? '/' : '');
            const lockBadge = (isRestricted && !window.isHuellasAdmin()) ? ' <span class="term-dim" style="font-size:10.5px; color:#ef2929;">[root-only]</span>' : '';
            return `<div class="term-line" style="white-space:nowrap; margin:1.5px 0;"><span class="${colorCls}">${escapeHtml(disp)}</span>${lockBadge}</div>`;
          }).join('');
          appendTerminalLine(items || '<span class="term-dim">ls: no matching files found.</span>', true);
        }
        break;
      }

      case 'cat': {
        if (args.length === 0) {
          appendTerminalLine(`<span class="term-error">cat: missing file operand. Usage: cat &lt;filename&gt; [-n] [--raw] [start_line] [end_line]</span>`, true);
          break;
        }

        let fileName = '';
        let startLine = 1;
        let endLine = 0;
        let isSearch = false;
        let searchTerm = '';
        let contextLines = 2;
        let isAll = false;
        let isRaw = false;

        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a === '-n') {
            // flag -n para números de línea
          } else if (a === '--raw') {
            isRaw = true;
          } else if (a === '--all' || a === '-a') {
            isAll = true;
          } else if (a === '-C' && args[i + 1] && !isNaN(parseInt(args[i + 1], 10))) {
            contextLines = Math.max(1, parseInt(args[i + 1], 10));
            i++;
          } else if (a.startsWith('-C') && !isNaN(parseInt(a.slice(2), 10))) {
            contextLines = Math.max(1, parseInt(a.slice(2), 10));
          } else if (!fileName) {
            fileName = a;
          } else if (!isNaN(parseInt(a, 10))) {
            if (!endLine && startLine === 1) {
              startLine = Math.max(1, parseInt(a, 10));
            } else {
              endLine = Math.max(startLine, parseInt(a, 10));
            }
          } else if (/^\d+-\d+$/.test(a)) {
            const [s, e] = a.split('-').map(Number);
            startLine = Math.max(1, s);
            endLine = Math.max(startLine, e);
          } else {
            isSearch = true;
            searchTerm = a.toLowerCase();
          }
        }

        if (!fileName) {
          appendTerminalLine(`<span class="term-error">cat: missing filename.</span>`, true);
          break;
        }

        // Verificación de permisos de administrador
        if (isFileAdminRestricted(fileName) && !window.isHuellasAdmin()) {
          appendTerminalLine(
            `<span class="term-error">cat: ${escapeHtml(fileName)}: Permission denied (root privileges required)</span>\n` +
            `<span class="term-dim">Tip: Run 'sudo cat ${escapeHtml(fileName)}' or authenticate using 'admin &lt;password&gt;'.</span>`,
            true
          );
          break;
        }

        if (fileName.toLowerCase().includes('os-release')) {
          appendTerminalLine(`NAME="Huellas OS"\nVERSION="2.4.1 LTS (Noble Quiltro)"\nID=huellas\nID_LIKE=ubuntu\nPRETTY_NAME="Huellas OS 2.4.1 LTS (La Cisterna Node)"\nHOME_URL="https://lostdah.github.io"`, true);
          break;
        }

        const ext = fileName.split('.').pop().toLowerCase();
        if (['png', 'jpg', 'jpeg', 'wav', 'pdf', 'ico', 'mp3', 'webp'].includes(ext)) {
          appendTerminalLine(`<span class="term-dim">cat: ${escapeHtml(fileName)}: binary stream suppressed (use browser view).</span>`, true);
          break;
        }

        try {
          const fetchUrl = fileName.startsWith('/') ? fileName : '/' + fileName;
          const fetchHeaders = {};
          if (window.isHuellasAdmin()) {
            fetchHeaders['X-Huellas-Admin-Token'] = window.getHuellasAdminToken();
          }
          const resp = await fetch(fetchUrl, { headers: fetchHeaders });
          if (!resp.ok) {
            appendTerminalLine(`<span class="term-error">cat: ${escapeHtml(fileName)}: No such file or directory</span>`, true);
            break;
          }
          let rawCode = await resp.text();

          // Detección y formateo con pretty-print de JSON colapsando datos binarios base64
          const isJson = ext === 'json' || fileName.toLowerCase().includes('.json');
          if (isJson) {
            try {
              const parsed = JSON.parse(rawCode);
              const sanitized = isRaw ? parsed : sanitizeJsonForDisplay(parsed);
              rawCode = JSON.stringify(sanitized, null, 2);
            } catch (_) {}
          }

          const allLines = rawCode.split('\n');
          const total = allLines.length;

          if (!endLine) {
            endLine = isAll ? total : (startLine > 1 ? Math.min(total, startLine + 50) : Math.min(total, 50));
          }

          if (isSearch) {
            const matches = [];
            for (let i = 0; i < total; i++) {
              if (allLines[i].toLowerCase().includes(searchTerm)) {
                matches.push(i + 1);
              }
            }
            if (matches.length === 0) {
              appendTerminalLine(`<span class="term-dim">cat: pattern "${escapeHtml(searchTerm)}" not found in ${escapeHtml(fileName)}.</span>`, true);
              break;
            }
            appendTerminalLine(`<span class="term-info">--- [ ${escapeHtml(fileName)} : matches for "${escapeHtml(searchTerm)}" (${matches.length} found, context ±${contextLines}) ] ---</span>`, true);
            const displayed = new Set();
            for (const lineNum of matches.slice(0, 15)) {
              for (let c = Math.max(1, lineNum - contextLines); c <= Math.min(total, lineNum + contextLines); c++) {
                displayed.add(c);
              }
            }
            const sortedIndices = Array.from(displayed).sort((a,b) => a - b);
            let prev = 0;
            const outputLines = [];
            for (const idx of sortedIndices) {
              if (prev && idx > prev + 1) outputLines.push(`<span class="term-dim">...</span>`);
              prev = idx;
              const numStr = idx.toString().padStart(4, ' ');
              let lineText = escapeHtml(allLines[idx - 1]);
              if (isJson) lineText = highlightJson(allLines[idx - 1]);
              const isMatch = allLines[idx - 1].toLowerCase().includes(searchTerm);
              if (isMatch) {
                outputLines.push(`<span class="term-dim">${numStr} | </span><span style="background:rgba(233,84,32,0.35); color:#fff; font-weight:bold;">${lineText}</span>`);
              } else {
                outputLines.push(`<span class="term-dim">${numStr} | </span><span>${lineText}</span>`);
              }
            }
            appendTerminalLine(outputLines.join('\n'), true);
            break;
          }

          appendTerminalLine(`<span class="term-info">--- [ ${escapeHtml(fileName)} | lines ${startLine} - ${endLine} of ${total} ] ---</span>`, true);
          const sliceLines = [];
          for (let i = startLine; i <= endLine; i++) {
            const numStr = i.toString().padStart(4, ' ');
            let lineText = escapeHtml(allLines[i - 1]);
            if (isJson) {
              lineText = highlightJson(allLines[i - 1]);
            }
            sliceLines.push(`<span class="term-dim">${numStr} | </span><span>${lineText}</span>`);
          }
          appendTerminalLine(sliceLines.join('\n'), true);

          if (endLine < total && !isAll) {
            appendTerminalLine(`<span class="term-dim">... [Showing lines ${startLine}-${endLine} of ${total}. Use 'cat ${escapeHtml(fileName)} ${endLine + 1} ${Math.min(total, endLine + 50)}' or 'cat ${escapeHtml(fileName)} --all']</span>`, true);
          }
        } catch (err) {
          appendTerminalLine(`<span class="term-error">cat: error reading ${escapeHtml(fileName)}: ${escapeHtml(err.message)}</span>`, true);
        }
        break;
      }

      case 'grep': {
        if (args.length === 0) {
          appendTerminalLine('<span class="term-error">grep: missing pattern. Usage: grep [-i] &lt;pattern&gt; &lt;file(s)...&gt;</span>', true);
          break;
        }
        let isCaseInsensitive = true;
        let targetPattern = '';
        let fileTargets = [];

        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a === '-i') {
            isCaseInsensitive = true;
          } else if (a.startsWith('-')) {
            // ignorar flags desconocidas
          } else if (!targetPattern) {
            targetPattern = a.replace(/^['"]|['"]$/g, '');
          } else {
            fileTargets.push(a);
          }
        }

        if (!targetPattern) {
          appendTerminalLine('<span class="term-error">grep: missing search pattern.</span>', true);
          break;
        }

        if (fileTargets.length === 0) {
          fileTargets = ['style.css'];
        }

        const allProjectFiles = await getProjectFiles();
        const expandedFiles = [];
        for (const t of fileTargets) {
          if (t.includes('*')) {
            const regex = new RegExp('^' + t.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i');
            const matches = allProjectFiles.filter(f => !f.is_dir && regex.test(f.name)).map(f => f.name);
            expandedFiles.push(...matches);
          } else {
            expandedFiles.push(t);
          }
        }

        if (expandedFiles.length === 0) {
          appendTerminalLine(`<span class="term-error">grep: no matching files found.</span>`, true);
          break;
        }

        let totalMatches = 0;
        const re = new RegExp(targetPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), isCaseInsensitive ? 'gi' : 'g');

        for (const fName of expandedFiles.slice(0, 15)) {
          if (isFileAdminRestricted(fName) && !window.isHuellasAdmin()) {
            appendTerminalLine(`<span class="term-error">grep: ${escapeHtml(fName)}: Permission denied</span>`, true);
            continue;
          }
          try {
            const fetchHeaders = {};
            if (window.isHuellasAdmin()) {
              fetchHeaders['X-Huellas-Admin-Token'] = window.getHuellasAdminToken();
            }
            const resp = await fetch(fName.startsWith('/') ? fName : '/' + fName, { headers: fetchHeaders });
            if (!resp.ok) continue;
            const text = await resp.text();
            const lines = text.split('\n');
            const fileMatches = [];
            for (let lIdx = 0; lIdx < lines.length; lIdx++) {
              const lineContent = lines[lIdx];
              if (re.test(lineContent)) {
                totalMatches++;
                const numStr = (lIdx + 1).toString().padStart(4, ' ');
                const highlighted = escapeHtml(lineContent).replace(re, m => `<span style="background:rgba(233,84,32,0.35);color:#fff;font-weight:bold;">${m}</span>`);
                fileMatches.push(`<span class="term-info">${escapeHtml(fName)}</span>:<span class="term-dim">${numStr}</span>: ${highlighted}`);
              }
            }
            if (fileMatches.length > 0) {
              appendTerminalLine(fileMatches.join('\n'), true);
            }
          } catch (_) {}
        }

        if (totalMatches === 0) {
          appendTerminalLine(`<span class="term-dim">grep: pattern "${escapeHtml(targetPattern)}" not found.</span>`, true);
        } else {
          appendTerminalLine(`<span class="term-success">grep: ${totalMatches} match(es) found.</span>`, true);
        }
        break;
      }

      case 'dom':
      case 'inspect': {
        if (args.length === 0) {
          appendTerminalLine('<span class="term-error">dom: missing selector. Usage: dom &lt;css-selector&gt; (e.g. dom #darkModeToggle, dom .report-card)</span>', true);
          break;
        }
        const selector = args.join(' ');
        try {
          const els = Array.from(document.querySelectorAll(selector));
          if (els.length === 0) {
            appendTerminalLine(`<span class="term-dim">dom: 0 elements found matching "${escapeHtml(selector)}".</span>`, true);
            break;
          }
          let out = `<span class="term-success">dom: found ${els.length} element(s) matching "${escapeHtml(selector)}":</span>\n`;
          const limit = Math.min(els.length, 6);
          for (let i = 0; i < limit; i++) {
            const el = els[i];
            const tag = el.tagName.toLowerCase();
            const idStr = el.id ? ` id="${el.id}"` : '';
            const clsStr = el.className && typeof el.className === 'string' ? ` class="${el.className.trim()}"` : '';
            const rect = el.getBoundingClientRect();
            const comp = window.getComputedStyle(el);
            const isVisible = comp.display !== 'none' && comp.visibility !== 'hidden' && comp.opacity !== '0';
            const visStatus = isVisible ? `<span class="term-success">visible</span>` : `<span class="term-error">hidden (${comp.display})</span>`;
            const sizeStr = `${Math.round(rect.width)}x${Math.round(rect.height)} at (${Math.round(rect.left)}, ${Math.round(rect.top)})`;
            
            let snippet = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
            if (snippet.length > 50) snippet = snippet.slice(0, 47) + '...';
            const textPreview = snippet ? ` | text: "${escapeHtml(snippet)}"` : '';

            out += `  <span class="term-info">[#${i + 1}]</span> &lt;<span class="term-exec">${tag}</span>${escapeHtml(idStr)}${escapeHtml(clsStr)}&gt;\n`;
            out += `       Status: ${visStatus} | Size: <span class="term-dim">${sizeStr}</span>${textPreview}\n`;
          }
          if (els.length > limit) {
            out += `  <span class="term-dim">... and ${els.length - limit} more elements.</span>`;
          }
          appendTerminalLine(out, true);
        } catch (err) {
          appendTerminalLine(`<span class="term-error">dom: invalid selector "${escapeHtml(selector)}": ${escapeHtml(err.message)}</span>`, true);
        }
        break;
      }

      case 'console': {
        const sub = (args[0] || '').toLowerCase();
        if (sub === '-c' || sub === '--clear') {
          terminalConsoleBuffer.length = 0;
          appendTerminalLine('<span class="term-info">console: buffer cleared.</span>', true);
          break;
        }

        let filterLevel = null;
        if (sub === '-e' || sub === '--errors') filterLevel = 'error';
        else if (sub === '-w' || sub === '--warn') filterLevel = 'warn';
        else if (sub === '-l' || sub === '--logs') filterLevel = 'log';

        let entries = [...terminalConsoleBuffer];
        if (filterLevel) {
          if (filterLevel === 'warn') {
            entries = entries.filter(e => e.level === 'warn' || e.level === 'error');
          } else {
            entries = entries.filter(e => e.level === filterLevel || (filterLevel === 'log' && e.level === 'info'));
          }
        }

        if (entries.length === 0) {
          appendTerminalLine(`<span class="term-dim">console: no log entries captured${filterLevel ? ` for [${filterLevel}]` : ''}.</span>`, true);
          break;
        }

        let out = `<span class="term-info">--- [ Browser Console Stream (${entries.length} entries) ] ---</span>\n`;
        out += entries.slice(-35).map(entry => {
          let lvlColor = '#dcdcdc';
          let lvlBadge = `[${entry.level.toUpperCase().padEnd(5, ' ')}]`;
          if (entry.level === 'error') {
            lvlColor = '#ef2929';
          } else if (entry.level === 'warn') {
            lvlColor = '#fce94f';
          } else if (entry.level === 'info') {
            lvlColor = '#729fcf';
          }
          return `<span class="term-dim">[${entry.time}]</span> <span style="color:${lvlColor}; font-weight:bold;">${lvlBadge}</span> <span style="color:${lvlColor};">${escapeHtml(entry.text)}</span>`;
        }).join('\n');
        appendTerminalLine(out, true);
        break;
      }

      case 'storage':
      case 'cookies': {
        const sub = (args[0] || '').toLowerCase();
        if (cmd === 'cookies' || sub === 'cookies') {
          const rawCookies = document.cookie;
          if (!rawCookies || !rawCookies.trim()) {
            appendTerminalLine('<span class="term-dim">cookies: no document cookies found for this origin.</span>', true);
          } else {
            const pairs = rawCookies.split(';').map(c => c.trim()).filter(Boolean);
            let out = `<span class="term-info">--- [ document.cookie (${pairs.length} entries) ] ---</span>\n`;
            out += pairs.map(p => {
              const [k, ...v] = p.split('=');
              return `  <span class="term-exec">${escapeHtml(k)}</span> = <span class="term-file">${escapeHtml(v.join('='))}</span>`;
            }).join('\n');
            appendTerminalLine(out, true);
          }
          break;
        }

        if (sub === 'clear' || sub === '-c') {
          localStorage.clear();
          sessionStorage.clear();
          appendTerminalLine('<span class="term-success">storage: localStorage and sessionStorage have been completely cleared.</span>', true);
          break;
        }

        if (sub === 'rm' || sub === 'del') {
          const targetKey = args[1];
          if (!targetKey) {
            appendTerminalLine('<span class="term-error">storage rm: missing key name. Usage: storage rm &lt;key&gt;</span>', true);
            break;
          }
          localStorage.removeItem(targetKey);
          sessionStorage.removeItem(targetKey);
          appendTerminalLine(`<span class="term-info">storage: removed "${escapeHtml(targetKey)}" from local and session storage.</span>`, true);
          break;
        }

        if (sub === 'get') {
          const targetKey = args[1];
          if (!targetKey) {
            appendTerminalLine('<span class="term-error">storage get: missing key. Usage: storage get &lt;key&gt;</span>', true);
            break;
          }
          const val = localStorage.getItem(targetKey) || sessionStorage.getItem(targetKey);
          if (val === null) {
            appendTerminalLine(`<span class="term-dim">storage: key "${escapeHtml(targetKey)}" not found.</span>`, true);
          } else {
            appendTerminalLine(`<span class="term-info">[${escapeHtml(targetKey)}]</span>\n${escapeHtml(val)}`, true);
          }
          break;
        }

        if (sub === 'set') {
          const targetKey = args[1];
          const valToSet = args.slice(2).join(' ');
          if (!targetKey) {
            appendTerminalLine('<span class="term-error">storage set: missing key. Usage: storage set &lt;key&gt; &lt;value&gt;</span>', true);
            break;
          }
          localStorage.setItem(targetKey, valToSet);
          appendTerminalLine(`<span class="term-success">storage: set "${escapeHtml(targetKey)}" in localStorage.</span>`, true);
          break;
        }

        // Flags para mostrar secretos (solo permitido a root)
        const showSecrets = args.includes('--show-secrets') || args.includes('-s');
        if (showSecrets && !window.isHuellasAdmin()) {
          appendTerminalLine('<span class="term-error">storage: permission denied to reveal secrets. (requires root privileges; use "sudo storage --show-secrets")</span>', true);
          break;
        }

        function formatStorageRow(k, val) {
          const isSecret = /(API_?KEY|SECRET|TOKEN|AUTH|PASS|CREDENTIAL)/i.test(k);
          const sizeKB = (new Blob([val || '']).size / 1024).toFixed(1);
          let label = '';
          let displayVal = val || '';

          if (k === 'HUELLAS_GMAPS_API_KEY') {
            label = ' <span class="term-dim">[Google Maps API Key]</span>';
            if (!showSecrets) {
              const prefix = val ? val.slice(0, 6) : 'AIzaSy';
              displayVal = `${escapeHtml(prefix)}${'•'.repeat(Math.max(16, (val ? val.length : 39) - 6))} <span class="term-dim" style="font-size:11px;">(${val ? val.length : 39} chars, masked for security)</span>`;
            } else {
              displayVal = `<span class="term-warn">${escapeHtml(val)}</span>`;
            }
          } else if (k === 'HUELLAS_LOCAL_REPORTS') {
            label = ' <span class="term-dim">[Offline Reports Cache]</span>';
            try {
              const parsed = JSON.parse(val);
              const repCount = Object.keys(parsed.reports || {}).length;
              const imgCount = Object.keys(parsed.images || {}).length;
              displayVal = `<span class="term-info">${repCount} reportes, ${imgCount} imágenes en caché local</span>`;
            } catch (_) {
              displayVal = `<span class="term-dim">${escapeHtml(val.slice(0, 60))}...</span>`;
            }
          } else if (k === 'dark-mode') {
            label = ' <span class="term-dim">[Theme Preference]</span>';
            displayVal = val === 'enabled' ? '<span class="term-success">enabled (Dark Mode active)</span>' : '<span class="term-dim">disabled (Light Mode)</span>';
          } else if (k === 'HUELLAS_ADMIN_SESSION') {
            label = ' <span class="term-dim">[Admin Session State]</span>';
            displayVal = val === 'true' ? '<span class="term-error">true (root session active)</span>' : 'false';
          } else if (k === 'HUELLAS_DEV_MOBILE_VIEW') {
            label = ' <span class="term-dim">[Mobile Simulation]</span>';
            displayVal = val === 'true' ? '<span class="term-warn">true (Mobile view active)</span>' : '<span class="term-dim">false (Desktop view)</span>';
          } else if (isSecret && !showSecrets) {
            displayVal = `•••••••••••••••• <span class="term-dim" style="font-size:11px;">(secret masked)</span>`;
          } else if (displayVal.length > 65) {
            displayVal = escapeHtml(displayVal.slice(0, 62)) + '...';
          } else {
            displayVal = escapeHtml(displayVal);
          }

          return `  <span class="term-file">${escapeHtml(k)}</span>${label} <span class="term-dim">(${sizeKB} KB)</span>\n    <span class="term-exec">↳</span> ${displayVal}`;
        }

        let totalBytes = 0;
        for (let i = 0; i < localStorage.length; i++) totalBytes += (localStorage.getItem(localStorage.key(i)) || '').length;
        for (let i = 0; i < sessionStorage.length; i++) totalBytes += (sessionStorage.getItem(sessionStorage.key(i)) || '').length;
        const totalKB = (totalBytes / 1024).toFixed(1);

        let out = `<span class="term-info">=== [ Web Storage Telemetry ] ===</span>\n`;
        out += `<span class="term-dim">Origin: ${escapeHtml(window.location.origin)} | Usage: ${totalKB} KB</span>\n\n`;

        out += `<span class="term-exec">● localStorage (${localStorage.length} items):</span>\n`;
        if (localStorage.length === 0) {
          out += `  <span class="term-dim">(empty)</span>\n`;
        } else {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            const val = localStorage.getItem(k);
            out += formatStorageRow(k, val) + '\n';
          }
        }

        out += `\n<span class="term-exec">● sessionStorage (${sessionStorage.length} items):</span>\n`;
        if (sessionStorage.length === 0) {
          out += `  <span class="term-dim">(empty)</span>\n`;
        } else {
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            const val = sessionStorage.getItem(k);
            out += formatStorageRow(k, val) + '\n';
          }
        }

        if (!showSecrets) {
          out += `\n<span class="term-dim" style="font-size:11px;">Tip: Secrets are masked. Pass 'storage --show-secrets' (or 'sudo storage --show-secrets') to reveal.</span>`;
        }
        appendTerminalLine(out, true);
        break;
      }

      case 'top':
      case 'ps': {
        const isChromium = !!(window.performance && window.performance.memory);
        let memStr = '';
        if (isChromium) {
          const mem = window.performance.memory;
          const usedMB = (mem.usedJSHeapSize / 1048576).toFixed(1);
          const totalMB = (mem.totalJSHeapSize / 1048576).toFixed(1);
          const limitMB = (mem.jsHeapSizeLimit / 1048576).toFixed(0);
          memStr = `${usedMB} MB / ${totalMB} MB (Heap Limit: ${limitMB} MB)`;
        } else {
          memStr = 'Performance Memory API not exposed by browser sandbox';
        }

        const domTotal = document.querySelectorAll('*').length;
        const scriptCount = document.scripts.length;
        const sheetCount = document.styleSheets.length;
        const imgCount = document.images.length;
        
        let navTimingStr = 'N/A';
        try {
          const navEntries = performance.getEntriesByType('navigation');
          if (navEntries && navEntries.length > 0) {
            const nav = navEntries[0];
            const dcl = Math.round(nav.domContentLoadedEventEnd);
            const load = Math.round(nav.loadEventEnd || nav.duration);
            navTimingStr = `DCL: ${dcl}ms | Total Load: ${load}ms`;
          }
        } catch (_) {}

        const timeStr = new Date().toTimeString().split(' ')[0];
        const out = `
<span class="term-info">top - ${timeStr} up 1 session,  host: huellas,  theme: ${document.body.classList.contains('dark-mode') ? 'dark' : 'light'}</span>
<span class="term-dim">Tasks: 4 total, 1 active, 3 idle | Viewport: ${window.innerWidth}x${window.innerHeight}</span>
<span class="term-dim">MiB JS Heap  : ${memStr}</span>
<span class="term-dim">DOM Telemetry: ${domTotal} nodes | ${scriptCount} scripts | ${sheetCount} css sheets | ${imgCount} images</span>
<span class="term-dim">Perf Timing  : ${navTimingStr}</span>

<span class="term-dim" style="text-decoration:underline;">  PID USER      PR  NI    VIRT    RES    SHR S  %CPU %MEM     TIME+ COMMAND</span>
    1 root      20   0   12.4M   4.2M   3.1M S   0.0  0.1   0:00.12 init (systemd)
  101 quiltro   20   0   48.2M  18.4M   8.6M S   0.2  0.4   0:01.32 huellas-server
  204 quiltro   20   0   92.6M  34.1M  14.2M R   1.4  0.8   0:02.85 blink.render-tree
  305 quiltro   20   0   24.1M   9.2M   5.1M S   0.1  0.2   0:00.41 firebase.rtdb-sync
`;
        appendTerminalLine(out, true);
        break;
      }

      case 'whoami':
        appendTerminalLine(window.isHuellasAdmin() ? 'root' : 'quiltro', true);
        break;

      case 'pwd':
        appendTerminalLine(window.isHuellasAdmin() ? '/root' : '/home/quiltro', true);
        break;

      case 'uname':
        if (args.includes('-a') || args.includes('--all')) {
          appendTerminalLine('"Linux" huellas-box 5.15.0-quiltro #42-Ubuntu SMP x86_64 WebKit/Blink JavaScriptCore', true);
        } else {
          appendTerminalLine('"Linux"', true);
        }
        break;

      case 'date':
        appendTerminalLine(new Date().toString(), true);
        break;

      case 'status':
      case 'reportes':
      case 'reports': {
        appendTerminalLine('<span class="term-dim">Querying backend cluster &amp; Firebase RTDB health...</span>', true);

        // 1. Probar backend local
        let backendStatus = '<span class="term-error">offline / unreachable</span>';
        let backendLatency = 0;
        let reportStats = '6 focos activos | 12 animales registrados | 3 sectores';

        try {
          const t0 = performance.now();
          const res = await fetch('/api/reports', { cache: 'no-store' });
          backendLatency = Math.round(performance.now() - t0);
          if (res.ok) {
            backendStatus = `<span class="term-success">active (running)</span> - HTTP 200 OK (${backendLatency}ms)`;
            const data = await res.json();
            if (data && data.reports) {
              const count = Object.keys(data.reports).length;
              reportStats = `${count} reportes en store | cluster sincronizado`;
            }
          } else {
            backendStatus = `<span class="term-warn">degraded</span> - HTTP ${res.status}`;
          }
        } catch (_) {
          backendStatus = `<span class="term-error">offline / unreachable</span>`;
        }

        // 2. Probar Firebase Realtime Database
        let fbUrl = window.__HUELLAS_FIREBASE_URL || (typeof firebaseDbUrl !== 'undefined' ? firebaseDbUrl : '') || 'https://huellas-al-lodo-default-rtdb.firebaseio.com';
        let fbStatus = '<span class="term-dim">probing...</span>';
        let fbLatency = 0;
        let secondsAgoStr = 'sin sincronización previa';

        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 2500);
          const fbT0 = performance.now();
          const fbRes = await fetch(`${fbUrl}/huellas_state.json?shallow=true`, { signal: ctrl.signal, cache: 'no-store' });
          clearTimeout(timer);
          fbLatency = Math.round(performance.now() - fbT0);

          if (fbRes.ok || fbRes.status === 401 || fbRes.status === 403 || fbRes.status === 200) {
            fbStatus = `<span class="term-success">ONLINE (connected)</span> - HTTP ${fbRes.status} (${fbLatency}ms)`;
            if (!window.__HUELLAS_LAST_FIREBASE_SYNC) {
              window.__HUELLAS_LAST_FIREBASE_SYNC = Date.now();
            }
          } else {
            fbStatus = `<span class="term-warn">HTTP ${fbRes.status}</span> (${fbLatency}ms)`;
          }
        } catch (e) {
          fbStatus = `<span class="term-error">OFFLINE / UNREACHABLE (${escapeHtml(e.name === 'AbortError' ? 'timeout 2.5s' : 'network error')})</span>`;
        }

        if (window.__HUELLAS_LAST_FIREBASE_SYNC) {
          const diffSec = Math.max(0, Math.round((Date.now() - window.__HUELLAS_LAST_FIREBASE_SYNC) / 1000));
          secondsAgoStr = diffSec === 0 ? 'hace 0 segundos (actualizado ahora)' : `hace ${diffSec} segundos`;
        }

        // 3. Telemetría de cliente
        const pageName = window.location.pathname.split('/').pop() || 'index.html';
        const isDark = document.body.classList.contains('dark-mode');
        const isMobileSim = document.body.classList.contains('dev-mobile-sim');
        const domNodes = document.querySelectorAll('*').length;

        const out = `
<span class="term-success">● huellas.service - Backend Server Daemon</span>
     Loaded: loaded (/etc/systemd/system/huellas.service; enabled)
     Active: ${backendStatus} on ${window.location.origin}/
     Data  : ${reportStats}

<span class="term-info">● firebase.service - Google Firebase Realtime Database</span>
     Endpoint : ${escapeHtml(fbUrl)}
     Status   : ${fbStatus}
     Last Sync: <span class="term-success" style="font-weight:bold;">${secondsAgoStr}</span>

<span class="term-exec">● client.session - Browser Environment Telemetry</span>
     Page     : ${escapeHtml(pageName)} | Viewport: ${window.innerWidth}x${window.innerHeight} (${isMobileSim ? 'Mobile Sim' : 'Desktop'})
     Theme    : ${isDark ? '<span class="term-info">Dark Mode</span>' : 'Light Mode'} | DOM Tree: ${domNodes} nodes
     Session  : ${window.isHuellasAdmin() ? '<span class="term-error">ROOT (ADMIN)</span>' : '<span class="term-info">QUILTRO (GUEST)</span>'}
`;
        appendTerminalLine(out, true);
        break;
      }

      case 'mobile':
      case 'movil':
        toggleMobileDevView();
        appendTerminalLine(`<span class="term-success">Switched mobile simulation mode (Ctrl + M).</span>`, true);
        break;

      case 'shake': {
        if (args.length > 0 && !isNaN(parseFloat(args[0]))) {
          const val = Math.max(0.1, Math.min(5.0, parseFloat(args[0])));
          MOBILE_SHAKE_CONFIG.SHAKE_DIFFICULTY = val;
          sessionStorage.setItem('HUELLAS_SHAKE_DIFFICULTY', String(val));
          appendTerminalLine(`<span class="term-success">shake: SHAKE_DIFFICULTY actualizado a ${val.toFixed(2)} (paso mín: ${Math.max(1, Math.round(MOBILE_SHAKE_CONFIG.BASE_STEP_PX * val))} px/tick, duración: ${MOBILE_SHAKE_CONFIG.DURATION_MS}ms).</span>`, true);
        } else {
          const d = MOBILE_SHAKE_CONFIG.SHAKE_DIFFICULTY;
          appendTerminalLine(
            `<span class="term-info">--- [ Configuración de Gesto Vertical Móvil (4s) ] ---</span>\n` +
            `  SHAKE_DIFFICULTY : <span class="term-exec">${d}</span> (usa 'shake &lt;valor&gt;' para cambiar, ej. 'shake 0.5' o 'shake 1.5')\n` +
            `  DURATION_MS      : ${MOBILE_SHAKE_CONFIG.DURATION_MS} ms (4 segundos en tiempo real)\n` +
            `  Cambio dirección : mín. ${Math.max(2, Math.round(MOBILE_SHAKE_CONFIG.BASE_MIN_DELTA_PX * d))} px por giro arriba/abajo\n` +
            `  Impulso por tick : mín. ${Math.max(1, Math.round(MOBILE_SHAKE_CONFIG.BASE_STEP_PX * d))} px cada 40ms`,
            true
          );
        }
        break;
      }

      case 'showbar': {
        if (!window.isHuellasAdmin()) {
          appendTerminalLine(
            `<span class="term-error">showbar: Permission denied (root privileges required)</span>\n` +
            `<span class="term-dim">Tip: Run 'sudo showbar' or authenticate using 'admin &lt;password&gt;'.</span>`,
            true
          );
          break;
        }
        const sub = (args[0] || '').toLowerCase();
        const cur = sessionStorage.getItem('HUELLAS_SHOW_SHAKE_BAR') === 'true';
        const nextState = sub === 'on' ? true : (sub === 'off' ? false : !cur);
        if (nextState) {
          sessionStorage.setItem('HUELLAS_SHOW_SHAKE_BAR', 'true');
          updateShakeProgressBar();
          appendTerminalLine(`<span class="term-success">showbar: Barra de progreso de sacudida ACTIVADA (visible en modo admin).</span>`, true);
        } else {
          sessionStorage.removeItem('HUELLAS_SHOW_SHAKE_BAR');
          const bar = document.getElementById('huellasShakeProgressBar');
          if (bar) bar.remove();
          appendTerminalLine(`<span class="term-info">showbar: Barra de progreso de sacudida OCULTA.</span>`, true);
        }
        break;
      }

      case 'desktop':
        document.body.classList.remove('dev-mobile-sim');
        sessionStorage.setItem('HUELLAS_DEV_MOBILE_VIEW', 'false');
        if (typeof window.applyLayoutDisposition === 'function') {
          window.applyLayoutDisposition(window.innerWidth <= 768 ? 'mobile-qr' : 'map-first');
        }
        window.dispatchEvent(new CustomEvent('huellas:viewport-change', { detail: { mobileSim: false } }));
        appendTerminalLine(`<span class="term-success">Restored desktop layout.</span>`, true);
        break;

      case 'echo': {
        let text = args.join(' ');
        const vars = {
          'USER': window.isHuellasAdmin() ? 'root' : 'quiltro',
          'WIDTH': window.innerWidth,
          'HEIGHT': window.innerHeight,
          'THEME': document.body.classList.contains('dark-mode') ? 'dark' : 'light',
          'ADMIN': window.isHuellasAdmin() ? 'true' : 'false',
          'URL': window.location.href,
          'HOST': window.location.host,
          'PAGE': window.location.pathname.split('/').pop() || 'index.html',
          'NODE_COUNT': document.querySelectorAll('*').length,
          'SHELL': '/bin/bash',
          'PATH': '/usr/local/bin:/usr/bin:/bin:/huellas',
          'FIREBASE': window.__HUELLAS_FIREBASE_URL || 'https://huellas-al-lodo-default-rtdb.firebaseio.com'
        };
        text = text.replace(/\$\{?([A-Z_]+)\}?/g, (m, varName) => {
          return vars[varName] !== undefined ? vars[varName] : m;
        });
        appendTerminalLine(escapeHtml(text), true);
        break;
      }

      case 'history': {
        if (args[0] === '-c' || args[0] === '--clear') {
          commandHistory = [];
          saveCommandHistoryState();
          appendTerminalLine('<span class="term-info">history: command history cleared.</span>', true);
          break;
        }
        if (commandHistory.length === 0) {
          appendTerminalLine('<span class="term-dim">No commands in history.</span>', true);
        } else {
          const list = commandHistory.map((h, i) => `  <span class="term-dim">${(i + 1).toString().padStart(3, ' ')}</span>  ${escapeHtml(h)}`).join('\n');
          appendTerminalLine(list, true);
        }
        break;
      }

      case 'clr':
      case 'clear': {
        const out = document.getElementById('linuxTermOutput');
        if (out) out.innerHTML = '';
        saveTerminalOutputState();
        break;
      }

      case 'exit':
      case 'quit':
        closeAdminAuthModal();
        break;

      default:
        appendTerminalLine(`<span class="term-dim">bash: ${escapeHtml(cmd)}: command not found. Type 'help' for available commands.</span>`, true);
        break;
    }
  }

  function openAdminAuthModal(opts) {
    const shouldFocus = !opts || opts.focusInput !== false;
    ensureLinuxTerminalInDOM();
    const term = document.getElementById('linuxTerminalWindow');
    const input = document.getElementById('linuxTermInput');
    const body = document.getElementById('linuxTermBody');

    if (term) {
      term.style.display = 'flex';
      if (shouldFocus && term.classList.contains('minimized')) {
        term.classList.remove('minimized');
        sessionStorage.setItem('HUELLAS_TERM_MINIMIZED', 'false');
      }
    }
    sessionStorage.setItem('HUELLAS_TERM_OPEN', 'true');
    updatePromptDisplay();

    if (body) {
      body.scrollTop = body.scrollHeight;
    }
    if (shouldFocus) {
      setTimeout(() => {
        if (input) input.focus();
      }, 80);
    }
  }

  function closeAdminAuthModal() {
    const term = document.getElementById('linuxTerminalWindow');
    if (term) term.style.display = 'none';
    sessionStorage.setItem('HUELLAS_TERM_OPEN', 'false');
  }

  // Código Konami robusto e infalible (↑ ↑ ↓ ↓ ← → ← → B A)
  const KONAMI_TARGET = ['u', 'u', 'd', 'd', 'l', 'r', 'l', 'r', 'b', 'a'];
  let konamiBuffer = [];
  let lastKonamiKeyTime = 0;

  function normalizeKonamiKey(e) {
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return null;

    const k = (e.key || '').toLowerCase();
    const code = (e.code || '').toLowerCase();
    const kc = e.keyCode || e.which || 0;

    if (k === 'arrowup' || k === 'up' || code === 'arrowup' || code === 'numpad8' || kc === 38) return 'u';
    if (k === 'arrowdown' || k === 'down' || code === 'arrowdown' || code === 'numpad2' || kc === 40) return 'd';
    if (k === 'arrowleft' || k === 'left' || code === 'arrowleft' || code === 'numpad4' || kc === 37) return 'l';
    if (k === 'arrowright' || k === 'right' || code === 'arrowright' || code === 'numpad6' || kc === 39) return 'r';
    if (k === 'b' || code === 'keyb' || kc === 66) return 'b';
    if (k === 'a' || code === 'keya' || kc === 65) return 'a';

    return 'other';
  }

  function getKonamiMatchCount(buffer) {
    for (let len = Math.min(buffer.length, KONAMI_TARGET.length); len > 0; len--) {
      const sub = buffer.slice(buffer.length - len);
      let match = true;
      for (let i = 0; i < len; i++) {
        if (sub[i] !== KONAMI_TARGET[i]) {
          match = false;
          break;
        }
      }
      if (match) return len;
    }
    return 0;
  }

  function handleKeyAction(e) {
    if (e.type !== 'keydown' || e.repeat) return;

    if (e.key === 'Escape' || e.keyCode === 27) {
      const term = document.getElementById('linuxTerminalWindow');
      if (term && term.style.display === 'flex') {
        closeAdminAuthModal();
        return;
      }
    }

    const isCtrl = e.ctrlKey || e.metaKey;
    const isAlt = e.altKey && !isCtrl;

    // 0. Alt + T en modo administrador para abrir o cerrar la consola inmediatamente
    const isT = (e.key && e.key.toLowerCase() === 't') || e.code === 'KeyT' || e.keyCode === 84 || e.which === 84;
    if (isAlt && isT) {
      if (window.isHuellasAdmin()) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        const term = document.getElementById('linuxTerminalWindow');
        if (term && term.style.display === 'flex' && !term.classList.contains('minimized')) {
          closeAdminAuthModal();
        } else {
          openAdminAuthModal();
        }
        return;
      }
    }

    // 1. Ctrl + S para salir de modo administrador
    const isS = (e.key && e.key.toLowerCase() === 's') || e.code === 'KeyS' || e.keyCode === 83 || e.which === 83;
    if (isCtrl && isS) {
      if (window.isHuellasAdmin()) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        exitAdminMode();
        return;
      }
    }

    // 2. Ctrl + M para alternar vista móvil
    const isM = (e.key && e.key.toLowerCase() === 'm') || e.code === 'KeyM' || e.keyCode === 77 || e.which === 77;
    if (isCtrl && isM) {
      if (window.isHuellasAdmin()) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        toggleMobileDevView();
        return;
      }
    }

    // 3. Código Konami
    const activeEl = document.activeElement;
    const tag = activeEl ? activeEl.tagName : '';
    const isInputField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (activeEl && activeEl.isContentEditable);
    if (isInputField) return;

    const norm = normalizeKonamiKey(e);
    if (!norm) return;

    const now = Date.now();
    if (now - lastKonamiKeyTime > 6000) {
      konamiBuffer = [];
    }
    lastKonamiKeyTime = now;

    if (norm === 'other') {
      konamiBuffer = [];
    } else {
      if (['u', 'd', 'l', 'r'].includes(norm)) {
        e.preventDefault();
      }
      konamiBuffer.push(norm);
      if (konamiBuffer.length > 15) {
        konamiBuffer.shift();
      }
    }

    if (getKonamiMatchCount(konamiBuffer) === KONAMI_TARGET.length) {
      konamiBuffer = [];
      e.preventDefault();
      openAdminAuthModal();
    }
  }

  window.addEventListener('keydown', handleKeyAction, true);

  // =========================================================================
  // ACTIVADOR MÓVIL: MOVER LA PANTALLA ARRIBA Y ABAJO RÁPIDO POR 4 SEGUNDOS
  // (Funciona en móviles reales y en Vista Móvil de Admin en escritorio)
  // =========================================================================
  if (sessionStorage.getItem('HUELLAS_SHAKE_DIFFICULTY')) {
    const savedDiff = parseFloat(sessionStorage.getItem('HUELLAS_SHAKE_DIFFICULTY'));
    if (!isNaN(savedDiff) && savedDiff >= 0.1 && savedDiff <= 5.0) {
      MOBILE_SHAKE_CONFIG.SHAKE_DIFFICULTY = savedDiff;
    }
  }

  function isRealMobileDevice() {
    const hasTouch = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
    const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent || '');
    return (window.innerWidth <= 820) && (hasTouch || mobileUA);
  }

  function isShakeGestureAllowed() {
    // 1. En computador: SOLO funciona si el usuario está en Modo Admin (ya sea en escritorio o en Vista Móvil)
    if (window.isHuellasAdmin && window.isHuellasAdmin()) {
      return true;
    }
    // 2. En dispositivos móviles reales (teléfonos / tablets), nunca para visitantes en PC
    return isRealMobileDevice();
  }

  function createTrackerState() {
    return { lastRaw: null, virtualPos: 0, extremePos: 0, dir: 0, stepAccum: 0 };
  }

  const shakeState = {
    chargeMs: 0,
    lastTickTs: performance.now(),
    lastFastMoveTs: 0,
    lastReversalTs: 0,
    reversalCount: 0,
    cooldownUntil: 0,
    trackers: {
      screen: createTrackerState(),
      input:  createTrackerState()
    }
  };

  function isShakeBarEnabled() {
    return Boolean(window.isHuellasAdmin && window.isHuellasAdmin() && sessionStorage.getItem('HUELLAS_SHOW_SHAKE_BAR') === 'true');
  }

  function getShakeProgressBar() {
    if (!isShakeBarEnabled()) {
      const existing = document.getElementById('huellasShakeProgressBar');
      if (existing) existing.remove();
      return null;
    }
    let bar = document.getElementById('huellasShakeProgressBar');
    if (!bar && document.documentElement) {
      bar = document.createElement('div');
      bar.id = 'huellasShakeProgressBar';
      bar.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:6px;background:rgba(20,12,7,0.55);border-bottom:1px solid rgba(233,84,32,0.45);z-index:2147483647;pointer-events:none;overflow:hidden;';
      const fill = document.createElement('div');
      fill.id = 'huellasShakeProgressFill';
      fill.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,#f59e0b,#e95420,#ef4444);box-shadow:0 0 14px rgba(233,84,32,0.95);transition:width 0.05s linear;';
      bar.appendChild(fill);
      document.documentElement.appendChild(bar);
    }
    return bar;
  }

  function updateShakeProgressBar() {
    const bar = getShakeProgressBar();
    if (!bar) return;
    const fill = document.getElementById('huellasShakeProgressFill');
    if (!fill) return;
    if (shakeState.chargeMs <= 30 || shakeState.reversalCount < 1) {
      fill.style.width = '0%';
      return;
    }
    const pct = Math.min(100, Math.round((shakeState.chargeMs / MOBILE_SHAKE_CONFIG.DURATION_MS) * 100));
    fill.style.width = pct + '%';
  }

  function resetShakeState() {
    shakeState.chargeMs = 0;
    shakeState.lastFastMoveTs = 0;
    shakeState.lastReversalTs = 0;
    shakeState.reversalCount = 0;
    shakeState.trackers.screen = createTrackerState();
    shakeState.trackers.input = createTrackerState();
    updateShakeProgressBar();
  }

  // Mide la posición visual real en pantalla (1:1 en píxeles sin importar qué contenedor haga scroll)
  function getVisualScreenPositionY() {
    if (document.body) {
      const refEl = document.querySelector('.main-content, .content-section, .main-content-centered, .dashboard-wrapper, .proto-workspace, h1');
      if (refEl) {
        return -refEl.getBoundingClientRect().top;
      }
    }
    return (window.scrollY || 0) || (document.documentElement ? document.documentElement.scrollTop : 0) || (document.body ? document.body.scrollTop : 0);
  }

  function feedTrackerDelta(trackerName, dy, now) {
    if (!Number.isFinite(dy) || Math.abs(dy) < 0.5) return;
    const cfg = MOBILE_SHAKE_CONFIG;
    const diff = Math.max(0.1, Number(cfg.SHAKE_DIFFICULTY) || 1.0);
    const minTurnaroundPx = Math.max(2, cfg.BASE_MIN_DELTA_PX * diff);
    const minStepPx = Math.max(1, cfg.BASE_STEP_PX * diff);

    const tr = shakeState.trackers[trackerName];
    tr.virtualPos += dy;
    tr.stepAccum += Math.abs(dy);

    if (tr.stepAccum >= minStepPx) {
      shakeState.lastFastMoveTs = now;
    }

    if (tr.dir === 0) {
      if (Math.abs(tr.virtualPos - tr.extremePos) >= minTurnaroundPx) {
        tr.dir = tr.virtualPos > tr.extremePos ? 1 : -1;
        tr.extremePos = tr.virtualPos;
        shakeState.reversalCount = Math.max(1, shakeState.reversalCount);
        shakeState.lastReversalTs = now;
      }
    } else if (tr.dir === 1) {
      if (tr.virtualPos > tr.extremePos) {
        tr.extremePos = tr.virtualPos;
      } else if ((tr.extremePos - tr.virtualPos) >= minTurnaroundPx) {
        tr.dir = -1;
        tr.extremePos = tr.virtualPos;
        shakeState.reversalCount += 1;
        shakeState.lastReversalTs = now;
        shakeState.lastFastMoveTs = now;
      }
    } else {
      if (tr.virtualPos < tr.extremePos) {
        tr.extremePos = tr.virtualPos;
      } else if ((tr.virtualPos - tr.extremePos) >= minTurnaroundPx) {
        tr.dir = 1;
        tr.extremePos = tr.virtualPos;
        shakeState.reversalCount += 1;
        shakeState.lastReversalTs = now;
        shakeState.lastFastMoveTs = now;
      }
    }
  }

  // Eventos adicionales de rueda, touch, mouse y acelerómetro (por si la página hace tope arriba o abajo al scrollear)
  window.addEventListener('wheel', (e) => {
    if (!isShakeGestureAllowed() || Math.abs(e.deltaY) < 1) return;
    feedTrackerDelta('input', e.deltaY, performance.now());
  }, { passive: true });

  window.addEventListener('mousemove', (e) => {
    if (!isShakeGestureAllowed()) return;
    const tr = shakeState.trackers.input;
    if (tr.lastRaw !== null) {
      feedTrackerDelta('input', e.clientY - tr.lastRaw, performance.now());
    }
    tr.lastRaw = e.clientY;
  }, { passive: true });

  window.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length === 1) {
      shakeState.trackers.input.lastRaw = e.touches[0].clientY;
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!isShakeGestureAllowed() || !e.touches || e.touches.length !== 1) return;
    const y = e.touches[0].clientY;
    const tr = shakeState.trackers.input;
    if (tr.lastRaw !== null) {
      feedTrackerDelta('input', y - tr.lastRaw, performance.now());
    }
    tr.lastRaw = y;
  }, { passive: true });

  window.addEventListener('devicemotion', (e) => {
    if (!isShakeGestureAllowed()) return;
    const acc = e.acceleration || e.accelerationIncludingGravity;
    if (acc && typeof acc.y === 'number' && Math.abs(acc.y) > 3.0) {
      feedTrackerDelta('input', acc.y * 12, performance.now());
    }
  }, { passive: true });

  // Reloj maestro cada 40ms (25 Hz): mide directamente el desplazamiento visual de la pantalla
  // sin promediar velocidades que se anulen al frenar en los extremos.
  setInterval(() => {
    const now = performance.now();
    const dt = Math.max(0, Math.min(150, now - shakeState.lastTickTs));
    shakeState.lastTickTs = now;

    if (!isShakeGestureAllowed() || now < shakeState.cooldownUntil) {
      if (shakeState.chargeMs > 0 || shakeState.reversalCount > 0) {
        resetShakeState();
      }
      return;
    }

    // 1. Muestrear posición visual real de la página en este instante
    const currentScreenY = getVisualScreenPositionY();
    const scrTr = shakeState.trackers.screen;
    if (scrTr.lastRaw !== null) {
      const dyScreen = currentScreenY - scrTr.lastRaw;
      if (Math.abs(dyScreen) >= 0.5) {
        feedTrackerDelta('screen', dyScreen, now);
      }
    }
    scrTr.lastRaw = currentScreenY;

    // Resetear acumuladores de paso de este tick de 40ms
    shakeState.trackers.screen.stepAccum = 0;
    shakeState.trackers.input.stepAccum = 0;

    // 2. Comprobar si el usuario lleva impulsos rápidos recientes y cambios arriba<->abajo recientes
    const cfg = MOBILE_SHAKE_CONFIG;
    const diff = Math.max(0.1, Number(cfg.SHAKE_DIFFICULTY) || 1.0);
    const reversalWindow = (cfg.REVERSAL_WINDOW_MS || 1500) / Math.max(0.5, Math.sqrt(diff));

    const timeSinceFastMove = shakeState.lastFastMoveTs > 0 ? (now - shakeState.lastFastMoveTs) : 99999;
    const timeSinceReversal = shakeState.lastReversalTs > 0 ? (now - shakeState.lastReversalTs) : 99999;

    const isShakingNow = (
      shakeState.reversalCount >= 1 &&
      timeSinceFastMove <= 480 &&
      timeSinceReversal <= reversalWindow
    );

    if (isShakingNow) {
      shakeState.chargeMs = Math.min(cfg.DURATION_MS, shakeState.chargeMs + dt);
      updateShakeProgressBar();

      if (shakeState.chargeMs >= cfg.DURATION_MS && shakeState.reversalCount >= 2) {
        shakeState.cooldownUntil = now + 1500;
        const achievedReversals = shakeState.reversalCount;
        resetShakeState();
        openAdminAuthModal();
        appendTerminalLine(
          `<span class="term-success">[gesture] Sacudida vertical completada (4.0s | ${achievedReversals} cambios arriba/abajo | dificultad ${diff}).</span>`,
          true
        );
      }
    } else if (shakeState.chargeMs > 0) {
      if (timeSinceFastMove > 520 || timeSinceReversal > reversalWindow) {
        shakeState.chargeMs = Math.max(0, shakeState.chargeMs - dt * 1.2);
        if (shakeState.chargeMs === 0) {
          resetShakeState();
        } else {
          updateShakeProgressBar();
        }
      }
    }
  }, 40);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    syncDevViewState();
    updateShakeProgressBar();
    if (sessionStorage.getItem('HUELLAS_TERM_OPEN') === 'true') {
      openAdminAuthModal({ focusInput: false });
    } else if (new URLSearchParams(window.location.search).has('admin')) {
      setTimeout(() => openAdminAuthModal({ focusInput: true }), 350);
    }
  }
})();

