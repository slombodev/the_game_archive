'use strict';
/*
 * TGA (The Game Archive) — storefront + launcher.
 * The whole library is driven by games.json; see README.md for the schema.
 */

document.documentElement.classList.add('js');

const DATA_URL = 'games.json';
const PADDLE_SRC = 'https://cdn.paddle.com/paddle/v2/paddle.js';
const ADSENSE_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
const CONTACT_EMAIL = 'patrone.webstudio@gmail.com';
const MONTH_HUES = [215, 200, 145, 95, 55, 185, 225, 170, 280, 30, 330, 5]; // XMB-style monthly tint
const LOCALE = 'es';
const NEW_FOR_DAYS = 14;  // a game can show the "Nuevo" tag for this many days after its release date…
const NEW_MAX = 3;        // …and only the most recent few get it
const HERO_COUNT = 5;     // newest games shown in the carousel
const HERO_MS = 7000;     // time per carousel slide

// games.json keeps English genre keys (they also pick the icon); the page shows them in Spanish.
const GENRES = {
  action: 'Acción', adventure: 'Aventura', arcade: 'Arcade', horror: 'Terror', incremental: 'Incremental',
  platformer: 'Plataformas', puzzle: 'Puzle', racing: 'Carreras', rpg: 'Rol', shooter: 'Disparos',
  simulation: 'Simulación', sports: 'Deportes', strategy: 'Estrategia', survival: 'Supervivencia',
};
const REQ_LABELS = {
  os: 'Sistema operativo', storage: 'Espacio en disco', memory: 'Memoria', ram: 'Memoria',
  cpu: 'Procesador', processor: 'Procesador', gpu: 'Gráficos', graphics: 'Gráficos',
};
const genreLabel = (genre) => GENRES[genre.toLowerCase()] ?? genre;
const reqLabel = (key) => REQ_LABELS[key.toLowerCase()] ?? key;
const formatPrice = (n) => new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'USD' }).format(n);
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/* ============================== Data layer ============================== */

/** Resolve a URL from games.json; only http(s) and same-origin relative paths are allowed. */
function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, location.href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

const isText = (v) => typeof v === 'string' && v.trim() !== '';

/** "2026-10-31" → local Date (no timezone shift), or null. */
function parseDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value.trim() : '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Accepts youtube.com/watch?v=, youtu.be/, /embed/ and /shorts/ links; returns the video id. */
function youtubeId(value) {
  if (!isText(value)) return null;
  try {
    const u = new URL(value);
    const host = u.hostname.replace(/^(www|m)\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] ?? null;
    }
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Returns a reason string when the entry is unusable, otherwise null. */
function validateGame(g, seenIds) {
  if (!g || typeof g !== 'object') return 'entry is not an object';
  if (!isText(g.id) || !/^[a-z0-9][a-z0-9-]*$/.test(g.id)) return '"id" must be lowercase letters, digits and dashes';
  if (seenIds.has(g.id)) return `duplicate id "${g.id}"`;
  for (const key of ['title', 'genre', 'description']) if (!isText(g[key])) return `"${key}" is required`;
  if (!safeUrl(g.cover)) return '"cover" must be an image path';
  if (typeof g.price !== 'number' || !Number.isFinite(g.price) || g.price < 0) return '"price" must be a number >= 0 (0 = free)';
  if (g.price > 0 && !isText(g.paddlePriceId)) return 'paid games need "paddlePriceId"';
  if (g.price === 0 && !safeUrl(g.download?.url) && !safeUrl(g.play?.url)) return 'free games need "download.url" or "play.url" (http/https)';
  return null;
}

function normalizeGame(g) {
  const isFree = g.price === 0;
  for (const key of ['download', 'play']) {
    if (!isFree && g[key]) {
      console.warn(`[TGA] "${g.id}": "${key}" ignored on a paid game — a public link would let anyone skip checkout. Deliver paid files through Paddle fulfillment.`);
    }
  }
  const reqs = g.requirements && typeof g.requirements === 'object' ? g.requirements : {};
  const releasedDate = parseDate(g.released);
  const ageDays = releasedDate ? (Date.now() - releasedDate.getTime()) / 864e5 : Infinity;
  const genre = g.genre.trim();
  return {
    id: g.id,
    title: g.title.trim(),
    genre,
    genreLabel: genreLabel(genre),
    description: g.description.trim(),
    price: g.price,
    isFree,
    cover: safeUrl(g.cover),
    background: safeUrl(g.background) ?? safeUrl(g.cover),
    developer: isText(g.developer?.name) ? { name: g.developer.name.trim(), url: safeUrl(g.developer.url) } : null,
    released: isText(g.released) ? g.released : null,
    releasedDate,
    isNew: ageDays >= -1 && ageDays <= NEW_FOR_DAYS,
    requirements: Object.entries(reqs).filter(([k, v]) => isText(k) && isText(String(v))).map(([k, v]) => [k, String(v)]),
    download: isFree && safeUrl(g.download?.url) ? { url: safeUrl(g.download.url), size: g.download.size, platform: g.download.platform } : null,
    play: isFree && safeUrl(g.play?.url) ? { url: safeUrl(g.play.url) } : null,
    paddlePriceId: isFree ? null : g.paddlePriceId.trim(),
    screenshots: (Array.isArray(g.screenshots) ? g.screenshots : []).map(safeUrl).filter(Boolean),
    trailer: youtubeId(g.trailer),
  };
}

/** Ad slots: either a Google AdSense unit or a custom image + link. Anything else is ignored. */
function normalizeAds(raw) {
  const client = typeof raw?.adsenseClient === 'string' && /^ca-pub-\d{10,20}$/.test(raw.adsenseClient.trim())
    ? raw.adsenseClient.trim() : null;
  const slot = (s) => {
    if (!s || typeof s !== 'object') return null;
    if (client && /^\d{5,20}$/.test(String(s.adsenseSlot ?? '').trim())) {
      return { type: 'adsense', client, slot: String(s.adsenseSlot).trim() };
    }
    const url = safeUrl(s.url);
    if (url && (safeUrl(s.image) || isText(s.title))) {
      return {
        type: 'custom', url, image: safeUrl(s.image),
        title: isText(s.title) ? s.title.trim() : '',
        text: isText(s.text) ? s.text.trim() : '',
        cta: isText(s.cta) ? s.cta.trim() : 'Ver más',
      };
    }
    return null;
  };
  return { hero: slot(raw?.hero), detail: slot(raw?.detail) };
}

async function loadCatalog() {
  const res = await fetch(DATA_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`games.json respondió HTTP ${res.status}`);
  let raw;
  try {
    raw = await res.json();
  } catch (err) {
    throw new Error(`games.json no es un JSON válido (${err.message})`);
  }
  const games = [];
  const seen = new Set();
  (Array.isArray(raw?.games) ? raw.games : []).forEach((g, i) => {
    const problem = validateGame(g, seen);
    if (problem) return console.warn(`[TGA] games.json entry #${i + 1} skipped: ${problem}`);
    seen.add(g.id);
    games.push(normalizeGame(g));
  });
  // "Nuevo" only means something on a few games: keep the most recent NEW_MAX (ties at the cut drop out).
  const recent = games.filter((g) => g.isNew).sort(byNewest);
  if (recent.length > NEW_MAX) {
    const cutoff = recent[NEW_MAX].releasedDate.getTime();
    recent.forEach((g) => { if (g.releasedDate.getTime() <= cutoff) g.isNew = false; });
  }
  return { games, paddle: raw?.store?.paddle ?? {}, ads: normalizeAds(raw?.ads) };
}

const byNewest = (a, b) => (b.releasedDate?.getTime() ?? 0) - (a.releasedDate?.getTime() ?? 0);

/* ============================== Categories & icons ============================== */

// Glossy icons (48×48). Classes: g = glossy fill, l = white line, d = dark detail.
const ICONS = {
  all: '<path class="g" d="M14 15h20c6 0 10.5 5.6 9.3 11.4l-1.7 8.4a4.6 4.6 0 0 1-8 2.1L29.8 33H18.2l-3.8 3.9a4.6 4.6 0 0 1-8-2.1l-1.7-8.4C3.5 20.6 8 15 14 15z"/><path class="l" style="stroke:hsl(var(--hue),45%,30%)" d="M14.5 21v8M10.5 25h8"/><circle class="d" cx="31" cy="22.5" r="2.2"/><circle class="d" cx="35.5" cy="27" r="2.2"/>',
  racing: '<path class="l" d="M12 42V7"/><path class="g" d="M13 8h25l-5 8 5 8H13z"/><path class="d" d="M13 8h6v4h-6zM25 8h6v4h-6zM19 12h6v4h-6zM13 16h6v4h-6zM25 16h6v4h-6zM19 20h6v4h-6z"/>',
  adventure: '<circle class="g" cx="24" cy="24" r="17"/><path class="d" d="M24 10l5 14h-10z"/><path style="fill:#fff" d="M24 38l-5-14h10z"/><circle style="fill:#fff" cx="24" cy="24" r="2"/>',
  puzzle: '<path class="g" d="M9 15h9a5 5 0 1 1 10 0h9v9a5 5 0 1 1 0 10v8h-8a5 5 0 1 0-10 0H9v-9a5 5 0 1 0 0-10z"/>',
  action: '<path class="g" d="M28 4L10 27h11l-3 17 20-24H27z"/>',
  rpg: '<path class="g" d="M35 6h7v7L22 33l-7-7z"/><path class="l" d="M12 26l10 10M9 39l7-7"/>',
  strategy: '<path class="g" d="M13 13h4v4h4v-4h6v4h4v-4h4v10l-4 3 2 13H17l2-13-6-3z"/><path class="g" d="M11 39h26v4H11z"/>',
  platformer: '<path class="g" d="M5 34h14v8H5zM20 24h14v8H20zM33 12h10v8H33z"/><circle class="g" cx="12" cy="27" r="4"/>',
  shooter: '<circle class="l" cx="24" cy="24" r="14"/><path class="l" d="M24 4v10M24 34v10M4 24h10M34 24h10"/><circle class="g" cx="24" cy="24" r="4"/>',
  horror: '<path class="g" d="M11 42V22a13 13 0 0 1 26 0v20l-4.3-3.5L28.3 42 24 38.5 19.7 42l-4.4-3.5z"/><circle class="d" cx="19" cy="22" r="2.6"/><circle class="d" cx="29" cy="22" r="2.6"/>',
  survival: '<path class="g" d="M24 7L5 41h38z"/><path class="d" d="M24 22l-7 19h14z"/>',
  arcade: '<path class="g" d="M9 31h30a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-3a4 4 0 0 1 4-4z"/><path class="l" d="M19 31V19"/><circle class="g" cx="19" cy="13" r="7"/><circle class="g" cx="33" cy="26" r="3.5"/>',
  incremental: '<path class="g" d="M6 31h9v11H6zM19.5 23h9v19h-9zM33 15h9v27h-9z"/><path class="l" d="M7 23l12-10 6 5L39 6M32 6h7v7"/>',
  web: '<circle class="g" cx="24" cy="24" r="17"/><path class="l" style="stroke:hsl(var(--hue),45%,30%);stroke-width:2" d="M7 24h34M24 7c-7 6-7 28 0 34M24 7c7 6 7 28 0 34M10 15.5h28M10 32.5h28"/>',
  free: '<path class="g" d="M8 19h32v8H8zM11 27h26v15H11z"/><path class="d" d="M22 19h4v23h-4z"/><path class="l" d="M24 19c-3-9-12-8-10-3 1.5 3 10 3 10 3zm0 0c3-9 12-8 10-3-1.5 3-10 3-10 3z"/>',
  default: '<path class="g" d="M24 5l5.6 12.1 13.3 1.5-9.9 9 2.8 13.1L24 34.1l-11.8 6.6L15 27.6l-9.9-9 13.3-1.5z"/>',
};
const iconSvg = (key) => `<svg viewBox="0 0 48 48" aria-hidden="true">${ICONS[key] ?? ICONS.default}</svg>`;

// Line icons for buttons (24×24, stroked).
const UI_ICONS = {
  play: '<path class="fill" d="M8 5.5v13l10.5-6.5z"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  cart: '<path d="M4 5h2l2 10h10l2-7H7.2"/><circle cx="10" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  shield: '<path d="M12 3.5l7 2.8v5.4c0 4.3-3 7.6-7 8.8-4-1.2-7-4.5-7-8.8V6.3z"/><path d="M12 8.5v4.5M12 16h.01"/>',
};
const uiIcon = (name) => el('span', { className: 'ui-ico', innerHTML: `<svg viewBox="0 0 24 24" aria-hidden="true">${UI_ICONS[name]}</svg>` });

function buildCategories(games) {
  const genres = [...new Set(games.map((g) => g.genre))].sort((a, b) => genreLabel(a).localeCompare(genreLabel(b), LOCALE));
  return [
    { id: 'all', label: 'Todos', icon: 'all', games },
    ...genres.map((genre) => ({ id: `genre-${genre}`, label: genreLabel(genre), icon: genre.toLowerCase(), games: games.filter((g) => g.genre === genre) })),
    { id: 'web', label: 'En el navegador', icon: 'web', games: games.filter((g) => g.play) },
    { id: 'free', label: 'Gratis', icon: 'free', games: games.filter((g) => g.isFree) },
  ].filter((c) => c.games.length > 0);
}

/* ============================== Sound ============================== */

const sfx = (() => {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('tga.muted') === '1'; } catch { /* storage unavailable */ }

  function tone(freq, dur, { type = 'sine', gain = 0.04, delay = 0 } = {}) {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const SOUNDS = {
    move: () => tone(1480, 0.05, { gain: 0.025 }),
    cat: () => tone(990, 0.08, { type: 'triangle', gain: 0.035 }),
    open: () => [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(f, 0.45, { gain: 0.022, delay: i * 0.045 })),
    back: () => { tone(784, 0.08, { gain: 0.03 }); tone(523.3, 0.12, { gain: 0.03, delay: 0.06 }); },
    error: () => tone(196, 0.2, { type: 'square', gain: 0.015 }),
  };

  return {
    get muted() { return muted; },
    play(name) {
      if (muted) return;
      try {
        ctx ??= new AudioContext();
        if (ctx.state === 'suspended') ctx.resume();
        SOUNDS[name]?.();
      } catch { /* audio unsupported */ }
    },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('tga.muted', muted ? '1' : '0'); } catch { /* storage unavailable */ }
      return muted;
    },
  };
})();

/* ============================== Background ============================== */

/** The XMB ribbon + drifting particles, drawn over the game art backdrop. */
function startBackground(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, particles = [], raf = 0;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles = Array.from({ length: Math.round((w * h) / 16000) }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.08, vy: -(Math.random() * 0.12 + 0.02),
      a: Math.random() * 0.45 + 0.12, p: Math.random() * Math.PI * 2,
    }));
  }

  function draw(time) {
    const t = time / 1000;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    // The XMB "ribbon": a bundle of thin sine lines with slightly offset phases.
    const base = h * 0.62;
    const amp = Math.min(h * 0.09, 90);
    for (let j = 0; j < 18; j++) {
      const spread = j / 17;
      ctx.beginPath();
      for (let x = -10; x <= w + 10; x += 14) {
        const u = x / w;
        const y = base
          + Math.sin(u * 5.2 + t * 0.35 + spread * 0.9) * amp * (0.55 + spread * 0.5)
          + Math.sin(u * 2.1 - t * 0.22 + spread * 1.7) * amp * 0.45
          + (spread - 0.5) * 34;
        x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(220, 235, 255, ${0.025 + 0.06 * Math.sin(spread * Math.PI)})`;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
      if (p.x < -5) p.x = w + 5; else if (p.x > w + 5) p.x = -5;
      ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t * 1.3 + p.p));
      ctx.fillStyle = '#e6f0ff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function loop(time) { draw(time); raf = requestAnimationFrame(loop); }
  function sync() {
    cancelAnimationFrame(raf);
    if (reducedMotion.matches || document.hidden) draw(performance.now()); // one static frame
    else raf = requestAnimationFrame(loop);
  }

  addEventListener('resize', () => { resize(); sync(); });
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);
  resize();
  sync();
}

/** Full-page art behind everything; crossfades between two layers so it never flashes. */
const backdrop = (() => {
  const layers = [...document.querySelectorAll('#backdrop .bd-layer')];
  let front = 0;
  let current = null;
  let timer = 0;
  let token = 0;

  function show(url) {
    if (!url || url === current) return;
    current = url;
    const t = ++token;
    const next = layers[1 - front];
    const swap = () => {
      if (t !== token) return; // a newer request won
      next.classList.add('on');
      layers[front].classList.remove('on');
      front = 1 - front;
    };
    if (next.src === url && next.complete) swap();
    else {
      next.onload = swap;
      next.src = url;
    }
  }

  return {
    set(url, { delay = 0 } = {}) {
      clearTimeout(timer);
      if (delay) timer = setTimeout(() => show(url), delay);
      else show(url);
    },
  };
})();

/* ============================== Checkout (Paddle) ============================== */

const checkout = (() => {
  let config = {};
  let ready = null;

  function load() {
    ready ??= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PADDLE_SRC;
      script.onload = () => {
        try {
          if (config.environment === 'sandbox') window.Paddle.Environment.set('sandbox');
          window.Paddle.Initialize({ token: config.clientToken, eventCallback: onEvent });
          resolve(window.Paddle);
        } catch (err) { reject(err); }
      };
      script.onerror = () => reject(new Error('No se pudo cargar Paddle. Revisá tu conexión.'));
      document.head.append(script);
    }).catch((err) => { ready = null; throw err; });
    return ready;
  }

  function onEvent(event) {
    if (event?.name === 'checkout.completed') {
      sfx.play('open');
      toast('¡Compra completa! Te enviamos el link de descarga por email.', 7000);
    }
  }

  return {
    configure(cfg) { config = cfg ?? {}; },
    get configured() { return isText(config.clientToken); },
    async buy(game) {
      const Paddle = await load();
      // The price charged is the one set on this price ID in Paddle, not the display price in games.json.
      Paddle.Checkout.open({
        items: [{ priceId: game.paddlePriceId, quantity: 1 }],
        customData: { gameId: game.id },
        settings: { displayMode: 'overlay', theme: 'dark', locale: 'es' },
      });
    },
  };
})();

/* ============================== Ads ============================== */

const ads = (() => {
  let adsenseLoaded = false;

  function loadAdsense(client) {
    if (adsenseLoaded) return;
    adsenseLoaded = true;
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `${ADSENSE_SRC}?client=${encodeURIComponent(client)}`;
    document.head.append(s);
  }

  // Shown in the hero slot while no ad is configured, so the space never looks empty.
  function housePromo() {
    const subject = encodeURIComponent('Quiero publicar mi juego en TGA');
    return [
      el('span', { className: 'ad-icon', innerHTML: iconSvg('all') }),
      el('div', { className: 'ad-body' }, [
        el('strong', { className: 'ad-title', textContent: '¿Hacés juegos?' }),
        el('span', { className: 'ad-text', textContent: 'Publicá el tuyo en The Game Archive. Es gratis.' }),
      ]),
      el('a', { className: 'btn btn-light btn-sm', href: `mailto:${CONTACT_EMAIL}?subject=${subject}`, textContent: 'Escribinos' }),
    ];
  }

  return {
    /** Renders a slot. With no config, `house` shows the TGA promo; otherwise the slot stays hidden. */
    render(box, cfg, { house = false } = {}) {
      box.replaceChildren();
      box.classList.remove('is-house', 'is-custom', 'is-adsense');
      if (cfg?.type === 'adsense') {
        loadAdsense(cfg.client);
        const ins = el('ins', { className: 'adsbygoogle' });
        Object.assign(ins.dataset, { adClient: cfg.client, adSlot: cfg.slot, adFormat: 'auto', fullWidthResponsive: 'true' });
        box.append(el('span', { className: 'ad-label', textContent: 'Publicidad' }), ins);
        box.classList.add('is-adsense');
        box.hidden = false;
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* blocked by an ad blocker */ }
      } else if (cfg?.type === 'custom') {
        box.append(el('a', { className: 'ad-link', href: cfg.url, target: '_blank', rel: 'sponsored noopener noreferrer' }, [
          cfg.image ? el('img', { className: 'ad-img', src: cfg.image, alt: cfg.title, loading: 'lazy', decoding: 'async' }) : null,
          el('span', { className: 'ad-body' }, [
            el('span', { className: 'ad-label', textContent: 'Publicidad' }),
            cfg.title ? el('strong', { className: 'ad-title', textContent: cfg.title }) : null,
            cfg.text ? el('span', { className: 'ad-text', textContent: cfg.text }) : null,
            el('span', { className: 'btn btn-light btn-sm', textContent: cfg.cta }),
          ]),
        ]));
        box.classList.add('is-custom');
        box.hidden = false;
      } else if (house) {
        box.append(...housePromo());
        box.classList.add('is-house');
        box.hidden = false;
      } else {
        box.hidden = true;
      }
    },
  };
})();

/* ============================== UI helpers ============================== */

let toastTimer = 0;
function toast(message, ms = 3800) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), ms);
}

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null && c !== false && c !== ''));
  return node;
}

function announce(text) { $('announcer').textContent = text; }

function startClock() {
  const fmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const tick = () => {
    const now = new Date();
    $('clock').textContent = fmt.format(now);
    $('clock').dateTime = now.toISOString();
  };
  tick();
  setInterval(tick, 15000);
}

function showState(title, body) {
  const box = $('state');
  box.replaceChildren(el('strong', { textContent: title }), ...body);
  box.hidden = false;
  document.body.classList.add('no-games');
}

function gameUrl(game) {
  return `${location.origin}${location.pathname}#/game/${encodeURIComponent(game.id)}`;
}

/** Primary action for a game: play in browser, free download, or Paddle checkout. */
function makeCta(game) {
  if (game.play) {
    const a = el('a', { className: 'btn btn-light', href: game.play.url, target: '_blank', rel: 'noopener noreferrer' }, [uiIcon('play'), 'Jugar ahora']);
    a.addEventListener('click', () => sfx.play('open'));
    return a;
  }
  if (game.isFree) {
    const a = el('a', { className: 'btn btn-light', href: game.download.url, target: '_blank', rel: 'noopener noreferrer' }, [uiIcon('download'), 'Descargar gratis']);
    a.addEventListener('click', () => sfx.play('open'));
    return a;
  }
  const b = el('button', { type: 'button', className: 'btn btn-buy' }, [uiIcon('cart'), `Comprar · ${formatPrice(game.price)}`]);
  b.addEventListener('click', () => startPurchase(game, b));
  return b;
}

function metaChips(game) {
  return [
    el('span', { className: 'chip', textContent: game.genreLabel }),
    game.play ? el('span', { className: 'chip', textContent: 'En el navegador' }) : null,
    game.isNew ? el('span', { className: 'chip chip-new', textContent: 'Nuevo' }) : null,
  ];
}

/** Square covers sit "contained" over a blurred copy of themselves instead of being cropped. */
function fitCover(img, media) {
  const check = () => {
    const r = img.naturalWidth / img.naturalHeight;
    if (r && Math.abs(r - 16 / 9) > 0.3 && !media.classList.contains('contain')) {
      media.classList.add('contain');
      media.prepend(el('img', { className: 'card-fill', src: img.currentSrc || img.src, alt: '', decoding: 'async' }));
    }
  };
  if (img.complete && img.naturalWidth) check();
  else img.addEventListener('load', check, { once: true });
}

/* ============================== State ============================== */

const state = {
  games: [], cats: [], cat: 0, focus: new Map(),
  detail: null, returnFocus: null, hoverGame: null, ads: { hero: null, detail: null },
};
const hero = { games: [], index: 0, paused: false, hover: false };

function currentCat() { return state.cats[state.cat]; }
function focusIndex() { return Math.min(state.focus.get(currentCat().id) ?? 0, currentCat().games.length - 1); }

/* ============================== Backdrop preview ============================== */

function previewBackdrop(game) {
  if (state.detail) return;
  state.hoverGame = game;
  backdrop.set(game.background, { delay: 140 });
}

function clearPreview() {
  if (!state.hoverGame) return;
  state.hoverGame = null;
  const g = hero.games[hero.index];
  if (g) backdrop.set(g.background, { delay: 260 });
}

/* ============================== Hero carousel ============================== */

function renderHero(games) {
  hero.games = [...games].sort(byNewest).slice(0, HERO_COUNT);
  $('hero').style.setProperty('--hero-ms', `${HERO_MS}ms`);

  $('hero-slides').replaceChildren(...hero.games.map((g, i) => {
    const art = el('img', { className: 'slide-bg', src: g.background, alt: '', decoding: 'async', loading: i ? 'lazy' : 'eager' });
    if (!i) art.fetchPriority = 'high';
    const more = el('button', { type: 'button', className: 'btn btn-glass' }, [uiIcon('info'), 'Ver detalles']);
    more.addEventListener('click', () => openDetail(g, art));
    const slide = el('article', { className: 'slide', id: `slide-${i}` }, [
      art,
      el('div', { className: 'slide-shade' }),
      el('div', { className: 'slide-body' }, [
        el('h2', { className: 'slide-title', textContent: g.title }),
        el('div', { className: 'meta-row' }, [
          el('p', { className: 'chips' }, metaChips(g)),
          el('p', { className: 'slide-dev', textContent: [g.developer?.name, g.releasedDate && dateFmt.format(g.releasedDate)].filter(Boolean).join(' · ') }),
        ]),
        el('p', { className: 'slide-desc', textContent: g.description }),
        el('div', { className: 'slide-actions' }, [makeCta(g), more]),
      ]),
    ]);
    slide.setAttribute('aria-roledescription', 'diapositiva');
    slide.setAttribute('aria-label', `${i + 1} de ${hero.games.length}: ${g.title}`);
    // Clicking the art itself (not a button) also opens the game page.
    slide.addEventListener('click', (e) => { if (!e.target.closest('a, button')) openDetail(g, art); });
    return slide;
  }));

  $('hero-dots').replaceChildren(...hero.games.map((g, i) => {
    const fill = el('span', { className: 'dot-fill' });
    fill.addEventListener('animationend', () => goHero(hero.index + 1));
    const dot = el('button', { type: 'button', className: 'dot', id: `dot-${i}` }, [el('span', { className: 'dot-track' }, [fill])]);
    dot.setAttribute('aria-label', `Ver ${g.title}`);
    dot.addEventListener('click', () => goHero(i, { user: true }));
    return dot;
  }));

  $('hero-controls').hidden = hero.games.length < 2;
  hero.paused = reducedMotion.matches; // no auto-advance for people who asked for less motion
  syncHeroPause();
  goHero(0);
}

function goHero(i, { user = false } = {}) {
  const n = hero.games.length;
  if (!n) return;
  hero.index = ((i % n) + n) % n;
  document.querySelectorAll('#hero-slides .slide').forEach((s, j) => {
    const on = j === hero.index;
    s.classList.toggle('active', on);
    s.inert = !on;
    s.setAttribute('aria-hidden', String(!on));
  });
  document.querySelectorAll('#hero-dots .dot').forEach((d, j) => {
    d.classList.toggle('active', j === hero.index);
    d.setAttribute('aria-current', String(j === hero.index));
  });
  if (!state.hoverGame) backdrop.set(hero.games[hero.index].background);
  if (user) sfx.play('move');
}

function syncHeroPause() {
  const stopped = hero.paused || hero.hover || !!state.detail || document.hidden;
  $('hero').classList.toggle('is-paused', stopped);
  const btn = $('hero-pause');
  btn.setAttribute('aria-pressed', String(hero.paused));
  btn.setAttribute('aria-label', hero.paused ? 'Reanudar el carrusel' : 'Pausar el carrusel');
}

function bindHero() {
  const node = $('hero');
  $('hero-prev').addEventListener('click', () => goHero(hero.index - 1, { user: true }));
  $('hero-next').addEventListener('click', () => goHero(hero.index + 1, { user: true }));
  $('hero-pause').addEventListener('click', () => { hero.paused = !hero.paused; syncHeroPause(); sfx.play('cat'); });

  // Pause while the visitor is reading or using the slide.
  const setHover = (v) => { hero.hover = v; syncHeroPause(); };
  node.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') setHover(true); });
  node.addEventListener('pointerleave', () => setHover(false));
  node.addEventListener('focusin', () => setHover(true));
  node.addEventListener('focusout', (e) => { if (!node.contains(e.relatedTarget)) setHover(false); });
  document.addEventListener('visibilitychange', syncHeroPause);

  node.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      goHero(hero.index + (e.key === 'ArrowRight' ? 1 : -1), { user: true });
    }
  });

  // Touch swipe between slides.
  let start = null;
  node.addEventListener('touchstart', (e) => { start = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  node.addEventListener('touchend', (e) => {
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    start = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) goHero(hero.index + (dx < 0 ? 1 : -1), { user: true });
  });
}

/* ============================== Side list ============================== */

function renderWebList(games) {
  const allWeb = games.filter((g) => g.play);
  const web = allWeb.slice(0, 4);
  $('web-panel').hidden = !web.length;
  $('web-more').textContent = allWeb.length > web.length ? `Ver los ${allWeb.length} juegos web` : 'Ver en la biblioteca';
  $('web-list').replaceChildren(...web.map((g) => {
    const thumb = el('img', { className: 'mini-thumb', src: g.cover, alt: '', loading: 'lazy', decoding: 'async' });
    const open = el('button', { type: 'button', className: 'mini' }, [
      thumb,
      el('span', { className: 'mini-text' }, [
        el('span', { className: 'mini-title', textContent: g.title }),
        el('span', { className: 'mini-sub', textContent: g.genreLabel }),
      ]),
    ]);
    open.addEventListener('click', () => openDetail(g, thumb));
    open.addEventListener('pointerenter', () => previewBackdrop(g));
    open.addEventListener('pointerleave', clearPreview);
    const play = el('a', { className: 'mini-play', href: g.play.url, target: '_blank', rel: 'noopener noreferrer' }, [uiIcon('play')]);
    play.setAttribute('aria-label', `Jugar ${g.title} ahora`);
    play.addEventListener('click', () => sfx.play('open'));
    return el('li', {}, [open, play]);
  }));
}

/* ============================== Library ============================== */

function gameCard(game, { id, onOpen } = {}) {
  const img = el('img', { className: 'card-img', src: game.cover, alt: '', loading: 'lazy', decoding: 'async' });
  const media = el('span', { className: 'card-media' }, [
    img,
    game.isNew ? el('span', { className: 'tag tag-new', textContent: 'Nuevo' }) : null,
    el('span', { className: `tag tag-price ${game.isFree ? 'free' : 'paid'}`, textContent: game.isFree ? 'Gratis' : formatPrice(game.price) }),
  ]);
  fitCover(img, media);
  const card = el('button', { type: 'button', className: 'card' }, [
    media,
    el('span', { className: 'card-body' }, [
      el('span', { className: 'card-title', textContent: game.title }),
      el('span', { className: 'card-sub', textContent: [game.genreLabel, game.developer?.name].filter(Boolean).join(' · ') }),
    ]),
  ]);
  if (id) card.id = id;
  card.setAttribute('aria-label', `${game.title}, ${game.genreLabel}, ${game.isFree ? 'gratis' : formatPrice(game.price)}${game.isNew ? ', nuevo' : ''}`);
  card.addEventListener('click', () => (onOpen ? onOpen(game, media) : openDetail(game, media)));
  card.addEventListener('pointerenter', () => previewBackdrop(game));
  card.addEventListener('pointerleave', clearPreview);
  return card;
}

function renderCategories() {
  $('cats').replaceChildren(...state.cats.map((c, i) => {
    const btn = el('button', { type: 'button', className: 'cat', id: `cat-${i}`, tabIndex: -1 }, [
      el('span', { className: 'cat-icon', innerHTML: iconSvg(c.icon) }),
      el('span', { className: 'cat-label', textContent: c.label }),
      el('span', { className: 'cat-count', textContent: String(c.games.length) }),
    ]);
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', 'items');
    btn.addEventListener('click', () => selectCategory(i));
    return btn;
  }));
}

function syncCategories() {
  document.querySelectorAll('#cats .cat').forEach((c, i) => {
    c.setAttribute('aria-selected', String(i === state.cat));
    c.tabIndex = i === state.cat ? 0 : -1;
  });
  $('items').setAttribute('aria-labelledby', `cat-${state.cat}`);
  const n = currentCat().games.length;
  $('lib-count').textContent = `${n} ${n === 1 ? 'juego' : 'juegos'}`;
  // Keep the selected tab visible in the (phone-width) scrolling row without scrolling the page.
  const row = $('cats');
  const tab = $(`cat-${state.cat}`);
  if (tab && row.scrollWidth > row.clientWidth) {
    row.scrollTo({ left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }
}

function selectCategory(i, { focusTab = false } = {}) {
  if (i < 0 || i >= state.cats.length) return;
  if (focusTab) $(`cat-${i}`).focus({ preventScroll: true });
  if (i === state.cat) return;
  state.cat = i;
  sfx.play('cat');
  syncCategories();
  renderItems();
  const cat = currentCat();
  announce(`${cat.label}, ${cat.games.length} ${cat.games.length === 1 ? 'juego' : 'juegos'}`);
}

function renderItems() {
  const list = $('items');
  const fi = focusIndex();
  list.replaceChildren(...currentCat().games.map((g, i) => {
    const card = gameCard(g, { id: `item-${i}` });
    card.tabIndex = i === fi ? 0 : -1;
    card.addEventListener('focus', () => setRoving(i));
    const li = el('li', { className: 'card-li' }, [card]);
    li.style.setProperty('--i', Math.min(i, 10));
    return li;
  }));
  list.classList.remove('swap');
  void list.offsetWidth; // restart the staggered entrance
  list.classList.add('swap');
}

function setRoving(i) {
  state.focus.set(currentCat().id, i);
  document.querySelectorAll('#items .card').forEach((c, j) => { c.tabIndex = j === i ? 0 : -1; });
}

function focusCard(i) {
  const n = currentCat().games.length;
  if (!n) return;
  const j = Math.max(0, Math.min(n - 1, i));
  setRoving(j);
  const card = $(`item-${j}`);
  card?.focus({ preventScroll: true });
  card?.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

const gridCols = (list) => getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean).length || 1;

function bindLibrary() {
  // Category tabs: arrows move and select (automatic activation), Down jumps into the games.
  $('cats').addEventListener('keydown', (e) => {
    const keys = { ArrowLeft: state.cat - 1, ArrowRight: state.cat + 1, Home: 0, End: state.cats.length - 1 };
    if (e.key in keys) {
      e.preventDefault();
      selectCategory(Math.max(0, Math.min(state.cats.length - 1, keys[e.key])), { focusTab: true });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusCard(focusIndex());
    }
  });

  $('web-more').addEventListener('click', () => {
    const i = state.cats.findIndex((c) => c.id === 'web');
    if (i >= 0) selectCategory(i);
    $('library').scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    $('library').focus({ preventScroll: true });
  });

  // Game grid: 2D arrow navigation; Up from the first row returns to the tabs.
  $('items').addEventListener('keydown', (e) => {
    if (!e.target.closest('.card')) return;
    const i = focusIndex();
    const cols = gridCols($('items'));
    const n = currentCat().games.length;
    const target = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: n - 1 }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && target < 0) { $(`cat-${state.cat}`).focus(); return; }
    const j = Math.max(0, Math.min(n - 1, target));
    if (j !== i) { focusCard(j); sfx.play('move'); }
  });
  $('items').addEventListener('focusin', (e) => {
    const card = e.target.closest('.card');
    const i = card ? [...$('items').querySelectorAll('.card')].indexOf(card) : -1;
    if (i >= 0) previewBackdrop(currentCat().games[i]);
  });
  $('items').addEventListener('focusout', (e) => { if (!$('items').contains(e.relatedTarget)) clearPreview(); });
}

/* ============================== Detail view ============================== */

function fillDetail(game) {
  $('d-bg').src = game.background;
  $('d-cover').src = game.cover;
  $('d-cover').alt = `Portada de ${game.title}`;
  $('d-chips').replaceChildren(...metaChips(game).filter(Boolean));
  $('d-title').textContent = game.title;

  const dev = $('d-dev');
  dev.replaceChildren();
  if (game.developer) {
    const name = game.developer.url
      ? el('a', { href: game.developer.url, target: '_blank', rel: 'noopener noreferrer', textContent: game.developer.name })
      : el('strong', { textContent: game.developer.name });
    dev.append('de ', name);
  }
  if (game.releasedDate) dev.append(`${game.developer ? ' · ' : ''}Lanzado el ${dateFmt.format(game.releasedDate)}`);
  else if (game.released) dev.append(`${game.developer ? ' · ' : ''}Lanzado: ${game.released}`);

  const price = $('d-price');
  price.textContent = game.isFree ? 'Gratis' : formatPrice(game.price);
  price.className = `d-price ${game.isFree ? 'free' : 'paid'}`;

  const cta = makeCta(game);
  cta.id = 'd-primary';
  $('d-cta').replaceChildren(cta);

  const note = $('d-note');
  if (game.play) note.textContent = 'Se juega en el navegador, sin descargar nada.';
  else if (game.isFree) note.textContent = [game.download.platform, game.download.size].filter(isText).join(' · ');
  else {
    note.replaceChildren(
      'Pago seguro con Paddle. El link de descarga te llega por email. Al comprar aceptás los ',
      el('a', { href: 'legal.html#terms', textContent: 'Términos' }), ' y la ',
      el('a', { href: 'legal.html#refunds', textContent: 'Política de reembolsos' }), '.',
    );
  }

  // Unsigned Windows builds trigger SmartScreen; tell people how to get past it before they give up.
  const warn = $('d-warn');
  const isWindows = game.download && /windows|\.exe|\.zip/i.test(`${game.download.platform ?? ''} ${game.download.url}`);
  warn.hidden = !isWindows;
  if (isWindows) {
    warn.replaceChildren(uiIcon('shield'), el('span', {}, [
      'Si Windows muestra “Windows protegió su PC”, es porque el juego no está firmado digitalmente. Tocá ',
      el('strong', { textContent: 'Más información' }), ' y después ', el('strong', { textContent: 'Ejecutar de todas formas' }), '.',
    ]));
  }

  $('d-desc').textContent = game.description;
  const reqs = $('d-reqs');
  reqs.replaceChildren(...game.requirements.flatMap(([k, v]) => [el('dt', { textContent: reqLabel(k) }), el('dd', { textContent: v })]));
  if (!game.requirements.length) reqs.append(el('dd', { textContent: 'El desarrollador no los especificó.' }));

  // Screenshots
  const shots = game.screenshots;
  $('d-shots-wrap').hidden = !shots.length;
  $('d-shots').replaceChildren(...shots.map((src, i) => {
    const b = el('button', { type: 'button', className: 'shot' }, [el('img', { src, alt: '', loading: 'lazy', decoding: 'async' })]);
    b.setAttribute('aria-label', `Ver captura ${i + 1} de ${shots.length}`);
    b.addEventListener('click', () => viewer.open(shots, i));
    return el('li', {}, [b]);
  }));

  // Trailer: a poster button; YouTube only loads when the visitor asks for it.
  const trailer = $('d-trailer');
  trailer.replaceChildren();
  $('d-trailer-wrap').hidden = !game.trailer;
  if (game.trailer) {
    const b = el('button', { type: 'button', className: 'trailer-btn' }, [
      el('img', { src: `https://i.ytimg.com/vi/${game.trailer}/hqdefault.jpg`, alt: '', loading: 'lazy', decoding: 'async' }),
      el('span', { className: 'trailer-play' }, [uiIcon('play')]),
    ]);
    b.setAttribute('aria-label', `Reproducir el tráiler de ${game.title}`);
    b.addEventListener('click', () => {
      const frame = el('iframe', {
        src: `https://www.youtube-nocookie.com/embed/${game.trailer}?autoplay=1&rel=0`,
        title: `Tráiler de ${game.title}`,
        allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
        allowFullscreen: true,
      });
      trailer.replaceChildren(frame);
      frame.focus();
    });
    trailer.append(b);
  }

  // Related: same genre first, then the rest.
  const others = state.games.filter((g) => g !== game);
  const related = [...others.filter((g) => g.genre === game.genre), ...others.filter((g) => g.genre !== game.genre)].slice(0, 4);
  $('d-related-wrap').hidden = !related.length;
  $('d-related').replaceChildren(...related.map((g) => el('li', { className: 'card-li' }, [gameCard(g, { onOpen: switchDetail })])));
}

async function startPurchase(game, button) {
  if (!checkout.configured) {
    sfx.play('error');
    toast('El pago todavía no está configurado: falta el client token de Paddle en games.json.', 6000);
    return;
  }
  button.disabled = true;
  try {
    await checkout.buy(game);
  } catch (err) {
    sfx.play('error');
    toast(err.message || 'No se pudo abrir el pago. Probá de nuevo.', 6000);
  } finally {
    button.disabled = false;
  }
}

let detailAdRendered = false;
function ensureDetailAd() {
  if (detailAdRendered || !state.ads.detail) return;
  detailAdRendered = true;
  // Rendered on first open so AdSense measures a visible box.
  requestAnimationFrame(() => ads.render($('ad-detail'), state.ads.detail));
}

function openDetail(game, fromEl, { pushHistory = true } = {}) {
  if (state.detail) return;
  const detail = $('detail');
  state.detail = game;
  state.returnFocus = fromEl?.closest('button, a') ?? document.activeElement;
  clearPreview();
  fillDetail(game);

  // Expand from the clicked artwork's on-screen rect to full screen.
  if (fromEl) {
    const r = fromEl.getBoundingClientRect();
    detail.style.setProperty('--from', `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round 18px)`);
  } else {
    detail.style.removeProperty('--from');
  }
  detail.hidden = false;
  $('app').inert = true;
  document.documentElement.classList.add('locked');
  void detail.offsetWidth;
  detail.classList.add('open');
  $('d-body').scrollTop = 0;
  sfx.play('open');
  syncHeroPause();
  ensureDetailAd();
  $('d-primary').focus({ preventScroll: true });

  if (pushHistory) history.pushState({ game: game.id }, '', `#/game/${encodeURIComponent(game.id)}`);
}

/** Swap the open detail page to another game (from "También te puede gustar"). */
function switchDetail(game) {
  if (!state.detail || state.detail === game) return;
  state.detail = game;
  fillDetail(game);
  history.replaceState({ game: game.id }, '', `#/game/${encodeURIComponent(game.id)}`);
  const body = $('d-body');
  body.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  if (!reducedMotion.matches) {
    body.querySelector('.d-grid').animate(
      [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
      { duration: 320, easing: 'cubic-bezier(.23, 1, .32, 1)' },
    );
  }
  sfx.play('open');
  $('d-primary').focus({ preventScroll: true });
}

function closeDetail({ fromHistory = false } = {}) {
  if (!state.detail) return;
  // Let the history entry drive the close so Back button and Esc behave the same.
  if (!fromHistory && history.state?.game) return history.back();

  const detail = $('detail');
  state.detail = null;
  detail.classList.remove('open');
  $('app').inert = false;
  document.documentElement.classList.remove('locked');
  sfx.play('back');
  syncHeroPause();

  const finish = () => {
    if (state.detail) return;
    detail.hidden = true;
    $('d-trailer').replaceChildren(); // stops a playing trailer
  };
  if (reducedMotion.matches) finish();
  else {
    detail.addEventListener('transitionend', function onEnd(e) {
      if (e.target !== detail) return;
      detail.removeEventListener('transitionend', onEnd);
      finish();
    });
    setTimeout(finish, 800); // fallback if transitionend never fires
  }
  const back = state.returnFocus;
  if (back?.isConnected) back.focus({ preventScroll: true });
  else $(`item-${focusIndex()}`)?.focus({ preventScroll: true });
  if (!fromHistory && location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function gameFromHash() {
  const m = location.hash.match(/^#\/game\/(.+)$/);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  return state.games.find((g) => g.id === id) ?? null;
}

async function shareGame() {
  const game = state.detail;
  if (!game) return;
  const url = gameUrl(game);
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: game.title, text: `${game.title} en The Game Archive`, url }); } catch { /* cancelled */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    sfx.play('cat');
    toast('Link copiado. ¡Pasalo!');
  } catch {
    toast(url, 8000);
  }
}

/* ============================== Screenshot viewer ============================== */

const viewer = (() => {
  const dlg = $('viewer');
  const img = $('viewer-img');
  let list = [];
  let index = 0;

  function show(i) {
    index = ((i % list.length) + list.length) % list.length;
    img.src = list[index];
    img.alt = `Captura ${index + 1} de ${list.length}`;
    $('viewer-count').textContent = `${index + 1} / ${list.length}`;
    $('viewer-prev').hidden = $('viewer-next').hidden = list.length < 2;
  }
  const step = (d) => { if (list.length > 1) { show(index + d); sfx.play('move'); } };

  $('viewer-prev').addEventListener('click', () => step(-1));
  $('viewer-next').addEventListener('click', () => step(1));
  $('viewer-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // click outside the image
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });
  dlg.addEventListener('close', () => sfx.play('back'));

  return {
    open(shots, i) {
      list = shots;
      show(i);
      dlg.showModal();
      sfx.play('open');
    },
  };
})();

/* ============================== Input ============================== */

function bindInput(search) {
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if ($('viewer').open) return; // the dialog handles its own keys
    const typing = e.target.closest?.('input, textarea, [contenteditable="true"]');
    if (state.detail) {
      if (e.key === 'Escape' || (e.key === 'Backspace' && !typing)) {
        e.preventDefault();
        closeDetail();
      }
      return;
    }
    if (typing || !state.cats.length) return;
    if (e.key === '/') {
      e.preventDefault();
      search.open();
      return;
    }
    // Nothing focused yet: arrows still drive the library, like the old XMB.
    if (e.target === document.body || e.target === $('library')) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        selectCategory(state.cat + (e.key === 'ArrowRight' ? 1 : -1), { focusTab: true });
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        focusCard(focusIndex());
      }
    }
  });

  $('d-back').addEventListener('click', () => closeDetail());
  $('d-share').addEventListener('click', shareGame);
  addEventListener('popstate', () => {
    const game = gameFromHash();
    if (game && !state.detail) openDetail(game, null, { pushHistory: false });
    else if (game && state.detail && state.detail !== game) switchDetail(game);
    else if (!game && state.detail) closeDetail({ fromHistory: true });
  });

  const mute = $('mute');
  const syncMute = () => {
    mute.setAttribute('aria-pressed', String(sfx.muted));
    mute.setAttribute('aria-label', sfx.muted ? 'Activar sonidos' : 'Silenciar sonidos');
  };
  mute.addEventListener('click', () => { sfx.toggle(); syncMute(); sfx.play('cat'); });
  syncMute();

  // Top bar gets a solid backing once the page scrolls under it.
  const topbar = $('topbar');
  const onScroll = () => topbar.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  $('brand').addEventListener('click', (e) => {
    e.preventDefault();
    scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  });
}

/** Sections rise in once as they scroll into view. Content stays visible if this never runs. */
function bindReveal() {
  const nodes = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) { nodes.forEach((n) => n.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  nodes.forEach((n) => io.observe(n));
}

/* ============================== Search ============================== */

// Case- and accent-insensitive, so "unregistered" finds "UNREGISTERED" and "accion" finds "Acción".
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function bindSearch() {
  const wrap = $('search');
  const btn = $('search-btn');
  const input = $('search-input');
  const list = $('search-results');
  let matches = [];
  let active = -1;

  const setActive = (i) => {
    active = i;
    list.querySelectorAll('[role="option"]').forEach((opt, j) => opt.setAttribute('aria-selected', String(j === i)));
    const opt = $(`sr-${i}`);
    if (opt) {
      input.setAttribute('aria-activedescendant', opt.id);
      opt.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  const render = () => {
    const q = fold(input.value.trim());
    matches = q ? state.games.filter((g) => fold([g.title, g.genre, g.genreLabel, g.developer?.name ?? ''].join(' ')).includes(q)) : [];
    list.replaceChildren(...matches.map((g, i) => {
      const opt = el('li', { id: `sr-${i}`, className: 'sr-item' }, [
        el('img', { src: g.cover, alt: '', loading: 'lazy', decoding: 'async' }),
        el('span', { className: 'sr-text' }, [
          el('span', { className: 'sr-title', textContent: g.title }),
          el('span', { className: 'sr-sub', textContent: [g.genreLabel, g.developer?.name].filter(Boolean).join(' · ') }),
        ]),
      ]);
      opt.setAttribute('role', 'option');
      opt.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
      opt.addEventListener('mousemove', () => { if (active !== i) setActive(i); });
      opt.addEventListener('click', () => choose(i));
      return opt;
    }));
    if (q && !matches.length) list.append(el('li', { className: 'sr-empty', textContent: 'No encontramos juegos con ese nombre.' }));
    list.hidden = !q;
    input.setAttribute('aria-expanded', String(matches.length > 0));
    setActive(matches.length ? 0 : -1);
    announce(q ? `${matches.length} ${matches.length === 1 ? 'resultado' : 'resultados'}` : '');
  };

  const open = () => {
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    input.focus();
  };

  const close = () => {
    wrap.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    if (input.value) { input.value = ''; render(); }
  };

  const choose = (i) => {
    const game = matches[i];
    if (!game) return;
    close();
    input.blur();
    openDetail(game, null);
  };

  btn.addEventListener('click', () => {
    if (wrap.classList.contains('open')) { close(); btn.focus(); } else { open(); sfx.play('cat'); }
  });
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // typing must not drive the library
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (matches.length) setActive((active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      const wasOpen = wrap.classList.contains('open');
      close();
      if (wasOpen) btn.focus(); else input.blur();
    }
  });
  document.addEventListener('pointerdown', (e) => { if (!wrap.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); });

  return { open };
}

/* ============================== Boot ============================== */

async function boot() {
  document.documentElement.style.setProperty('--hue', MONTH_HUES[new Date().getMonth()]);
  startBackground($('bg'));
  startClock();
  const search = bindSearch();
  bindInput(search);
  bindHero();
  bindLibrary();
  bindReveal();

  let catalog;
  try {
    catalog = await loadCatalog();
  } catch (err) {
    console.error('[TGA]', err);
    const hint = location.protocol === 'file:'
      ? [el('span', { textContent: 'El navegador no deja leer games.json desde un archivo local. Abrí ' }), el('code', { textContent: 'start.bat' }), el('span', { textContent: ' y entrá a la dirección que muestra.' })]
      : [el('span', { textContent: err.message })];
    showState('No se pudo cargar la biblioteca', hint);
    return;
  }

  checkout.configure(catalog.paddle);
  state.games = catalog.games;
  state.ads = catalog.ads;
  state.cats = buildCategories(catalog.games);
  ads.render($('ad-hero'), catalog.ads.hero, { house: true });
  if (!state.cats.length) {
    showState('Todavía no hay juegos', [el('span', { textContent: 'Agregá un juego a ' }), el('code', { textContent: 'games.json' }), el('span', { textContent: ' y recargá.' })]);
    return;
  }
  renderHero(catalog.games);
  renderWebList(catalog.games);
  renderCategories();
  syncCategories();
  renderItems();
  document.body.classList.add('ready');

  const linked = gameFromHash();
  // Deep link: no history entry is pushed, so closing clears the hash instead of leaving the site.
  if (linked) openDetail(linked, null, { pushHistory: false });
}

boot();
