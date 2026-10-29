'use strict';
/*
 * TGA (The Game Archive) — XMB-style launcher.
 * The whole library is driven by games.json; see README.md for the schema.
 */

const DATA_URL = 'games.json';
const PADDLE_SRC = 'https://cdn.paddle.com/paddle/v2/paddle.js';
const MONTH_HUES = [215, 200, 145, 95, 55, 185, 225, 170, 280, 30, 330, 5]; // XMB-style monthly tint
const formatPrice = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
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
  return {
    id: g.id,
    title: g.title.trim(),
    genre: g.genre.trim(),
    description: g.description.trim(),
    price: g.price,
    isFree,
    cover: safeUrl(g.cover),
    background: safeUrl(g.background) ?? safeUrl(g.cover),
    developer: isText(g.developer?.name) ? { name: g.developer.name.trim(), url: safeUrl(g.developer.url) } : null,
    released: isText(g.released) ? g.released : null,
    requirements: Object.entries(reqs).filter(([k, v]) => isText(k) && isText(String(v))).map(([k, v]) => [k, String(v)]),
    download: isFree && safeUrl(g.download?.url) ? { url: safeUrl(g.download.url), size: g.download.size, platform: g.download.platform } : null,
    play: isFree && safeUrl(g.play?.url) ? { url: safeUrl(g.play.url) } : null,
    paddlePriceId: isFree ? null : g.paddlePriceId.trim(),
  };
}

async function loadCatalog() {
  const res = await fetch(DATA_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`games.json returned HTTP ${res.status}`);
  let raw;
  try {
    raw = await res.json();
  } catch (err) {
    throw new Error(`games.json is not valid JSON (${err.message})`);
  }
  const games = [];
  const seen = new Set();
  (Array.isArray(raw?.games) ? raw.games : []).forEach((g, i) => {
    const problem = validateGame(g, seen);
    if (problem) return console.warn(`[TGA] games.json entry #${i + 1} skipped: ${problem}`);
    seen.add(g.id);
    games.push(normalizeGame(g));
  });
  return { games, paddle: raw?.store?.paddle ?? {} };
}

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
  arcade: '<path class="g" d="M9 31h30a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-3a4 4 0 0 1 4-4z"/><path class="l" d="M19 31V19"/><circle class="g" cx="19" cy="13" r="7"/><circle class="g" cx="33" cy="26" r="3.5"/>',
  incremental: '<path class="g" d="M6 31h9v11H6zM19.5 23h9v19h-9zM33 15h9v27h-9z"/><path class="l" d="M7 23l12-10 6 5L39 6M32 6h7v7"/>',
  web: '<circle class="g" cx="24" cy="24" r="17"/><path class="l" style="stroke:hsl(var(--hue),45%,30%);stroke-width:2" d="M7 24h34M24 7c-7 6-7 28 0 34M24 7c7 6 7 28 0 34M10 15.5h28M10 32.5h28"/>',
  free: '<path class="g" d="M8 19h32v8H8zM11 27h26v15H11z"/><path class="d" d="M22 19h4v23h-4z"/><path class="l" d="M24 19c-3-9-12-8-10-3 1.5 3 10 3 10 3zm0 0c3-9 12-8 10-3-1.5 3-10 3-10 3z"/>',
  default: '<path class="g" d="M24 5l5.6 12.1 13.3 1.5-9.9 9 2.8 13.1L24 34.1l-11.8 6.6L15 27.6l-9.9-9 13.3-1.5z"/>',
};
const iconSvg = (key) => `<svg viewBox="0 0 48 48" aria-hidden="true">${ICONS[key] ?? ICONS.default}</svg>`;

function buildCategories(games) {
  const genres = [...new Set(games.map((g) => g.genre))].sort((a, b) => a.localeCompare(b));
  return [
    { id: 'all', label: 'All Games', icon: 'all', games },
    ...genres.map((genre) => ({ id: `genre-${genre}`, label: genre, icon: genre.toLowerCase(), games: games.filter((g) => g.genre === genre) })),
    { id: 'web', label: 'Web Games', icon: 'web', games: games.filter((g) => g.play) },
    { id: 'free', label: 'Free', icon: 'free', games: games.filter((g) => g.isFree) },
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
      script.onerror = () => reject(new Error('Paddle could not be loaded. Check your connection.'));
      document.head.append(script);
    }).catch((err) => { ready = null; throw err; });
    return ready;
  }

  function onEvent(event) {
    if (event?.name === 'checkout.completed') {
      sfx.play('open');
      toast('Purchase complete — your download link has been sent to your email.', 7000);
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
        settings: { displayMode: 'overlay', theme: 'dark' },
      });
    },
  };
})();

/* ============================== UI helpers ============================== */

let toastTimer = 0;
function toast(message, ms = 3800) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function startClock() {
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
}

/* ============================== XMB ============================== */

const state = { cats: [], cat: 0, focus: new Map(), detail: null };

function currentCat() { return state.cats[state.cat]; }
function focusIndex() { return state.focus.get(currentCat().id) ?? 0; }

function renderCategories() {
  const row = $('cats');
  row.replaceChildren(...state.cats.map((c, i) => {
    const btn = el('button', { type: 'button', className: 'cat', id: `cat-${i}`, tabIndex: -1 }, [
      el('span', { className: 'cat-icon', innerHTML: iconSvg(c.icon) }),
      el('span', { className: 'cat-label', textContent: c.label }),
    ]);
    btn.setAttribute('role', 'tab');
    btn.addEventListener('click', () => selectCategory(i));
    return btn;
  }));
}

function renderItems() {
  const list = $('items');
  const cat = currentCat();
  list.replaceChildren(...cat.games.map((g, i) => {
    const btn = el('button', { type: 'button', className: 'item', id: `item-${i}`, tabIndex: -1 }, [
      el('span', { className: 'thumb' }, [el('img', { src: g.cover, alt: '', loading: 'lazy', decoding: 'async' })]),
      el('span', { className: 'meta' }, [
        el('span', { className: 'm-title', textContent: g.title }),
        el('span', { className: 'm-sub', textContent: [g.genre, g.developer?.name].filter(Boolean).join(' · ') }),
        el('span', { className: `m-price ${g.isFree ? 'free' : 'paid'}`, textContent: g.isFree ? 'Free' : formatPrice(g.price) }),
      ]),
    ]);
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-label', `${g.title}, ${g.genre}, ${g.isFree ? 'free' : formatPrice(g.price)}`);
    btn.addEventListener('click', () => (i === focusIndex() ? openDetail(g, btn) : focusItem(i)));
    return el('li', { role: 'none' }, [btn]);
  }));
  list.classList.remove('swap');
  void list.offsetWidth; // restart the column entrance animation
  list.classList.add('swap');
}

/** Position items XMB-style: focused item under the category bar, earlier items above it. */
function layoutItems(moveFocus = true) {
  const css = getComputedStyle(document.documentElement);
  const itemH = parseFloat(css.getPropertyValue('--item-h'));
  const thumbH = parseFloat(css.getPropertyValue('--thumb-h'));
  const scale = parseFloat(css.getPropertyValue('--focus-scale'));
  const catRowH = parseFloat(css.getPropertyValue('--cat-row-h'));
  const extra = thumbH * (scale - 1); // the focused thumbnail grows
  const focus = focusIndex();

  document.querySelectorAll('#items .item').forEach((item, i) => {
    let y;
    if (i === focus) y = extra / 2;
    else if (i > focus) y = extra + (i - focus) * itemH;
    else y = -catRowH - (focus - i) * itemH;
    item.style.transform = `translateY(${y}px)`;
    item.classList.toggle('focused', i === focus);
    item.classList.toggle('above', i < focus);
    item.classList.toggle('far', i < focus - 2);
    item.setAttribute('aria-selected', String(i === focus));
    item.tabIndex = i === focus ? 0 : -1;
    if (i === focus && moveFocus && !state.detail) item.focus({ preventScroll: true });
  });
}

function syncCategories() {
  $('cats').style.setProperty('--cat-index', state.cat);
  document.querySelectorAll('#cats .cat').forEach((c, i) => c.setAttribute('aria-selected', String(i === state.cat)));
  $('items').setAttribute('aria-labelledby', `cat-${state.cat}`);
}

function selectCategory(i) {
  if (i < 0 || i >= state.cats.length || i === state.cat) return;
  state.cat = i;
  sfx.play('cat');
  syncCategories();
  renderItems();
  layoutItems();
  const cat = currentCat();
  $('announcer').textContent = `${cat.label}, ${cat.games.length} ${cat.games.length === 1 ? 'game' : 'games'}`;
}

function focusItem(i) {
  const n = currentCat().games.length;
  if (i < 0 || i >= n || i === focusIndex()) return;
  state.focus.set(currentCat().id, i);
  sfx.play('move');
  layoutItems();
}

/* ============================== Detail view ============================== */

function fillDetail(game) {
  $('d-bg').src = game.background;
  $('d-cover').src = game.cover;
  $('d-cover').alt = `${game.title} cover art`;
  $('d-genre').textContent = game.genre;
  $('d-title').textContent = game.title;

  const dev = $('d-dev');
  dev.replaceChildren();
  if (game.developer) {
    const name = game.developer.url
      ? el('a', { href: game.developer.url, target: '_blank', rel: 'noopener noreferrer', textContent: game.developer.name })
      : document.createTextNode(game.developer.name);
    dev.append('by ', name);
  }
  if (game.released) dev.append(`${game.developer ? ' · ' : ''}Released ${game.released}`);

  const price = $('d-price');
  price.textContent = game.isFree ? 'Free' : formatPrice(game.price);
  price.className = `d-price ${game.isFree ? 'free' : 'paid'}`;

  const note = $('d-note');
  let cta;
  if (game.play) {
    cta = el('a', { className: 'btn free', href: game.play.url, target: '_blank', rel: 'noopener noreferrer', textContent: 'Play Now' });
    cta.addEventListener('click', () => sfx.play('open'));
    note.textContent = 'Runs in your browser — no download needed.';
  } else if (game.isFree) {
    cta = el('a', { className: 'btn free', href: game.download.url, target: '_blank', rel: 'noopener noreferrer', textContent: 'Download Free' });
    cta.addEventListener('click', () => sfx.play('open'));
    note.textContent = [game.download.platform, game.download.size].filter(isText).join(' · ');
  } else {
    cta = el('button', { type: 'button', className: 'btn buy', textContent: `Buy · ${formatPrice(game.price)}` });
    cta.addEventListener('click', () => startPurchase(game, cta));
    note.replaceChildren(
      'Secure checkout by Paddle. Your download link is emailed after purchase. By buying you agree to our ',
      el('a', { href: 'legal.html#terms', textContent: 'Terms' }), ' and ',
      el('a', { href: 'legal.html#refunds', textContent: 'Refund Policy' }), '.',
    );
  }
  cta.id = 'd-primary';
  $('d-cta').replaceChildren(cta);

  $('d-desc').textContent = game.description;
  const reqs = $('d-reqs');
  reqs.replaceChildren(...game.requirements.flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v })]));
  if (!game.requirements.length) reqs.append(el('dd', { textContent: 'Not specified by the developer.' }));
}

async function startPurchase(game, button) {
  if (!checkout.configured) {
    sfx.play('error');
    toast('Checkout isn’t configured yet — add your Paddle client token to games.json.', 6000);
    return;
  }
  button.disabled = true;
  try {
    await checkout.buy(game);
  } catch (err) {
    sfx.play('error');
    toast(err.message || 'Checkout failed to open. Please try again.', 6000);
  } finally {
    button.disabled = false;
  }
}

function openDetail(game, fromItem, { pushHistory = true } = {}) {
  if (state.detail) return;
  const detail = $('detail');
  state.detail = game;
  fillDetail(game);

  // Expand from the thumbnail's on-screen rect to full screen.
  const thumb = fromItem?.querySelector('.thumb');
  if (thumb) {
    const r = thumb.getBoundingClientRect();
    detail.style.setProperty('--from', `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round 6px)`);
  } else {
    detail.style.removeProperty('--from');
  }
  detail.hidden = false;
  $('app').inert = true;
  void detail.offsetWidth;
  detail.classList.add('open');
  detail.querySelector('.d-body').scrollTop = 0;
  sfx.play('open');
  $('d-primary').focus({ preventScroll: true });

  if (pushHistory) history.pushState({ game: game.id }, '', `#/game/${encodeURIComponent(game.id)}`);
}

function closeDetail({ fromHistory = false } = {}) {
  if (!state.detail) return;
  // Let the history entry drive the close so Back button and Esc behave the same.
  if (!fromHistory && history.state?.game) return history.back();

  const detail = $('detail');
  state.detail = null;
  detail.classList.remove('open');
  $('app').inert = false;
  sfx.play('back');

  const finish = () => { if (!state.detail) detail.hidden = true; };
  if (reducedMotion.matches) finish();
  else {
    detail.addEventListener('transitionend', function onEnd(e) {
      if (e.target !== detail) return;
      detail.removeEventListener('transitionend', onEnd);
      finish();
    });
    setTimeout(finish, 800); // fallback if transitionend never fires
  }
  layoutItems();
  if (!fromHistory && location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function gameFromHash() {
  const m = location.hash.match(/^#\/game\/(.+)$/);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  return state.cats[0]?.games.find((g) => g.id === id) ?? null;
}

/* ============================== Input ============================== */

function bindInput() {
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (state.detail) {
      if (e.key === 'Escape' || (e.key === 'Backspace' && !e.target.closest('input, textarea'))) {
        e.preventDefault();
        closeDetail();
      }
      return;
    }
    if (!state.cats.length) return;
    const actions = {
      ArrowLeft: () => selectCategory(state.cat - 1),
      ArrowRight: () => selectCategory(state.cat + 1),
      ArrowUp: () => focusItem(focusIndex() - 1),
      ArrowDown: () => focusItem(focusIndex() + 1),
      Home: () => focusItem(0),
      End: () => focusItem(currentCat().games.length - 1),
      Enter: () => {
        const i = focusIndex();
        openDetail(currentCat().games[i], document.getElementById(`item-${i}`));
      },
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      if (!e.repeat || e.key.startsWith('Arrow')) action();
    }
  });

  // Mouse wheel / trackpad: accumulate so one notch = one step.
  let wheel = 0;
  $('xmb').addEventListener('wheel', (e) => {
    if (state.detail || !state.cats.length) return;
    e.preventDefault();
    wheel += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? 0 : e.deltaY;
    if (Math.abs(wheel) >= 60) {
      focusItem(focusIndex() + Math.sign(wheel));
      wheel = 0;
    }
  }, { passive: false });

  // Touch swipes: vertical = games, horizontal = categories.
  let start = null;
  $('xmb').addEventListener('touchstart', (e) => { start = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  $('xmb').addEventListener('touchend', (e) => {
    if (!start || state.detail || !state.cats.length) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
    if (Math.abs(dx) > Math.abs(dy)) selectCategory(state.cat + (dx < 0 ? 1 : -1));
    else focusItem(focusIndex() + (dy < 0 ? 1 : -1));
  });

  $('d-back').addEventListener('click', () => closeDetail());
  addEventListener('popstate', () => {
    const game = gameFromHash();
    if (game && !state.detail) openDetail(game, null, { pushHistory: false });
    else if (!game && state.detail) closeDetail({ fromHistory: true });
  });
  addEventListener('resize', () => layoutItems(false));

  const mute = $('mute');
  const syncMute = () => {
    mute.setAttribute('aria-pressed', String(sfx.muted));
    mute.setAttribute('aria-label', sfx.muted ? 'Unmute sounds' : 'Mute sounds');
  };
  mute.addEventListener('click', () => { sfx.toggle(); syncMute(); sfx.play('cat'); });
  syncMute();
}

/* ============================== Search ============================== */

// Case- and accent-insensitive, so "unregistered" finds "UNREGISTERED" and "accion" finds "Acción".
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function bindSearch() {
  const wrap = $('search');
  const btn = $('search-btn');
  const box = $('search-box');
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
    const games = state.cats[0]?.games ?? []; // "All Games"
    matches = q ? games.filter((g) => fold([g.title, g.genre, g.developer?.name ?? ''].join(' ')).includes(q)) : [];
    list.replaceChildren(...matches.map((g, i) => {
      const opt = el('li', { id: `sr-${i}`, className: 'sr-item' }, [
        el('img', { src: g.cover, alt: '', loading: 'lazy', decoding: 'async' }),
        el('span', { className: 'sr-text' }, [
          el('span', { className: 'sr-title', textContent: g.title }),
          el('span', { className: 'sr-sub', textContent: [g.genre, g.developer?.name].filter(Boolean).join(' · ') }),
        ]),
      ]);
      opt.setAttribute('role', 'option');
      opt.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
      opt.addEventListener('mousemove', () => { if (active !== i) setActive(i); });
      opt.addEventListener('click', () => choose(i));
      return opt;
    }));
    if (q && !matches.length) list.append(el('li', { className: 'sr-empty', textContent: 'No games found' }));
    list.hidden = !q;
    input.setAttribute('aria-expanded', String(matches.length > 0));
    setActive(matches.length ? 0 : -1);
    $('announcer').textContent = q ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'}` : '';
  };

  const open = () => {
    box.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    input.focus();
    sfx.play('cat');
  };

  const close = ({ refocus = true } = {}) => {
    if (box.hidden) return;
    box.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    input.value = '';
    render();
    if (refocus) layoutItems(); // hands focus back to the XMB
  };

  const choose = (i) => {
    const game = matches[i];
    if (!game) return;
    close({ refocus: false });
    openDetail(game, null);
  };

  btn.addEventListener('click', () => (box.hidden ? open() : close()));
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // typing must not drive the XMB
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (matches.length) setActive((active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });
  document.addEventListener('pointerdown', (e) => { if (!wrap.contains(e.target)) close({ refocus: false }); });
}

/* ============================== Boot ============================== */

async function boot() {
  document.documentElement.style.setProperty('--hue', MONTH_HUES[new Date().getMonth()]);
  startBackground($('bg'));
  startClock();
  bindInput();
  bindSearch();

  let catalog;
  try {
    catalog = await loadCatalog();
  } catch (err) {
    console.error('[TGA]', err);
    const hint = location.protocol === 'file:'
      ? [el('span', { textContent: 'Browsers block reading games.json from a file:// page. Run ' }), el('code', { textContent: 'start.bat' }), el('span', { textContent: ' and open the address it prints.' })]
      : [el('span', { textContent: err.message })];
    showState('Couldn’t load the library', hint);
    return;
  }

  checkout.configure(catalog.paddle);
  state.cats = buildCategories(catalog.games);
  if (!state.cats.length) {
    showState('No games yet', [el('span', { textContent: 'Add a game object to ' }), el('code', { textContent: 'games.json' }), el('span', { textContent: ' and reload.' })]);
    return;
  }
  renderCategories();
  syncCategories();
  renderItems();
  layoutItems();

  const linked = gameFromHash();
  // Deep link: no history entry is pushed, so closing clears the hash instead of leaving the site.
  if (linked) openDetail(linked, null, { pushHistory: false });
}

boot();
