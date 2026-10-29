/* The Typing Knight — game engine.
 * World is simulated in a low-resolution "world space" (360 px tall, width follows the
 * viewport aspect). Pixel art is drawn into a low-res buffer and scaled up crisply; words,
 * glows and slashes are drawn on top at full device resolution so text stays sharp.
 */
(() => {
  'use strict';

  /* ======================= helpers ======================= */
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = a => a[(Math.random() * a.length) | 0];
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const mod = (a, n) => ((a % n) + n) % n;
  const TAU = Math.PI * 2;
  // Accent-insensitive comparison: "á" == "a", "ñ" == "n", "ü" == "u".
  const norm = c => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function hash(n) {
    n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    n ^= n >>> 13;
    n = Math.imul(n, 0xc2b2ae35);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  }
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v === null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ }
    }
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ======================= word bank ======================= */
  class WordBank {
    constructor(data) {
      this.langs = {};
      for (const [lang, src] of Object.entries(data)) this.langs[lang] = this.build(src);
    }
    build(src) {
      const seen = new Set();
      const tiers = { short: [], medium: [], long: [] };
      for (const raw of src.words.split(/\s+/)) {
        const w = raw.normalize('NFC').toLowerCase();
        if (!w || seen.has(w) || !/^[a-záéíóúüñ]+$/.test(w) || w.length < 3) continue;
        seen.add(w);
        (w.length <= 4 ? tiers.short : w.length <= 7 ? tiers.medium : tiers.long).push(w);
      }
      tiers.phrase = [...new Set(src.phrases.map(p => p.normalize('NFC').toLowerCase().trim()))];
      return { tiers, bags: {} };
    }
    // Shuffle-bag draw: nothing repeats until the whole tier is exhausted. Prefers a word
    // whose first letter is not already in use on screen, so targeting stays unambiguous.
    draw(lang, tier, avoid, maxLen = 99) {
      const L = this.langs[lang] || this.langs.en;
      let bag = L.bags[tier];
      if (!bag || bag.length < 8) bag = L.bags[tier] = shuffle(L.tiers[tier].slice()).concat(bag || []);
      for (let i = bag.length - 1, s = 0; i >= 0 && s < 60; i--, s++) {
        const w = bag[i];
        if (w.length > maxLen) continue;
        if (avoid && avoid.has(norm(w[0]))) continue;
        bag.splice(i, 1);
        return w;
      }
      return bag.pop();
    }
  }

  /* ======================= constants ======================= */
  const H = 360, GROUND_Y = 236, KY = 306, BOSS_Y = 234, TOWER_TP = 112;
  const CLIMB_DIST = TOWER_TP * 4; // camera travel between floors: a tower-tile multiple, > H so terraces never overlap
  // Tower zones: every 5 floors the terrace, banners, runes and ambience change.
  const BIOMES = [
    { stone: [62, 58, 72], mortar: [26, 24, 32], wall: ['#3e3b4b', '#5c5868', '#2a2834', '#4a4757', '#625e70'], banner: ['#a51d36', '#7a1426'], trim: '#c99a3a', rune: '#8a4fd0', amb: 'ember' },
    { stone: [58, 66, 84], mortar: [22, 28, 40], wall: ['#3a4658', '#7a8aa4', '#232b38', '#475468', '#8ea0bc'], banner: ['#2f5fb0', '#1d3b78'], trim: '#cfe6ff', rune: '#59f3ff', amb: 'snow' },
    { stone: [54, 64, 52], mortar: [20, 28, 20], wall: ['#3b4a3a', '#5e7258', '#232c22', '#465843', '#6f8a66'], banner: ['#3f8a3a', '#245a22'], trim: '#d8c070', rune: '#7dff6a', amb: 'spore' },
    { stone: [74, 52, 46], mortar: [30, 16, 14], wall: ['#4e3430', '#7a5048', '#2c1a18', '#5e3e38', '#8a5c52'], banner: ['#d0601a', '#8a3a0e'], trim: '#ffcf5a', rune: '#ff7a1a', amb: 'ember' },
    { stone: [46, 40, 62], mortar: [14, 10, 24], wall: ['#2e2640', '#4e4266', '#18122a', '#3a3050', '#5e5080'], banner: ['#7a3ab0', '#4a1e78'], trim: '#e6e2f0', rune: '#ff4fd8', amb: 'mote' }
  ];
  const biomeIdx = f => Math.floor((f - 1) / 5) % BIOMES.length;
  const biomeOf = f => BIOMES[biomeIdx(f)];
  const TIER_UP = { short: 'medium', medium: 'long', long: 'long' };
  const FONT = '"Pixelify Sans", ui-monospace, monospace';
  const NUM_FONT = '"Jersey 10", "Pixelify Sans", ui-monospace, monospace'; // digits that never read as 8
  const GOLD = '#ffcf5a', NEON = '#59f3ff', SCORE_C = '#f3eeff'; // score floaters stay white so they never read as gold
  const GORE = {
    bone: ['#e8e2cf', '#a89f86', '#ffffff'],
    green: ['#5fae3e', '#3a7a26', '#9be36b'],
    purple: ['#8a4fd0', '#5a2a90', '#ff3355'],
    ecto: ['#7ff0ff', '#bffaff', '#3aa6c0'],
    stone: ['#8b8f99', '#5d616c', '#ff7a1a'],
    fire: ['#ffcf5a', '#ff7a1a', '#ff3b1a'],
    blood: ['#e0344e', '#8e1c32', '#ff6a7a'],
    boss: ['#ff2d55', '#4a3a6a', '#d4a53c', '#ffffff'],
    cage: ['#5d616c', '#8b8f99', '#d4a53c', '#ffcf5a'],
    holy: ['#fff6c8', '#ffcf5a', '#ff8ab0', '#ffffff']
  };
  const KINDS = {
    skeleton: { spr: 'skeleton', speed: 21, tier: 'short', fly: false, coins: [1, 2], gore: 'bone', s: 2 },
    goblin: { spr: 'goblin', speed: 25, tier: 'short', fly: false, coins: [1, 2], gore: 'green', s: 2 },
    bat: { spr: 'bat', speed: 38, tier: 'medium', fly: true, coins: [1, 3], gore: 'purple', s: 2 },
    wraith: { spr: 'wraith', speed: 31, tier: 'medium', fly: true, coins: [2, 3], gore: 'ecto', s: 2, alpha: 0.85 },
    golem: { spr: 'golem', speed: 12, tier: 'long', fly: false, coins: [4, 7], gore: 'stone', s: 2 },
    fireball: { spr: null, speed: 40, tier: 'short', fly: true, coins: [0, 0], gore: 'fire', s: 1, w: 10, h: 12 }
  };
  // rarity: 0 common, 1 rare, 2 epic, 3 legendary (only granted by rescued princesses).
  // Fallbacks are only offered when the pool runs dry.
  const UPGRADES = [
    { id: 'greed', rarity: 0, max: 4 },
    { id: 'magnet', rarity: 0, max: 3 },
    { id: 'scholar', rarity: 0, max: 3 },
    { id: 'frost', rarity: 0, max: 4 },
    { id: 'warcry', rarity: 0, max: 3 },
    { id: 'blade', rarity: 1, max: 3 },
    { id: 'siphon', rarity: 1, max: 3 },
    { id: 'regen', rarity: 1, max: 2 },
    { id: 'heart', rarity: 1, max: 4 },
    { id: 'steady', rarity: 1, max: 2 },
    { id: 'repel', rarity: 1, max: 2 },
    { id: 'volatile', rarity: 2, max: 3 },
    { id: 'chain', rarity: 2, max: 3 },
    { id: 'aegis', rarity: 2, max: 2 },
    { id: 'executioner', rarity: 2, max: 3 },
    { id: 'lucky', rarity: 0, max: 3 },
    { id: 'haggler', rarity: 0, max: 2 },
    { id: 'glacial', rarity: 0, max: 2 },
    { id: 'scavenger', rarity: 0, max: 1 },
    { id: 'flow', rarity: 0, max: 3 },
    { id: 'keen', rarity: 0, max: 2 },
    { id: 'treasurer', rarity: 0, max: 2 },
    { id: 'trophy', rarity: 0, max: 1 },
    { id: 'piercing', rarity: 0, max: 2 },
    { id: 'bloodthirst', rarity: 1, max: 2 },
    { id: 'momentum', rarity: 1, max: 2 },
    { id: 'giantslayer', rarity: 1, max: 2 },
    { id: 'berserker', rarity: 1, max: 1 },
    { id: 'spiked', rarity: 1, max: 2 },
    { id: 'precision', rarity: 1, max: 2 },
    { id: 'lordsbane', rarity: 1, max: 2 },
    { id: 'timewarp', rarity: 1, max: 1 },
    { id: 'storm', rarity: 2, max: 2 },
    { id: 'guardian', rarity: 2, max: 1 },
    { id: 'glass', rarity: 2, max: 1 },
    { id: 'bloodpact', rarity: 2, max: 1 },
    { id: 'echo', rarity: 2, max: 2 },
    { id: 'reach', rarity: 0, max: 2 },
    { id: 'secondwind', rarity: 0, max: 1 },
    { id: 'snare', rarity: 0, max: 2 },
    { id: 'bastion', rarity: 1, max: 2 },
    { id: 'laststand', rarity: 1, max: 1 },
    { id: 'gilded', rarity: 1, max: 1 },
    { id: 'smite', rarity: 2, max: 2 },
    { id: 'crown', rarity: 3, max: 1 },
    { id: 'phoenix', rarity: 3, max: 1 },
    { id: 'starblade', rarity: 3, max: 1 },
    { id: 'aura', rarity: 3, max: 1 },
    { id: 'tempest', rarity: 3, max: 1 },
    { id: 'favor', rarity: 3, max: 1 },
    { id: 'rift', rarity: 3, max: 1 },
    { id: 'treasury', rarity: 3, max: 1 },
    { id: 'bounty', rarity: 0, max: 99, fallback: true },
    { id: 'mend', rarity: 0, max: 99, fallback: true }
  ];
  const UPG = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

  /* ======================= setup ======================= */
  const stage = $('stage'), canvas = $('game'), ctx = canvas.getContext('2d');
  const buf = mk(640, H), bx = buf.getContext('2d');
  const decal = mk(640, H), dcx = decal.getContext('2d');
  let W = 640, KX = 320, scale = 1, dpr = 1;
  let skyCv, groundCv, mountCv, moonCv, towerTex, stars = [], clouds = [], cloudCvs = [];
  let groundNext = null, curBiome = null, nextBiome = null; // terrace art for this floor / the one above

  const SPR = TKSprites.build();
  const audio = new TKAudio();
  const bank = new WordBank(window.TK_WORDS);
  for (const k of Object.values(KINDS)) {
    if (!k.spr) continue;
    k.w = SPR[k.spr][0].n.width * k.s;
    k.h = SPR[k.spr][0].n.height * k.s;
  }

  const G = {
    state: 'title',
    lang: store.get('tk_lang', 'en') === 'es' ? 'es' : 'en',
    muted: !!store.get('tk_muted', false),
    best: store.get('tk_best', { score: 0, floor: 0 }),
    time: 0, trauma: 0, hitStop: 0, flash: 0, hurtFlash: 0, errFlash: 0,
    towerScroll: 0, floor: 1, floorF: 1,
    particles: [], fx: [], floaters: [], coinsArr: [], enemies: [], boss: null, target: null,
    knight: { flip: false, swing: 0, twitch: 0, hurt: 0, dead: 0 },
    ult: null, upgVersion: 0, camY: 0, knightLift: 0, climbClouds: [], warpT: 0
  };
  audio.muted = G.muted;

  const t = (key, vars) => {
    let s = (TK_I18N[G.lang] && TK_I18N[G.lang][key]) ?? TK_I18N.en[key] ?? key;
    if (vars && typeof s === 'string') for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  };

  /* ======================= derived stats ======================= */
  const lvl = id => G.upgrades[id] || 0;
  const comboStep = () => 10 - 2 * lvl('blade');
  const comboMult = () => (1 + Math.floor(G.combo / comboStep())) * (lvl('favor') ? 2 : 1);
  const berserk = () => lvl('berserker') > 0 && G.hp <= 2;
  const scoreMult = () => 1 + 0.3 * lvl('scholar') + 0.75 * lvl('glass') + (berserk() ? 0.6 : 0);
  // Foes drop roughly 0.8 coins per coin of loot; Midas and Glass Cannon scale it.
  const coinMult = () => 0.8 * (1 + 0.25 * lvl('greed')) * (1 + 0.5 * lvl('glass'));
  const bossDmgMult = () => 1 + 0.35 * lvl('executioner');
  // How far the Dimensional Cut reaches to each side of the knight (world px).
  const ultReach = () => (lvl('rift') ? Infinity : 230 * (1 + 0.25 * lvl('reach')));
  function addEnergy(v, flat = false) {
    // Stacked energy upgrades cap at x2.5 so the Cut can't chain into itself.
    const m = Math.min(2.5, (1 + 0.4 * lvl('siphon')) * (lvl('bloodpact') ? 2 : 1) * (berserk() ? 1.6 : 1));
    G.energy = Math.min(100, G.energy + (flat ? v : v * m));
  }
  function heal(n) {
    const before = G.hp;
    G.hp = Math.min(G.maxHp, G.hp + n);
    if (G.hp > before) floater(KX, KY - 54, '+' + (G.hp - before) + ' ♥', '#ff6a7a', 9);
  }

  /* ======================= run / floor flow ======================= */
  function resetRun() {
    Object.assign(G, {
      floor: 1, floorF: 1, score: 0, coins: 0, hp: 5, maxHp: 5, combo: 0, maxCombo: 0, energy: 0,
      upgrades: {}, enemies: [], coinsArr: [], fx: [], floaters: [], boss: null, target: null,
      particles: G.particles.filter(p => p.amb),
      stats: { correct: 0, errors: 0, kills: 0, time: 0 },
      steadyCd: 0, aegisLeft: 0, dying: 0, vacuum: false, shop: null, ult: null, upgVersion: G.upgVersion + 1,
      guardian: 0, phoenix: 0, killCount: 0, thirst: 0, spawnCount: 0, warpT: 0, camY: 0, knightLift: 0, climbClouds: [],
      princess: null, gift: null
    });
    G.knight = { flip: false, swing: 0, twitch: 0, hurt: 0, dead: 0 };
  }

  function startRun() {
    audio.init();
    audio.setMuted(G.muted);
    resetRun();
    hideAll();
    $('hud').hidden = false;
    buildSky();
    startFloor();
  }

  function startFloor() {
    const f = G.floor;
    const boss = f % 5 === 0;
    // Past floor 12 speed and crowd size grow slowly: the later floors get longer, not
    // denser, so there is always time to read a word before its foe arrives.
    G.plan = boss
      ? { boss, count: 0, interval: 2, maxAlive: 4, speed: 1 + f * 0.045 + Math.max(0, f - 20) * 0.02 } // tower lords keep their tuning
      : {
        boss,
        count: Math.min(11 + Math.floor(f * 2.2), 60),
        interval: Math.max(0.65, 1.55 - f * 0.06),
        maxAlive: Math.min(4 + Math.floor(f * 0.5), 10),
        speed: 1.13 + Math.min(f, 12) * 0.06 + Math.max(0, f - 12) * 0.02
      };
    G.toSpawn = G.plan.count;
    G.spawnT = 0.9;
    G.floorDone = 0;
    G.vacuum = false;
    G.aegisLeft = lvl('aegis');
    if (lvl('warcry')) addEnergy(25 * lvl('warcry'), true);
    dcx.clearRect(0, 0, decal.width, decal.height);
    ensureGround();
    G.state = 'playing';
    if (f % 20 === 0) spawnPrincess();
    if (boss) {
      spawnBoss();
      banner(t('bossFloor'), G.princess ? t('rescueHint') : t('floorN', { n: f }), 'boss');
      audio.startMusic(true);
    } else {
      banner(t('floorN', { n: f }), f === 1 ? t('firstHint') : t('biomes')[biomeIdx(f)], '');
      audio.startMusic(false);
    }
  }

  function ensureGround() {
    const b = biomeOf(G.floor);
    if (curBiome === b && groundCv) return;
    curBiome = b;
    groundCv = buildGround(b);
  }

  function floorCleared() {
    if (G.state !== 'playing') return;
    G.state = 'floorclear';
    G.clearT = 1.6;
    G.vacuum = true;
    G.target = null;
    G.enemies = G.enemies.filter(e => !e.dead);
    G.score += 100 * G.floor;
    if (lvl('regen') + lvl('crown')) heal(lvl('regen') + lvl('crown'));
    const tr = lvl('treasurer');
    if (tr) {
      const gain = Math.min(Math.floor(G.coins * 0.1 * tr), 12 * tr);
      if (gain) {
        G.coins += gain;
        floater(KX, KY - 66, `+${gain} ${t('interest')}`, GOLD, 9);
      }
    }
    audio.floorClear();
    if (G.princess) {
      G.clearT = 3; // time for her to walk over before the gift screen
      banner(t('princessFree', { name: G.princess.name }), t('floorCleared', { n: G.floor }), 'clear');
    } else banner(t('floorCleared', { n: G.floor }), '', 'clear');
  }

  /* ======================= princesses (every 20th floor) ======================= */
  const PRINCESS_NAMES = ['Amara', 'Isolde', 'Leilani', 'Mei', 'Zuri', 'Sofía', 'Anaya', 'Freya', 'Inés', 'Yara',
    'Aiko', 'Imani', 'Saoirse', 'Valentina', 'Priya', 'Noor', 'Esperanza', 'Ayasha', 'Malia', 'Ingrid'];
  const CAGE_DX = 96; // she waits in a cage beside the gate while the lord fights

  function spawnPrincess() {
    const L = TKSprites.princessLooks;
    const look = { style: pick(L.styles), hair: randi(0, L.hair.length - 1), skin: randi(0, L.skin.length - 1), dress: randi(0, L.dress.length - 1) };
    const spr = TKSprites.princess(look);
    G.princess = {
      spr, name: pick(PRINCESS_NAMES), x: KX + CAGE_DX, y: GROUND_Y + 18, t: 0, caged: true, walk: 0,
      w: spr.n.width * 2, h: spr.n.height * 2, kind: 'princess', portrait: spr.n.toDataURL()
    };
  }

  function freePrincess() {
    const p = G.princess;
    if (!p || !p.caged) return;
    p.caged = false;
    p.walk = 0.001;
    p.fromX = p.x;
    p.fromY = p.y;
    burst(p.x, p.y - 30, 'cage', 1.6);
    fxRing(p.x, p.y - 30, GOLD, 50);
    audio.rescue();
  }

  function updatePrincess(dt) {
    const p = G.princess;
    if (!p) return;
    p.t += dt;
    if (p.walk > 0 && p.walk < 1) {
      p.walk = Math.min(1, p.walk + dt / 1.6);
      const e = easeInOut(p.walk);
      p.x = lerp(p.fromX, KX + 34, e);
      p.y = lerp(p.fromY, KY - 2, e);
      if (p.walk >= 1) {
        for (let i = 0; i < 6; i++) floater(p.x + rand(-10, 10), p.y - 50 - i * 6, '♥', '#ff8ab0', 10);
      }
    }
    if (!p.caged && Math.random() < dt * 6) {
      particle({ x: p.x + rand(-12, 12), y: p.y - rand(10, 46), vx: rand(-6, 6), vy: rand(-26, -10), g: 0, life: rand(0.5, 0.9), c: pick([GOLD, '#fff6c8', '#ff8ab0']), s: 1 });
    }
  }

  // She returns home in a shower of light as the knight starts the climb.
  function dismissPrincess() {
    const p = G.princess;
    if (!p) return;
    burst(p.x, p.y - 26, 'holy', 1.4);
    fxRing(p.x, p.y - 26, '#fff6c8', 40);
    G.princess = null;
  }

  // The ascent: the knight leaps, the camera rises a full screen up the tower (old terrace
  // drops away, the next one arrives from above), clouds and wind rush past, then he lands.
  function beginClimb() {
    dismissPrincess();
    G.state = 'climbing';
    G.climb = { t: 0, dur: 2.5, from: G.towerScroll, launched: false, landed: false };
    nextBiome = biomeOf(G.floor + 1);
    groundNext = nextBiome === curBiome ? groundCv : buildGround(nextBiome);
    audio.duckMusic(0.55);
  }

  function updateClimb(dt) {
    const c = G.climb;
    c.t += dt;
    const p = clamp(c.t / c.dur, 0, 1);
    const cp = easeInOut(clamp((p - 0.14) / 0.78, 0, 1));
    const cam = CLIMB_DIST * cp;
    const vel = dt > 0 ? (cam - G.camY) / dt : 0;
    G.camY = cam;
    G.towerScroll = c.from + cam;
    G.floorF = G.floor + cp;
    if (p < 0.14) G.knightLift = 2 * (p / 0.14); // crouch
    else if (p < 0.94) G.knightLift = -Math.sin(((p - 0.14) / 0.8) * Math.PI) * 48; // leap
    else G.knightLift = 0;
    if (!c.launched && p >= 0.14) {
      c.launched = true;
      audio.jump();
      dust(KX, KY, 1);
    }
    if (!c.landed && p >= 0.94) {
      c.landed = true;
      audio.land();
      dust(KX, KY, 1.5);
      G.trauma = Math.min(1, G.trauma + 0.3);
    }
    if (vel > 40) {
      if (Math.random() < dt * 5) G.climbClouds.push({ i: randi(0, 2), x: rand(-80, W), y: -50, v: vel * rand(1.3, 1.8), a: rand(0.2, 0.38), s: 2, front: true });
      if (Math.random() < dt * 4) G.climbClouds.push({ i: randi(0, 2), x: rand(-60, W), y: -30, v: vel * rand(0.35, 0.55), a: rand(0.14, 0.28), s: 1, front: false });
      for (let i = 0; i < dt * 70; i++) {
        particle({ x: rand(0, W), y: rand(-20, H * 0.7), vx: 0, vy: vel * rand(1.4, 2.2), g: 0, life: rand(0.15, 0.3), c: '#d6ecff', s: 1, streak: true });
      }
    }
    if (p >= 1) {
      G.camY = 0;
      G.knightLift = 0;
      G.floor++;
      G.floorF = G.floor;
      groundCv = groundNext;
      curBiome = nextBiome;
      buildSky();
      startFloor();
    }
  }

  function dust(x, y, m) {
    for (let i = 0; i < 14 * m; i++) {
      const s = Math.random() < 0.5 ? -1 : 1;
      particle({ x: x + rand(-8, 8), y: y + rand(-2, 2), vx: s * rand(30, 90) * m, vy: rand(-30, -5), g: 60, life: rand(0.3, 0.6), c: pick(['#8a8698', '#6a6678', '#b0acbc']), s: 1 });
    }
  }

  function die() {
    G.state = 'dying';
    G.dying = 1.7;
    G.knight.dead = 0.001;
    G.target = null;
    audio.stopMusic();
    audio.gameOver();
  }

  /* ======================= spawning ======================= */
  function firstLettersInUse(except) {
    const s = new Set();
    for (const e of G.enemies) if (!e.dead && e !== except && e.typed < e.word.length) s.add(norm(e.word[e.typed]));
    const b = G.boss;
    if (b && b !== except && b.word) s.add(norm(b.word[b.typed]));
    return s;
  }

  function tierFor(kind) {
    const f = G.floor, r = Math.random(), base = KINDS[kind].tier;
    if (kind === 'fireball') return 'short';
    if (base === 'short') {
      if (f >= 14 && r < 0.18) return 'long';
      if (f >= 7 && r < 0.5) return 'medium';
      if (f >= 3 && r < 0.3) return 'medium';
      return 'short';
    }
    if (base === 'medium') {
      if (f < 2) return 'short';
      if (f >= 8 && r < 0.3) return 'long';
      return 'medium';
    }
    return 'long';
  }

  function chooseKind() {
    const f = G.floor;
    const wFast = f >= 2 ? Math.min(0.18 + f * 0.035, 0.42) : 0.08;
    const wTank = f >= 3 ? Math.min(0.08 + f * 0.015, 0.25) : 0;
    const r = Math.random();
    if (r < wTank) return 'golem';
    if (r < wTank + wFast) return f >= 5 && Math.random() < 0.45 ? 'wraith' : 'bat';
    return Math.random() < 0.55 ? 'skeleton' : 'goblin';
  }

  function spawnEnemy(kind, o = {}) {
    const def = KINDS[kind];
    const side = o.side || (Math.random() < 0.5 ? -1 : 1);
    const lag = o.lag || 0; // extra distance off-screen, used to stagger packs
    const x = o.x ?? (side < 0 ? -def.w / 2 - 2 - lag : W + def.w / 2 + 2 + lag);
    const y = o.y ?? (def.fly ? rand(96, 178) : rand(GROUND_Y + 22, H - 10));
    // Elites: red outline, faster, a word one tier harder, richer loot.
    const elite = kind !== 'fireball' && !G.plan.boss && G.floor >= 3 && Math.random() < Math.min(0.04 + G.floor * 0.02, 0.3);
    const tier = elite ? TIER_UP[tierFor(kind)] : tierFor(kind);
    const maxLen = tier === 'long' ? Math.min(9 + Math.floor(G.floor / 3), 16) : 99;
    const word = bank.draw(G.lang, tier, firstLettersInUse(), maxLen);
    const e = {
      kind, def, x, y, word, typed: 0, w: def.w, h: def.h, elite,
      speed: def.speed * G.plan.speed * rand(0.92, 1.08) * (elite ? 1.2 : 1),
      t: rand(0, 10), age: 0, flash: 0, err: 0, kbx: 0, kby: 0, pushes: 0, dead: false, dirty: false, lx: null, ly: null, top: y - def.h
    };
    if (kind !== 'fireball') {
      G.spawnCount++;
      const keen = lvl('keen');
      if (keen && G.spawnCount % (keen >= 2 ? 2 : 4) === 0) e.typed = 1;
    }
    G.enemies.push(e);
    return e;
  }

  function updateSpawner(dt) {
    if (G.plan.boss) return;
    G.spawnT -= dt;
    const alive = G.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
    if (G.toSpawn > 0 && alive === 0 && G.spawnT > 0.4) G.spawnT = 0.4;
    if (G.toSpawn > 0 && G.spawnT <= 0 && alive < G.plan.maxAlive) {
      // Packs: several foes rush in from the same side.
      const pack = G.floor >= 2 && Math.random() < Math.min(0.12 + G.floor * 0.025, 0.4) ? randi(2, 3) : 1;
      const n = Math.min(pack, G.toSpawn, G.plan.maxAlive - alive);
      const side = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < n; i++) spawnEnemy(chooseKind(), { side, lag: i * 30 });
      G.toSpawn -= n;
      G.spawnT = G.plan.interval * rand(0.7, 1.3) * (n > 1 ? 1.4 : 1);
    }
    if (G.toSpawn === 0 && alive === 0) floorCleared();
  }

  /* ======================= boss ======================= */
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  function bossName(b) {
    const names = t('bosses');
    const cycle = Math.floor(b.idx / names.length);
    return names[b.idx % names.length] + (cycle ? ' ' + (ROMAN[cycle + 1] || cycle + 1) : '');
  }

  function spawnBoss() {
    const idx = G.floor / 5 - 1;
    const segs = 3 + Math.floor(idx * 0.75);
    const spr = SPR.bosses[idx % SPR.bosses.length];
    G.boss = {
      kind: 'boss', idx, variant: idx % SPR.bosses.length, x: KX, y: BOSS_Y + 40, intro: 2.4, alpha: 0,
      hp: segs * 100, maxHp: segs * 100, segs, word: '', typed: 0, castT: 0, castMax: 1,
      cps: Math.min(2.2 + idx * 0.35, 7), summonT: 5, fireT: 7, flash: 0, err: 0, t: 0, dying: 0,
      w: spr.n.width * 3, h: spr.n.height * 3, dead: false, top: BOSS_Y - spr.n.height * 3
    };
    audio.roar();
    G.trauma = Math.min(1, G.trauma + 0.4);
  }

  function newBossPhrase(b) {
    b.word = bank.draw(G.lang, 'phrase', firstLettersInUse(b));
    b.typed = 0;
    b.castT = 0;
    b.castMax = (2.5 + b.word.length / b.cps) * (1 + 0.2 * lvl('lordsbane'));
    b.lx = null;
  }

  function updateBoss(dt) {
    const b = G.boss;
    if (!b) return;
    b.t += dt;
    b.flash -= dt;
    b.err -= dt;
    if (b.intro > 0) {
      b.intro -= dt;
      const p = clamp(1 - b.intro / 2.4, 0, 1);
      b.y = lerp(BOSS_Y + 40, BOSS_Y, easeOut(p));
      b.alpha = clamp(p * 1.6, 0, 1);
      if (Math.random() < dt * 30) particle({ x: b.x + rand(-34, 34), y: b.y - rand(0, 70), vx: 0, vy: rand(-40, -15), g: 0, life: rand(0.5, 1), c: pick(['#4a3a6a', '#8a7ab0', SPR.bossEyes[b.variant]]), s: 1 });
      if (b.intro <= 0) {
        b.y = BOSS_Y;
        b.alpha = 1;
        newBossPhrase(b);
      }
      return;
    }
    if (b.dying > 0) {
      b.dying -= dt;
      if (Math.random() < dt * 14) {
        burst(b.x + rand(-30, 30), b.y - rand(10, 80), 'boss', 0.6);
        audio.burst();
        G.trauma = Math.min(1, G.trauma + 0.06);
      }
      if (b.dying <= 0) {
        burst(b.x, b.y - 42, 'boss', 3);
        fxRing(b.x, b.y - 42, '#ffffff', 120);
        dropCoins(b.x, b.y - 10, 12 + b.idx * 5, false);
        G.score += 1000 * (b.idx + 1);
        G.flash = reduceMotion ? 0.2 : 0.6;
        G.trauma = 1;
        audio.explode();
        G.boss = null;
        if (lvl('trophy')) heal(2);
        freePrincess();
        floorCleared();
      }
      return;
    }
    b.castT += dt;
    if (b.castT >= b.castMax) bossBlast(b);
    b.summonT -= dt;
    if (b.summonT <= 0) {
      const minions = G.enemies.reduce((n, e) => n + (!e.dead && e.kind !== 'fireball' ? 1 : 0), 0);
      if (minions < 2 + Math.floor(b.idx / 2)) spawnEnemy(b.idx > 0 && Math.random() < 0.35 ? 'bat' : pick(['skeleton', 'goblin']));
      b.summonT = rand(4.5, 6.5) - Math.min(b.idx * 0.3, 2);
    }
    b.fireT -= dt;
    if (b.fireT <= 0) {
      spawnEnemy('fireball', { x: b.x + pick([-30, 30]), y: b.y - 62 });
      fxRing(b.x, b.y - 60, '#ff7a1a', 22);
      audio.bossCast();
      b.fireT = rand(6, 8) - Math.min(b.idx * 0.5, 3);
    }
  }

  function bossBlast(b) {
    fxBolt(b.x, b.y - 50, KX, KY - 20, SPR.bossEyes[b.variant], 8);
    audio.bossCast();
    if (G.target === b) G.target = null;
    hitKnight();
    if (G.boss === b && b.dying <= 0) newBossPhrase(b);
  }

  function bossHit(b, dmg) {
    b.hp = Math.max(0, b.hp - dmg);
    b.flash = 0.25;
    G.hitStop = Math.max(G.hitStop, 0.09);
    G.trauma = Math.min(1, G.trauma + 0.45);
    audio.bossHit();
    burst(b.x, b.y - 50, 'boss', 1.5);
    floater(b.x + rand(-20, 20), b.top - 22, '-' + Math.round(dmg), '#ff5a7a', 14);
    if (b.hp <= 0) bossDie(b);
  }

  function bossDie(b) {
    b.dying = 1.8;
    b.word = '';
    if (G.target === b) G.target = null;
    for (const e of G.enemies) if (!e.dead) kill(e, 'ult');
    audio.roar();
  }

  /* ======================= combat ======================= */
  function typeables() {
    // Anything whose label is on screen can be targeted (labels are clamped inside the view).
    const list = G.enemies.filter(e => !e.dead && e.typed < e.word.length && e.x > -30 && e.x < W + 30);
    const b = G.boss;
    if (b && b.intro <= 0 && b.dying <= 0 && b.word) list.push(b);
    return list;
  }

  function danger(e) {
    if (e.kind === 'boss') return 1 / Math.max(0.1, e.castMax - e.castT);
    const d = Math.hypot(KX - e.x, KY - e.y);
    return e.speed / Math.max(1, d);
  }

  function typeChar(c) {
    let tg = G.target;
    if (tg && (tg.dead || (tg.kind === 'boss' && (G.boss !== tg || !tg.word)))) tg = G.target = null;
    if (!tg) {
      let best = null, bd = -1;
      for (const e of typeables()) {
        if (norm(e.word[e.typed]) !== c) continue;
        const dg = danger(e);
        if (dg > bd) { bd = dg; best = e; }
      }
      if (!best) return mistake(null);
      tg = G.target = best;
    } else if (norm(tg.word[tg.typed]) !== c) {
      return mistake(tg);
    }
    correct(tg);
  }

  function correct(e) {
    e.typed++;
    G.combo++;
    G.maxCombo = Math.max(G.maxCombo, G.combo);
    G.stats.correct++;
    G.score += Math.round(comboMult() * scoreMult());
    addEnergy(1);
    if (lvl('flow') && G.combo % 10 === 0) addEnergy(6 * lvl('flow'));
    e.flash = 0.05;
    G.knight.twitch = 0.09;
    if (e.kind !== 'boss') {
      const dx = e.x - KX, dy = e.y - KY, d = Math.hypot(dx, dy) || 1, push = 1 + 0.6 * lvl('bastion');
      e.kbx += (dx / d) * 34 * push;
      e.kby += (dy / d) * 10 * push;
    }
    const ly = e.ly ?? e.top - 10;
    for (let i = 0; i < 3; i++) particle({ x: e.lx ?? e.x, y: ly + 6, vx: rand(-50, 50), vy: rand(-60, -10), g: 120, life: rand(0.15, 0.3), c: pick([GOLD, '#ffffff']), s: 1 });
    audio.key(G.combo);
    if (G.combo > 0 && G.combo % 25 === 0) floater(KX, KY - 62, t('combo') + ' ' + G.combo, NEON, 10);
    if (e.typed >= e.word.length) complete(e);
    const sm = lvl('smite');
    if (sm && G.combo % (sm >= 2 ? 20 : 25) === 0) smite();
  }

  // Holy light from above slays the nearest foe outright.
  function smite() {
    let near = null, nd = Infinity;
    for (const o of G.enemies) {
      if (o.dead || o.kind === 'fireball' || o.x < 0 || o.x > W) continue;
      const d = Math.hypot(o.x - KX, o.y - KY);
      if (d < nd) { nd = d; near = o; }
    }
    if (!near) return;
    fxBolt(near.x, -10, near.x, near.y - near.h / 2, GOLD, 7);
    fxRing(near.x, near.y - near.h / 2, '#fff6c8', 30);
    G.flash = Math.max(G.flash, 0.1);
    audio.zap();
    kill(near, 'smite', 1);
  }

  function mistake(tg) {
    G.stats.errors++;
    if (tg) {
      tg.err = 0.3;
      tg.dirty = true; // no Deadly Precision bonus for this word
    }
    if (lvl('steady') && G.steadyCd <= 0) {
      G.steadyCd = lvl('steady') >= 2 ? 5 : 8;
      floater(KX, KY - 58, t('steady'), NEON, 9);
      audio.denied();
      return;
    }
    const mo = lvl('momentum');
    G.combo = mo ? Math.floor(G.combo * (mo >= 2 ? 0.75 : 0.5)) : 0;
    G.trauma = Math.min(1, G.trauma + 0.22);
    G.errFlash = 0.18;
    audio.error();
  }

  function complete(e) {
    G.target = null;
    strikeFx(e);
    if (e.kind === 'boss') {
      G.score += Math.round(e.word.length * 15 * comboMult() * scoreMult());
      addEnergy(8);
      bossHit(e, 100 * bossDmgMult());
      if (G.boss === e && e.dying <= 0) newBossPhrase(e);
      return;
    }
    audio.slash();
    G.hitStop = Math.max(G.hitStop, 0.035);
    G.trauma = Math.min(1, G.trauma + 0.1);
    kill(e, 'blade', 0);
  }

  function kill(e, how, depth = 0) {
    if (e.dead) return;
    e.dead = true;
    G.floorDone++;
    G.stats.kills++;
    if (G.target === e) G.target = null;
    const cy = e.y - e.h / 2;
    burst(e.x, cy, e.def.gore, how === 'ult' ? 1.3 : 1);
    if (!e.def.fly) splat(e.x, e.y, e.def.gore);
    let n = e.kind === 'fireball' ? 0 : randi(e.def.coins[0], e.def.coins[1]) + (e.elite ? 1 : 0);
    if (n && lvl('lucky') && Math.random() < 0.15 * lvl('lucky')) n *= 2;
    n *= coinMult();
    dropCoins(e.x, e.y, Math.floor(n) + (Math.random() < n % 1 ? 1 : 0), e.def.fly);
    const clean = how === 'blade' && !e.dirty;
    const big = e.word.length >= 8;
    let sm = comboMult() * scoreMult() * (e.elite ? 1.5 : 1);
    if (clean && lvl('precision')) sm *= 1 + 0.3 * lvl('precision');
    if (big && lvl('giantslayer')) sm *= 1 + 0.5 * lvl('giantslayer');
    const pts = Math.round(e.word.length * 10 * sm);
    G.score += pts;
    floater(e.x, e.top - 4, '+' + pts, SCORE_C, 10);
    // Foes cut down by the Dimensional Cut give no energy, so it can't recharge itself.
    if (how !== 'ult') addEnergy(3 + (clean ? 3 * lvl('precision') : 0) + (big ? 8 * lvl('giantslayer') : 0));
    const bt = lvl('bloodthirst');
    if (bt && ++G.thirst >= (bt >= 2 ? 30 : 40)) {
      G.thirst = 0;
      heal(1);
    }
    G.killCount++;
    if (how === 'ult') return;

    const vol = lvl('volatile');
    if (vol && depth < 4) {
      const r = 70 + 15 * vol;
      fxRing(e.x, cy, '#ff7a1a', r);
      audio.burst();
      for (const o of G.enemies) {
        if (!o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= r) chip(o, vol, depth);
      }
    }
    const ch = lvl('chain');
    if (ch && depth === 0 && Math.random() < 0.2 + 0.15 * (ch - 1)) {
      const opts = G.enemies.filter(o => !o.dead && o !== e && o !== G.target && o.x > 0 && o.x < W);
      if (opts.length) {
        const o = pick(opts);
        fxBolt(e.x, cy, o.x, o.y - o.h / 2, '#9be7ff', 6);
        audio.zap();
        chip(o, 2, depth);
      }
    }
    const pr = lvl('piercing');
    if (pr && depth < 4) {
      let near = null, nd = Infinity;
      for (const o of G.enemies) {
        if (o.dead || o === e) continue;
        const d = Math.hypot(o.x - e.x, o.y - e.y);
        if (d < nd) { nd = d; near = o; }
      }
      if (near) {
        fxBolt(e.x, cy, near.x, near.y - near.h / 2, '#dfe6f0', 3);
        chip(near, pr, depth);
      }
    }
    const st = lvl('storm');
    if (st && G.killCount % (st >= 2 ? 10 : 15) === 0) {
      const opts = shuffle(G.enemies.filter(o => !o.dead && o !== e)).slice(0, 3);
      if (opts.length) {
        audio.zap();
        G.flash = Math.max(G.flash, 0.12);
      }
      for (const o of opts) {
        fxBolt(o.x + rand(-20, 20), -10, o.x, o.y - o.h / 2, '#ffdd33', 7);
        chip(o, 3, depth);
      }
    }
    if (lvl('tempest') && G.killCount % 6 === 0) {
      const opts = G.enemies.filter(o => !o.dead && o !== e && o.x > -20 && o.x < W + 20);
      if (opts.length) {
        const o = pick(opts);
        fxBolt(o.x + rand(-16, 16), -10, o.x, o.y - o.h / 2, '#c79bff', 8);
        fxRing(o.x, o.y - o.h / 2, '#c79bff', 28);
        G.flash = Math.max(G.flash, 0.12);
        audio.zap();
        kill(o, 'tempest', depth + 1);
      }
    }
    if (lvl('starblade') && how === 'blade' && depth === 0) {
      let near = null, nd = Infinity;
      for (const o of G.enemies) {
        if (o.dead || o === e || o.typed >= o.word.length) continue;
        const d = Math.hypot(o.x - e.x, o.y - e.y);
        if (d < nd) { nd = d; near = o; }
      }
      if (near) {
        fxBolt(e.x, cy, near.x, near.y - near.h / 2, '#fff6c8', 5);
        chip(near, Math.ceil((near.word.length - near.typed) / 2), depth);
      }
    }
    const ec = lvl('echo');
    if (ec && depth === 0 && how === 'blade' && Math.random() < 0.12 * ec) {
      const opts = G.enemies.filter(o => !o.dead && o !== e && o.word.length - o.typed <= 5 && o.x > -30 && o.x < W + 30);
      if (opts.length) {
        const o = pick(opts);
        fxBolt(e.x, cy, o.x, o.y - o.h / 2, '#ff4fd8', 5);
        G.fx.push({ type: 'cross', x: o.x, y: o.y - o.h / 2, a: rand(-0.6, 0.6), size: 24, life: 0.28, max: 0.28 });
        audio.slash();
        kill(o, 'echo', depth + 1);
      }
    }
  }

  // Break n letters off a foe's word (Volatile, Chain, Piercing, Storm); may finish it.
  function chip(o, n, depth) {
    if (o.dead) return;
    o.typed = Math.min(o.word.length, o.typed + n);
    o.flash = 0.12;
    if (o.typed >= o.word.length) kill(o, 'chip', depth + 1);
  }

  function enemyStrike(e) {
    e.dead = true;
    G.floorDone++;
    if (G.target === e) G.target = null;
    burst(e.x, e.y - e.h / 2, e.def.gore, 0.8);
    hitKnight(e.kind === 'golem' ? 2 : 1);
  }

  const GILDED_COST = 20;
  function hitKnight(dmg = 1) {
    if (G.state !== 'playing') return;
    if (G.aegisLeft > 0) {
      G.aegisLeft--;
      fxRing(KX, KY - 20, GOLD, 36);
      floater(KX, KY - 56, t('blocked'), GOLD, 10);
      audio.block();
      G.trauma = Math.min(1, G.trauma + 0.2);
      return;
    }
    if (lvl('gilded') && G.coins >= GILDED_COST) {
      G.coins -= GILDED_COST;
      fxRing(KX, KY - 20, GOLD, 34);
      floater(KX, KY - 56, '-' + GILDED_COST + ' ' + t('coins'), GOLD, 10);
      audio.block();
      G.trauma = Math.min(1, G.trauma + 0.2);
      return;
    }
    const sp = lvl('spiked');
    if (sp && Math.random() < (sp >= 2 ? 0.35 : 0.2)) {
      fxRing(KX, KY - 20, '#dfe6f0', 30);
      floater(KX, KY - 56, t('shrug'), '#dfe6f0', 10);
      audio.block();
      G.trauma = Math.min(1, G.trauma + 0.15);
      return;
    }
    G.hp -= dmg;
    G.combo = 0;
    G.knight.hurt = 0.7;
    G.hurtFlash = 0.6;
    G.trauma = Math.min(1, G.trauma + 0.6);
    if (lvl('timewarp')) G.warpT = 3;
    if (lvl('secondwind')) addEnergy(35, true);
    audio.hurt();
    burst(KX, KY - 20, 'blood', dmg);
    if (G.hp <= 0) {
      if (G.guardian > 0) {
        G.guardian--;
        G.hp = Math.min(2, G.maxHp);
        G.flash = 0.5;
        fxRing(KX, KY - 20, '#fff6c8', 80);
        floater(KX, KY - 62, t('guardianSave'), '#fff6c8', 12);
        audio.block();
        return;
      }
      if (G.phoenix > 0) {
        G.phoenix--;
        G.hp = G.maxHp;
        G.flash = 0.6;
        burst(KX, KY - 20, 'fire', 2.5);
        fxRing(KX, KY - 20, '#ff7a1a', 90);
        floater(KX, KY - 62, t('phoenixSave'), '#ffb347', 12);
        audio.block();
        return;
      }
      G.hp = 0;
      die();
    }
  }

  function tryUltimate() {
    if (G.ult) return;
    if (G.energy < 100) {
      audio.denied();
      pulse($('energy'), 'deny');
      return;
    }
    G.energy = 0;
    G.ult = { t: 0, dur: 1.0, y: KY - 26, fired: false };
    G.knight.swing = 1;
    audio.ultimate();
  }

  function updateUlt(dt) {
    const u = G.ult;
    if (!u) return;
    u.t += dt;
    if (!u.fired && u.t >= 0.15) {
      u.fired = true;
      G.flash = reduceMotion ? 0.25 : 0.75;
      G.trauma = 1;
      G.hitStop = Math.max(G.hitStop, 0.12);
      // The Cut slays everything within reach; foes beyond it are only hurled back.
      const reach = ultReach();
      for (const e of G.enemies) {
        if (e.dead) continue;
        const dx = e.x - KX;
        if (Math.abs(dx) <= reach) kill(e, 'ult');
        else {
          e.kbx = Math.sign(dx) * 320;
          e.flash = 0.15;
        }
      }
      const b = G.boss;
      if (b && b.intro <= 0 && b.dying <= 0) bossHit(b, 60 * bossDmgMult() * (lvl('rift') ? 2 : 1));
      for (const c of G.coinsArr) c.forced = true;
      if (G.target && G.target.dead) G.target = null;
    }
    if (u.t >= u.dur) G.ult = null;
  }

  function updateEnemies(dt) {
    const slow = (1 - 0.08 * lvl('frost')) * (lvl('bloodpact') ? 1.08 : 1) * (G.warpT > 0 ? 0.5 : 1);
    const glacial = [1, 0.65, 0.4][lvl('glacial')];
    const rep = lvl('repel');
    for (const e of G.enemies) {
      if (e.dead) continue;
      e.t += dt;
      e.flash -= dt;
      e.err -= dt;
      const fly = e.def.fly;
      const dx = KX - e.x, dy = (fly ? KY - 24 : KY - 2) - e.y, d = Math.hypot(dx, dy) || 1;
      if (rep && e.pushes < rep && d < 66 && e.kind !== 'fireball') {
        e.pushes++;
        e.kbx = (-dx / d) * 300;
        e.kby = (-dy / d) * 120;
        fxRing(e.x, e.y - e.h / 2, NEON, 40);
        audio.repel();
      }
      e.age += dt;
      let sp = e.speed * slow * (e === G.target ? glacial : 1);
      if (lvl('snare') && e.age < 3) sp *= 1 - 0.2 * lvl('snare');
      if (lvl('aura') && d < 95) sp *= 0.5;
      if (lvl('laststand') && G.hp === 1) sp *= 0.7;
      e.x += ((dx / d) * sp + e.kbx) * dt;
      e.y += ((dy / d) * sp + e.kby) * dt;
      const k = Math.exp(-dt * 5);
      e.kbx *= k;
      e.kby *= k;
      if (!fly) e.y = clamp(e.y, GROUND_Y + 14, H - 4);
      if (e.kind === 'fireball' && Math.random() < dt * 50) {
        particle({ x: e.x + rand(-2, 2), y: e.y - 5 + rand(-2, 2), vx: rand(-8, 8), vy: rand(-20, 0), g: -10, life: rand(0.2, 0.45), c: pick(GORE.fire), s: 1 });
      }
      if (d < (fly ? 15 : 17)) enemyStrike(e);
    }
    G.enemies = G.enemies.filter(e => !e.dead);
  }

  /* ======================= coins ======================= */
  function dropCoins(x, y, n, fromAir) {
    for (let i = 0; i < n; i++) {
      const gy = fromAir ? clamp(y + rand(70, 120), GROUND_Y + 18, H - 8) : clamp(y + rand(-4, 4), GROUND_Y + 10, H - 4);
      G.coinsArr.push({
        x: x + rand(-4, 4), y: gy, z: fromAir ? Math.max(0, gy - y) : rand(2, 8),
        vz: rand(60, 140), vx: rand(-60, 60), vy: rand(-25, 25), t: 0, ph: rand(0, 6), forced: false
      });
    }
  }

  function updateCoins(dt) {
    const r = 70 + 75 * lvl('magnet'), drift = 16 + 30 * lvl('magnet');
    const keep = [];
    for (const c of G.coinsArr) {
      c.t += dt;
      c.vz -= 420 * dt;
      c.z += c.vz * dt;
      if (c.z <= 0) {
        c.z = 0;
        c.vz = c.vz < -25 ? -c.vz * 0.4 : 0;
      }
      const dx = KX - c.x, dy = KY - 6 - c.y, d = Math.hypot(dx, dy) || 1;
      if (c.t < 0.45) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.vx *= 0.92;
        c.vy *= 0.92;
      } else {
        const vac = G.vacuum || c.forced;
        const pull = vac ? 460 : d < r ? 180 + (r - d) * 2.5 : drift;
        c.x += (dx / d) * pull * dt;
        c.y += (dy / d) * pull * dt;
        if (pull > 100) c.z *= 0.85;
      }
      if (d < 9) {
        G.coins++;
        audio.coin();
        particle({ x: KX + rand(-6, 6), y: KY - 14, vx: rand(-20, 20), vy: rand(-50, -20), g: 0, life: 0.3, c: GOLD, s: 1 });
        continue;
      }
      if (!G.vacuum && !c.forced && !lvl('scavenger') && c.t > 8) {
        particle({ x: c.x, y: c.y - c.z, vx: 0, vy: -20, g: 0, life: 0.3, c: '#b07a1a', s: 1 });
        continue;
      }
      keep.push(c);
    }
    G.coinsArr = keep;
  }

  /* ======================= particles & fx ======================= */
  function particle(p) {
    if (G.particles.length > 1400) return;
    p.max = p.life;
    G.particles.push(p);
  }

  function burst(x, y, gore, m = 1) {
    const pal = GORE[gore];
    const n = Math.round(18 * m);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(30, 150) * Math.sqrt(m);
      particle({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 260, life: rand(0.4, 0.9), c: pick(pal), s: Math.random() < 0.3 ? 2 : 1, floor: Math.min(H - 2, y + rand(14, 34)) });
    }
    for (let i = 0; i < 7 * m; i++) {
      const a = rand(0, TAU), sp = rand(160, 320);
      particle({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0, life: rand(0.12, 0.22), c: '#fff6c8', s: 1, streak: true });
    }
  }

  function splat(x, y, gore) {
    const pal = GORE[gore];
    dcx.globalAlpha = 0.5;
    for (let i = 0; i < 9; i++) {
      dcx.fillStyle = pick(pal);
      dcx.fillRect(Math.round(x + rand(-10, 10)), Math.round(y + rand(-3, 3)), randi(1, 3), 1);
    }
    dcx.globalAlpha = 1;
  }

  function floater(x, y, text, c, size = 9) {
    G.floaters.push({ x, y, text, c, size, life: 0.9, max: 0.9 });
  }
  function fxRing(x, y, c, r) { G.fx.push({ type: 'ring', x, y, c, r, life: 0.4, max: 0.4 }); }
  function fxBolt(x1, y1, x2, y2, c, segs) {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const p = i / segs;
      const j = i === 0 || i === segs ? 0 : rand(-10, 10);
      pts.push([lerp(x1, x2, p) + j, lerp(y1, y2, p) + j * 0.6]);
    }
    G.fx.push({ type: 'bolt', pts, c, life: 0.3, max: 0.3 });
  }

  function strikeFx(e) {
    const k = G.knight;
    k.flip = e.x < KX - 2;
    k.swing = 1;
    const tip = swordTip();
    const ty = e.kind === 'boss' ? e.y - 50 : e.y - e.h / 2;
    G.fx.push({ type: 'streak', x1: tip.x, y1: tip.y, x2: e.x, y2: ty, life: 0.2, max: 0.2 });
    G.fx.push({ type: 'cross', x: e.x, y: ty, a: rand(-0.6, 0.6), size: e.kind === 'boss' ? 60 : 26, life: 0.28, max: 0.28 });
  }

  function updateParticles(dt) {
    const keep = [];
    for (const p of G.particles) {
      p.life -= p.amb ? dt : dt;
      if (p.life <= 0) continue;
      p.vy += (p.g || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.floor && p.y > p.floor) {
        p.y = p.floor;
        p.vy *= -0.3;
        p.vx *= 0.5;
      }
      keep.push(p);
    }
    G.particles = keep;
  }

  // Ambient particles follow the tower zone; wind grows with altitude.
  function ambient(dt) {
    const amb = biomeOf(G.floor).amb, wind = Math.min(G.floor * 1.2, 30);
    if (Math.random() < dt * (amb === 'snow' ? 14 : 7)) {
      if (amb === 'snow') {
        particle({ x: rand(-40, W), y: -2, vx: wind + rand(-6, 6), vy: rand(18, 34), g: 0, life: rand(8, 14), c: pick(['#ffffff', '#dfe6f0', '#bfe6ff']), s: 1, amb: true });
      } else {
        const pal = amb === 'spore' ? ['#9be36b', '#d8ffd0', '#5fae3e'] : amb === 'mote' ? ['#c79bff', '#ff4fd8', '#8a4fd0'] : ['#ff9a3c', '#ffcf5a', '#ff5a3c'];
        particle({ x: rand(0, W), y: H + 2, vx: wind * 0.3 + rand(-6, 6), vy: rand(-24, -10), g: -2, life: rand(5, 9), c: pick(pal), s: 1, amb: true });
      }
    }
    for (const c of clouds) {
      c.x += c.v * dt;
      if (c.x > W + 80) c.x = -cloudCvs[c.i].width - 10;
    }
    for (const c of G.climbClouds) c.y += c.v * dt;
    if (G.climbClouds.length) G.climbClouds = G.climbClouds.filter(c => c.y < H + 60);
  }

  /* ======================= static art (rebuilt on resize) ======================= */
  function buildTowerTex() {
    const TW = 200, TP = TOWER_TP;
    const c = mk(TW, TP), x = c.getContext('2d');
    const img = x.createImageData(TW, TP), d = img.data;
    const windows = [[60, 20], [150, 76]];
    for (let py = 0; py < TP; py++) {
      for (let px = 0; px < TW; px++) {
        const nx = (px / (TW - 1)) * 2 - 1;
        // Cylinder mapping: bricks compress toward the silhouette edges.
        const u = (Math.asin(clamp(nx * 0.985, -1, 1)) / (Math.PI / 2)) * 0.5 + 0.5;
        const ux = u * TW;
        const shade = Math.cos(nx * 1.3) * 0.82 + 0.18;
        const row = Math.floor(py / 7), inRow = py % 7;
        const off = (row % 2) * 8;
        const col = Math.floor((ux + off) / 16), inCol = (ux + off) % 16;
        let r, g, b;
        if (inRow === 6 || inCol < 1.1 * (1 + Math.abs(nx) * 2.5) * 0.9) {
          r = 30; g = 28; b = 38;
        } else {
          const h = hash(row * 131 + col * 17);
          r = 88 + h * 28; g = 87 + h * 25; b = 100 + h * 22;
          if (inRow === 0) { r += 14; g += 14; b += 14; }
          if (inRow === 5) { r -= 12; g -= 12; b -= 12; }
          if (hash(row * 7 + col * 3) > 0.93) { g += 10; r -= 6; } // moss
        }
        if (py < 5) { // floor ledge
          const l = py < 2 ? 140 : py < 4 ? 96 : 40;
          r = l; g = l - 4; b = l + 10;
        }
        let glow = 0;
        for (const [wx, wy] of windows) {
          const ddx = ux - wx, ddy = py - wy;
          const inside = Math.abs(ddx) <= 5 && ddy >= 0 && ddy <= 16 && (ddy > 5 || ddx * ddx + (ddy - 5) * (ddy - 5) <= 25);
          const frame = Math.abs(ddx) <= 7 && ddy >= -2 && ddy <= 18 && (ddy > 5 || ddx * ddx + (ddy - 5) * (ddy - 5) <= 49);
          if (inside) {
            const bars = Math.abs(ddx) < 0.6 || ddy === 10;
            const core = 1 - Math.min(1, Math.hypot(ddx / 5, (ddy - 9) / 9));
            if (bars) { r = 40; g = 24; b = 20; } else { r = 255; g = 150 + core * 80; b = 60 + core * 90; }
            glow = bars ? 0 : 0.75;
          } else if (frame) {
            r = 24; g = 22; b = 30;
          }
        }
        const s = glow ? lerp(shade, 1, glow) : shade;
        const i = (py * TW + px) * 4;
        d[i] = clamp(r * s + (1 - s) * 6, 0, 255);
        d[i + 1] = clamp(g * s + (1 - s) * 8, 0, 255);
        d[i + 2] = clamp(b * s + (1 - s) * 22, 0, 255);
        d[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  const towerHalf = y => Math.round(58 + 46 * (y / GROUND_Y));

  function buildSky() {
    const h = GROUND_Y + 2;
    skyCv = mk(W, h);
    const x = skyCv.getContext('2d');
    const k = clamp((G.floor - 1) / 30, 0, 1);
    const top = mix([11, 8, 32], [3, 3, 10], k), mid = mix([40, 22, 62], [12, 14, 38], k), hor = mix([112, 44, 80], [34, 46, 86], k);
    const bands = 30;
    const col = i => {
      const p = i / (bands - 1);
      return p < 0.6 ? mix(top, mid, p / 0.6) : mix(mid, hor, (p - 0.6) / 0.4);
    };
    for (let i = 0; i < bands; i++) {
      const y0 = Math.floor((h * i) / bands), y1 = Math.floor((h * (i + 1)) / bands);
      x.fillStyle = rgb(col(i));
      x.fillRect(0, y0, W, y1 - y0);
      if (i < bands - 1) {
        x.fillStyle = rgb(col(i + 1));
        for (let xx = i % 2; xx < W; xx += 2) x.fillRect(xx, y1 - 1, 1, 1);
      }
    }
  }

  function buildMountains() {
    mountCv = mk(W, 110);
    const x = mountCv.getContext('2d');
    const layers = [['#2c1e42', 70, 0.9, 11], ['#1c1430', 46, 1.3, 29]];
    for (const [c, base, rough, seed] of layers) {
      x.fillStyle = c;
      let hgt = base;
      for (let xx = 0; xx < W; xx++) {
        hgt += (hash(xx * seed + seed) - 0.5) * 3 * rough + Math.sin(xx * 0.02 + seed) * 0.35;
        hgt = clamp(hgt, base - 30, base + 25);
        x.fillRect(xx, 110 - hgt, 1, hgt);
      }
    }
  }

  function buildMoon() {
    moonCv = mk(44, 44);
    const x = moonCv.getContext('2d');
    for (let j = 0; j < 44; j++) {
      for (let i = 0; i < 44; i++) {
        const dx = i - 21.5, dy = j - 21.5, d = Math.hypot(dx, dy);
        if (d > 20) continue;
        let l = 236 - (dx + dy) * 1.2;
        const crater = [[-6, -4, 5], [7, 5, 4], [-2, 9, 3], [9, -8, 3]].some(([cx, cy, r]) => Math.hypot(dx - cx, dy - cy) < r);
        if (crater) l -= 28;
        x.fillStyle = rgb([l, l - 10, l - 34].map(v => clamp(Math.round(v), 0, 255)));
        x.fillRect(i, j, 1, 1);
      }
    }
  }

  function buildClouds() {
    cloudCvs = [0, 1, 2].map(n => {
      const w = 70 + n * 20, h = 18;
      const c = mk(w, h), x = c.getContext('2d');
      x.fillStyle = '#b9a2d8';
      const blobs = 5 + n;
      for (let b = 0; b < blobs; b++) {
        const cx = (w / (blobs + 1)) * (b + 1), cy = h - 6 - hash(b * 9 + n) * 5, r = 4 + hash(b * 3 + n * 7) * 6;
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (Math.hypot(i - cx, (j - cy) * 1.4) < r) x.fillRect(i, j, 1, 1);
      }
      x.fillRect(4, h - 5, w - 8, 3);
      return c;
    });
    clouds = Array.from({ length: 6 }, (_, i) => ({ i: i % 3, x: rand(-60, W), y: rand(30, 150), v: rand(3, 9), a: rand(0.12, 0.26) }));
  }

  function buildGround(bio) {
    const cv = mk(W, H);
    const x = cv.getContext('2d');
    const thw = towerHalf(GROUND_Y);
    const [wFront, wTop, wDark, wMerlon, wMerlonTop] = bio.wall;

    // Parapet behind the terrace, on both sides of the tower.
    for (const [a, b] of [[0, KX - thw], [KX + thw, W]]) {
      x.fillStyle = wFront;
      x.fillRect(a, GROUND_Y - 10, b - a, 12);
      x.fillStyle = wTop;
      x.fillRect(a, GROUND_Y - 10, b - a, 2);
      x.fillStyle = wDark;
      for (let xx = a; xx < b; xx += 9) x.fillRect(xx, GROUND_Y - 8, 1, 10);
      for (let xx = a + 2; xx < b - 6; xx += 14) {
        x.fillStyle = wMerlon;
        x.fillRect(xx, GROUND_Y - 18, 8, 8);
        x.fillStyle = bio.amb === 'snow' ? '#eef6ff' : wMerlonTop;
        x.fillRect(xx, GROUND_Y - 18, 8, 2);
        x.fillStyle = wDark;
        x.fillRect(xx + 7, GROUND_Y - 16, 1, 6);
        if (bio.amb === 'snow' && hash(xx) > 0.5) { // icicles
          x.fillStyle = '#bfe6ff';
          x.fillRect(xx + 2, GROUND_Y - 10, 1, 2 + Math.floor(hash(xx * 3) * 3));
        }
      }
    }

    // Terrace floor with perspective tiles, lit warmly around the knight.
    const hy = GROUND_Y - 120;
    const img = x.getImageData(0, 0, W, H), d = img.data;
    for (let y = GROUND_Y; y < H; y++) {
      const z = y - hy;
      const rowC = 2400 / z, dRow = 2400 / (z * z);
      const row = Math.floor(rowC);
      for (let xx = 0; xx < W; xx++) {
        const colC = ((xx - KX) * 10) / z + (row % 2) * 0.5;
        const dCol = 10 / z;
        const mortar = rowC - row < dRow * 1.05 || colC - Math.floor(colC) < dCol * 1.05;
        const h = hash(row * 977 + Math.floor(colC) * 131);
        const light = clamp(1.15 - Math.hypot((xx - KX) / (W * 0.62), (y - KY) / 120), 0.35, 1.1);
        const n = (hash(y * 7919 + xx) - 0.5) * 6;
        let r, g, b;
        const [sr, sg, sb] = bio.stone;
        if (mortar) [r, g, b] = bio.mortar;
        else { r = sr + h * 16 + n; g = sg + h * 14 + n; b = sb + h * 12 + n; }
        const dh = hash(xx * 31 + y * 1013);
        if (bio.amb === 'snow' && !mortar && dh > 0.985) { r = 220; g = 232; b = 245; }
        if (bio.amb === 'spore' && mortar && dh > 0.6) { r = 60; g = 110; b = 50; }
        if (bio.amb === 'ember' && bio === BIOMES[3] && mortar && hash(row * 77 + Math.floor(colC) * 5) > 0.82) { r = 255; g = 110; b = 30; }
        if (bio.amb === 'mote' && !mortar && dh > 0.993) { r = 230; g = 120; b = 255; }
        const i = (y * W + xx) * 4;
        d[i] = clamp(r * light + (light > 0.8 ? 12 : 0), 0, 255);
        d[i + 1] = clamp(g * light + (light > 0.8 ? 5 : 0), 0, 255);
        d[i + 2] = clamp(b * light, 0, 255);
        d[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);

    // Raised dais under the knight.
    for (let j = -12; j <= 12; j++) {
      const w = Math.round(44 * Math.sqrt(1 - (j / 12.5) ** 2));
      x.fillStyle = j < -10 ? '#7a7688' : '#56526a';
      x.fillRect(KX - w, KY + j, w * 2, 1);
    }
    x.fillStyle = '#2a2834';
    for (let a = 0; a < TAU; a += 0.02) x.fillRect(Math.round(KX + Math.cos(a) * 44), Math.round(KY + Math.sin(a) * 12), 1, 1);

    // Contact shadow where the tower meets the terrace.
    x.fillStyle = 'rgba(0,0,0,0.35)';
    x.fillRect(KX - thw, GROUND_Y, thw * 2, 3);

    // Gate: stone steps, arched frame, dark interior.
    [[30, 0], [36, 3], [42, 6]].forEach(([hw, yy]) => {
      x.fillStyle = '#6a6678';
      x.fillRect(KX - hw, GROUND_Y + yy, hw * 2, 1);
      x.fillStyle = '#4a4758';
      x.fillRect(KX - hw, GROUND_Y + yy + 1, hw * 2, 2);
    });
    const gw = 15, gh = 44, gTop = GROUND_Y - gh;
    for (let j = gTop - 4; j <= GROUND_Y; j++) {
      for (let i = -gw - 4; i <= gw + 4; i++) {
        const dy = j - (gTop + gw);
        const outer = j >= gTop + gw ? Math.abs(i) <= gw + 4 : i * i + dy * dy <= (gw + 4) ** 2;
        const inner = j >= gTop + gw ? Math.abs(i) <= gw : i * i + dy * dy <= gw * gw;
        if (!outer) continue;
        if (inner) {
          const p = (j - gTop) / gh;
          x.fillStyle = rgb([Math.round(10 + p * 30), Math.round(6 + p * 8), Math.round(18 + p * 40)]);
        } else {
          const stone = (Math.floor((Math.atan2(dy, i) + 4) * 4) + (j > gTop + gw ? Math.floor(j / 6) : 0)) % 2;
          x.fillStyle = stone ? '#77738a' : '#5e5a70';
        }
        x.fillRect(KX + i, j, 1, 1);
      }
    }
    // Runes on the gate interior.
    x.fillStyle = bio.rune;
    for (let j = 0; j < 5; j++) x.fillRect(KX - 6 + ((j * 3) % 12), GROUND_Y - 30 + j * 6, 2, 3);

    // Torch brackets.
    for (const s of [-1, 1]) {
      x.fillStyle = '#2a2420';
      x.fillRect(KX + s * 28 - 1, GROUND_Y - 30, 3, 8);
      x.fillStyle = '#6e4a2a';
      x.fillRect(KX + s * 28 - 2, GROUND_Y - 33, 5, 3);
    }
    return cv;
  }

  function buildStars() {
    stars = Array.from({ length: Math.round(W / 4) }, () => ({ x: rand(0, W), y: rand(0, GROUND_Y - 30), s: rand(1, 4), p: rand(0, TAU), b: Math.random() < 0.12 }));
  }

  /* ======================= rendering (low-res world) ======================= */
  function plot(x, y, c) {
    bx.fillStyle = c;
    bx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  function pline(x0, y0, x1, y1, c) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    bx.fillStyle = c;
    for (let i = 0; i <= n; i++) bx.fillRect(Math.round(lerp(x0, x1, i / n)), Math.round(lerp(y0, y1, i / n)), 1, 1);
  }

  function drawSky() {
    bx.drawImage(skyCv, 0, 0);
    for (const s of stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(G.time * s.s + s.p));
      bx.globalAlpha = a;
      bx.fillStyle = s.b ? '#fff6e0' : '#c9c2ff';
      bx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      if (s.b && a > 0.8) {
        bx.fillRect(Math.round(s.x) - 1, Math.round(s.y), 3, 1);
        bx.fillRect(Math.round(s.x), Math.round(s.y) - 1, 1, 3);
      }
    }
    bx.globalAlpha = 1;
    bx.drawImage(moonCv, Math.round(W * 0.8 - 22), 26);
    const sink = Math.min((G.floorF - 1) * 4, 80);
    bx.drawImage(mountCv, 0, Math.round(GROUND_Y - 80 + sink));
    for (const c of clouds) {
      bx.globalAlpha = c.a;
      bx.drawImage(cloudCvs[c.i], Math.round(c.x), Math.round(c.y + Math.min((G.floorF - 1) * 1.5, 40)));
    }
    bx.globalAlpha = 1;
  }

  function drawTower(bottom) {
    const tw = towerTex.width;
    for (let y = 0; y < bottom; y++) {
      const hw = towerHalf(y);
      bx.drawImage(towerTex, 0, mod(Math.floor(y - G.towerScroll), TOWER_TP), tw, 1, KX - hw, y, hw * 2, 1);
    }
    // Atmospheric fade: the spire dissolves into the night sky.
    const g = bx.createLinearGradient(0, 0, 0, 90);
    const k = clamp((G.floor - 1) / 30, 0, 1);
    const top = mix([11, 8, 32], [3, 3, 10], k);
    g.addColorStop(0, `rgba(${top[0]},${top[1]},${top[2]},0.92)`);
    g.addColorStop(1, `rgba(${top[0]},${top[1]},${top[2]},0)`);
    bx.fillStyle = g;
    bx.fillRect(KX - towerHalf(90) - 1, 0, towerHalf(90) * 2 + 2, 90);
  }

  function drawBanners(bio) {
    const [cloth, dark] = bio.banner;
    for (const s of [-1, 1]) {
      const cx = KX + s * 66, top = GROUND_Y - 122, len = 50;
      bx.fillStyle = '#2a2420';
      bx.fillRect(cx - 9, top - 2, 18, 2);
      for (let r = 0; r < len; r++) {
        const sway = Math.sin(G.time * 1.7 + r * 0.09 + s) * r * 0.035;
        const notch = r > len - 7 ? (r - (len - 7)) : 0;
        const x0 = Math.round(cx - 7 + sway);
        for (let i = 0; i < 14; i++) {
          if (notch && Math.abs(i - 6.5) < notch) continue;
          const edge = i === 0 || i === 13;
          let c = edge ? bio.trim : r % 9 === 0 ? dark : cloth;
          const ey = r - 14;
          if (!edge && Math.abs(i - 6.5) < 1 && ey > 0 && ey < 20) c = '#f2c14e';
          if (!edge && ey === 5 && Math.abs(i - 6.5) < 4) c = '#f2c14e';
          bx.fillStyle = c;
          bx.fillRect(x0 + i, top + r, 1, 1);
        }
      }
    }
  }

  // oy: vertical offset of the terrace during the climb (no sparks while it moves).
  function drawTorches(oy = 0) {
    for (const s of [-1, 1]) {
      const x = KX + s * 28, y = GROUND_Y - 34 + oy;
      const h = 5 + Math.floor(Math.random() * 3);
      for (let j = 0; j < h; j++) {
        const w = Math.max(1, Math.round((1 - j / h) * 3));
        bx.fillStyle = j < 2 ? '#fff2b0' : j < 4 ? '#ffb347' : '#ff6a1a';
        bx.fillRect(x - Math.floor(w / 2) + (j > 3 ? randi(-1, 1) : 0), y - j, w, 1);
      }
      if (!oy && Math.random() < 0.08) particle({ x, y: y - h, vx: rand(-6, 6), vy: rand(-30, -14), g: 0, life: rand(0.4, 0.8), c: '#ffb347', s: 1 });
    }
  }

  function drawRune() {
    const er = G.energy / 100;
    const ready = G.energy >= 100;
    const n = 72;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + G.time * 0.25;
      const on = i / n < er;
      plot(KX + Math.cos(a) * 34, KY + Math.sin(a) * 9.5, on ? (ready && i % 6 === Math.floor(G.time * 12) % 6 ? '#ffffff' : NEON) : '#33304a');
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - G.time * 0.6;
      plot(KX + Math.cos(a) * 26, KY + Math.sin(a) * 7, ready ? NEON : '#4a4568');
    }
    // When the Cut is ready, faint lines on the terrace mark how far it will reach.
    const reach = ultReach();
    if (ready && reach < W) {
      bx.globalAlpha = 0.3 + 0.15 * Math.sin(G.time * 5);
      for (const s of [-1, 1]) {
        const x = KX + s * reach;
        for (let y = GROUND_Y + 14 + (Math.floor(G.time * 8) % 4); y < H - 2; y += 4) plot(x, y, NEON);
      }
      bx.globalAlpha = 1;
    }
  }

  function shadow(x, y, w) {
    bx.fillStyle = 'rgba(0,0,0,0.35)';
    bx.fillRect(Math.round(x - w * 0.32), Math.round(y - 1), Math.round(w * 0.64), 3);
    bx.fillRect(Math.round(x - w * 0.2), Math.round(y - 2), Math.round(w * 0.4), 5);
  }

  // Sword angle in "facing right" space; mirrored when the knight faces left.
  function swordAngle() {
    const k = G.knight;
    const idle = -1.15 + Math.sin(G.time * 2.2) * 0.05;
    let a = idle;
    if (k.swing > 0) {
      const p = 1 - k.swing;
      a = p < 0.45 ? lerp(-2.3, 0.9, easeOut(p / 0.45)) : lerp(0.9, idle, easeInOut((p - 0.45) / 0.55));
    }
    return a + k.twitch * 1.4;
  }
  function swordPivot() {
    const dir = G.knight.flip ? -1 : 1;
    return { x: KX + dir * 9, y: KY - 17, dir };
  }
  function swordTip() {
    const p = swordPivot(), a = swordAngle();
    return { x: p.x + Math.cos(a) * 22 * p.dir, y: p.y + Math.sin(a) * 22 };
  }

  function drawKnight() {
    const k = G.knight;
    const fr = SPR.knight[0];
    const bob = Math.round(Math.sin(G.time * 2.2) * 0.6 + G.knightLift);
    const hurtBlink = k.hurt > 0 && Math.floor(G.time * 24) % 2 === 0;
    const img = hurtBlink ? (k.flip ? fr.wf : fr.w) : k.flip ? fr.f : fr.n;
    if (G.knightLift > -10) shadow(KX, KY, 34 * (1 + G.knightLift / 14));
    if (k.dead > 0) {
      const p = easeOut(Math.min(1, k.dead));
      bx.save();
      bx.translate(KX, KY);
      bx.rotate((k.flip ? 1 : -1) * 1.45 * p);
      bx.globalAlpha = 1 - p * 0.3;
      bx.drawImage(img, -16, -40, 32, 40);
      bx.restore();
      bx.globalAlpha = 1;
      return;
    }
    bx.drawImage(img, KX - 16, KY - 40 + bob, 32, 40);
    // Sword
    const p = swordPivot(), a = swordAngle();
    const vx = Math.cos(a) * p.dir, vy = Math.sin(a); // blade direction
    const px = p.x, py = p.y + bob;
    pline(px - vx * 4, py - vy * 4, px, py, '#6e4a2a'); // grip
    pline(px + vy * 3, py - vx * 3, px - vy * 3, py + vx * 3, '#f2c14e'); // crossguard
    pline(px + vx, py + vy, px + vx * 22, py + vy * 22, '#eef4ff'); // edge
    pline(px + vx - vy, py + vy + vx, px + vx * 20 - vy, py + vy * 20 + vx, '#8fa2c0'); // fuller
  }

  function drawEnemy(e) {
    const def = e.def;
    if (e.kind === 'fireball') {
      const y = e.y - 6 + Math.sin(e.t * 9) * 1;
      e.top = y - 6;
      for (const [r, c] of [[5, '#ff3b1a'], [4, '#ff7a1a'], [2.5, '#ffcf5a'], [1.2, '#fff6c8']]) {
        bx.fillStyle = c;
        for (let j = -r; j <= r; j++) {
          const w = Math.round(Math.sqrt(r * r - j * j));
          bx.fillRect(Math.round(e.x - w), Math.round(y + j), w * 2 + 1, 1);
        }
      }
      return;
    }
    const frames = SPR[def.spr];
    const fr = frames[Math.floor(e.t * (def.fly ? 8 : 5)) % frames.length];
    const left = e.x > KX;
    const img = e.flash > 0 ? (left ? fr.wf : fr.w) : left ? fr.f : fr.n;
    let y = e.y - e.h;
    if (def.fly) y += Math.sin(e.t * 3 + e.x * 0.01) * 4;
    else y -= Math.abs(Math.sin(e.t * 7)) * 1.5;
    e.top = y;
    if (!def.fly) shadow(e.x, e.y, e.w);
    bx.globalAlpha = def.alpha || 1;
    const ex = Math.round(e.x - e.w / 2), ey = Math.round(y);
    if (e.elite) {
      const o = left ? fr.of : fr.o;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) bx.drawImage(o, ex + dx, ey + dy, e.w, e.h);
    }
    bx.drawImage(img, ex, ey, e.w, e.h);
    bx.globalAlpha = 1;
  }

  function drawBoss(b) {
    const spr = SPR.bosses[b.variant];
    const img = b.flash > 0 ? spr.w : spr.n;
    const y = Math.round(b.y - b.h + Math.sin(b.t * 1.5) * 2);
    b.top = y;
    if (b.intro <= 0 && Math.random() < 0.5) {
      particle({ x: b.x + rand(-30, 30), y: y + rand(20, b.h), vx: rand(-4, 4), vy: rand(-26, -10), g: 0, life: rand(0.5, 1.1), c: pick(['#2a1f3d', '#4a3a6a', SPR.bossEyes[b.variant]]), s: 1 });
    }
    shadow(b.x, b.y, b.w);
    bx.globalAlpha = b.alpha;
    if (b.dying > 0) bx.globalAlpha = clamp(b.dying / 1.8, 0, 1) * (Math.floor(G.time * 30) % 2 ? 1 : 0.6);
    bx.drawImage(img, Math.round(b.x - b.w / 2), y, b.w, b.h);
    bx.globalAlpha = 1;
  }

  function drawPrincess(p) {
    const walking = p.walk > 0 && p.walk < 1;
    const bob = walking ? -Math.abs(Math.sin(p.t * 9)) * 2 : Math.sin(p.t * 2) * 0.6;
    shadow(p.x, p.y, p.w);
    bx.drawImage(p.spr.n, Math.round(p.x - p.w / 2), Math.round(p.y - p.h + bob), p.w, p.h);
    if (p.caged) drawCage(p);
  }

  // Iron birdcage: domed bars on a base plate, with a ring on top.
  function drawCage(p) {
    const cx = Math.round(p.x), base = Math.round(p.y), hw = 20, top = base - p.h - 10;
    const domeY = i => top + Math.round(9 - 9 * Math.sqrt(Math.max(0, 1 - (i / (hw + 1)) ** 2)));
    for (let i = -hw; i <= hw; i += 5) {
      const y0 = domeY(i);
      bx.fillStyle = '#2a2c34';
      bx.fillRect(cx + i + 1, y0 + 1, 1, base - y0 - 1);
      bx.fillStyle = Math.abs(i) < 8 ? '#b4b8c2' : '#8b8f99';
      bx.fillRect(cx + i, y0, 1, base - y0);
    }
    for (let i = -hw; i <= hw; i++) {
      plot(cx + i, domeY(i), '#8b8f99');
      plot(cx + i, base - 20, '#5d616c');
    }
    bx.fillStyle = '#5d616c';
    bx.fillRect(cx - 1, top - 5, 3, 1);
    bx.fillRect(cx - 2, top - 4, 1, 3);
    bx.fillRect(cx + 2, top - 4, 1, 3);
    bx.fillRect(cx, top - 1, 1, 2);
    bx.fillStyle = '#3a3d46';
    bx.fillRect(cx - hw - 2, base - 1, hw * 2 + 5, 3);
    bx.fillStyle = GOLD;
    bx.fillRect(cx - hw - 2, base - 1, hw * 2 + 5, 1);
    bx.fillStyle = '#d4a53c';
    bx.fillRect(cx - 2, base - 22, 4, 4); // padlock
    plot(cx, base - 21, '#3a2410');
  }

  function drawCoins() {
    for (const c of G.coinsArr) {
      if (!c.forced && !G.vacuum && c.t > 6 && Math.floor(G.time * 10) % 2) continue;
      const f = SPR.coin[Math.floor(G.time * 10 + c.ph) % 3];
      bx.fillStyle = 'rgba(0,0,0,0.3)';
      bx.fillRect(Math.round(c.x - 2), Math.round(c.y), 5, 1);
      bx.drawImage(f, Math.round(c.x - 2), Math.round(c.y - c.z - 5));
    }
  }

  function drawParticles() {
    for (const p of G.particles) {
      const a = p.amb ? clamp(p.life / p.max * 2, 0, 0.8) * (0.6 + 0.4 * Math.sin(G.time * 9 + p.x)) : clamp((p.life / p.max) * 1.6, 0, 1);
      bx.globalAlpha = a;
      if (p.streak) {
        pline(p.x, p.y, p.x - p.vx * 0.025, p.y - p.vy * 0.025, p.c);
      } else {
        bx.fillStyle = p.c;
        bx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      }
    }
    bx.globalAlpha = 1;
  }

  function drawWorld() {
    bx.imageSmoothingEnabled = false;
    drawSky();
    const climbing = G.state === 'climbing';
    if (climbing) drawClimbClouds(false);
    drawTower(climbing ? H : GROUND_Y);
    if (climbing) {
      // Old terrace drops away below, the next one descends from above.
      const oy = Math.round(G.camY);
      terrace(groundCv, curBiome, oy);
      terrace(groundNext, nextBiome, oy - CLIMB_DIST);
    } else {
      drawBanners(curBiome);
      bx.drawImage(groundCv, 0, 0);
      drawTorches();
      bx.drawImage(decal, 0, 0);
      drawRune();
    }
    const list = G.enemies.filter(e => !e.dead);
    if (G.boss) list.push(G.boss);
    if (G.princess) list.push(G.princess);
    list.push({ kind: 'knight', y: KY });
    list.sort((a, b) => a.y - b.y);
    for (const e of list) {
      if (e.kind === 'knight') drawKnight();
      else if (e.kind === 'boss') drawBoss(e);
      else if (e.kind === 'princess') drawPrincess(e);
      else drawEnemy(e);
    }
    drawCoins();
    drawParticles();
    if (climbing) drawClimbClouds(true);
  }

  function terrace(cv, bio, oy) {
    if (oy >= H || oy <= -H) return;
    bx.save();
    bx.translate(0, oy);
    drawBanners(bio);
    bx.drawImage(cv, 0, 0);
    // Underside of the floor slab, seen from above/below while passing it.
    bx.fillStyle = '#16141e';
    bx.fillRect(0, H, W, 7);
    bx.fillStyle = bio.trim;
    bx.fillRect(0, H, W, 1);
    bx.restore();
    drawTorches(oy);
  }

  function drawClimbClouds(front) {
    for (const c of G.climbClouds) {
      if (c.front !== front) continue;
      const cv = cloudCvs[c.i];
      bx.globalAlpha = c.a;
      bx.drawImage(cv, Math.round(c.x), Math.round(c.y), cv.width * c.s, cv.height * c.s);
    }
    bx.globalAlpha = 1;
  }

  /* ======================= rendering (hi-res overlay) ======================= */
  const offCache = new Map();
  function charOffsets(word, fs) {
    const key = fs + '|' + word;
    let o = offCache.get(key);
    if (o) return o;
    if (offCache.size > 3000) offCache.clear();
    // Sum per-character advances (not prefix widths): glyphs are drawn one by one, and
    // prefix measurement would include ligatures such as "fi" and misplace letters.
    ctx.font = `600 ${fs}px ${FONT}`;
    o = [0];
    for (let i = 0; i < word.length; i++) o.push(o[i] + ctx.measureText(word[i]).width);
    offCache.set(key, o);
    return o;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPlate(e, cx, cy, fs) {
    const isT = e === G.target;
    const word = e.word, offs = charOffsets(word, fs), tw = offs[offs.length - 1];
    const w = tw + 9, h = fs + 6;
    let x0 = cx - w / 2;
    const y0 = cy - h / 2;
    if (e.err > 0) x0 += Math.sin(e.err * 90) * 2;
    ctx.save();
    if (isT) {
      ctx.shadowColor = 'rgba(89,243,255,0.75)';
      ctx.shadowBlur = 10 * scale * dpr;
    }
    ctx.fillStyle = isT ? 'rgba(6,16,26,0.94)' : 'rgba(12,9,22,0.8)';
    roundRect(x0, y0, w, h, 3);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = isT ? 1 : 0.6;
    ctx.strokeStyle = e.err > 0 ? 'rgba(255,80,100,0.95)' : isT ? NEON : 'rgba(255,255,255,0.16)';
    roundRect(x0, y0, w, h, 3);
    ctx.stroke();
    if (isT) {
      ctx.fillStyle = NEON;
      ctx.beginPath();
      ctx.moveTo(cx - 3, y0 + h);
      ctx.lineTo(cx + 3, y0 + h);
      ctx.lineTo(cx, y0 + h + 3);
      ctx.fill();
    }
    ctx.font = `600 ${fs}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const tx = x0 + 4.5;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i], x = tx + offs[i];
      const done = i < e.typed;
      if (ch === ' ') {
        if (!done) {
          ctx.fillStyle = isT && i === e.typed ? NEON : 'rgba(255,255,255,0.28)';
          ctx.fillRect(x + (offs[i + 1] - offs[i]) / 2 - 0.75, cy - 0.75, 1.5, 1.5);
        }
        continue;
      }
      ctx.fillStyle = done ? GOLD : isT ? (i === e.typed ? '#ffffff' : '#d4e4f0') : '#cfc8dd';
      ctx.fillText(ch, x, cy + 0.5);
      if (isT && i === e.typed) {
        ctx.fillStyle = NEON;
        ctx.fillRect(x, cy + fs / 2 + 0.5, offs[i + 1] - offs[i], 1.2);
      }
    }
    return { x0, y0, w, h };
  }

  function drawLabels() {
    const FS = 10.5;
    const list = G.enemies.filter(e => !e.dead && e.x > -30 && e.x < W + 30 && e.typed < e.word.length);
    list.sort((a, b) => (b === G.target) - (a === G.target) || a.top - b.top);
    const placed = [];
    for (const e of list) {
      const offs = charOffsets(e.word, FS);
      const w = offs[offs.length - 1] + 9, h = FS + 6;
      let cx = clamp(e.x, w / 2 + 3, W - w / 2 - 3);
      let cy = e.top - h / 2 - 4;
      for (let it = 0; it < 8; it++) {
        const hit = placed.find(p => Math.abs(p.cx - cx) < (p.w + w) / 2 + 2 && Math.abs(p.cy - cy) < (p.h + h) / 2 + 1);
        if (!hit) break;
        cy = hit.cy - (hit.h + h) / 2 - 2;
      }
      cy = Math.max(cy, h / 2 + 32);
      e.lx = e.lx == null ? cx : lerp(e.lx, cx, 0.35);
      e.ly = e.ly == null ? cy : lerp(e.ly, cy, 0.35);
      placed.push({ cx, cy, w, h });
    }
    for (let i = list.length - 1; i >= 0; i--) drawPlate(list[i], list[i].lx, list[i].ly, FS);
  }

  function drawBossLabel() {
    const b = G.boss;
    if (!b || b.intro > 0 || b.dying > 0 || !b.word) return;
    const fs = 12.5;
    const cy = b.top - 16;
    b.lx = KX;
    b.ly = cy;
    const r = drawPlate(b, KX, cy, fs);
    const left = clamp(1 - b.castT / b.castMax, 0, 1);
    const danger = left < 0.3;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(r.x0, r.y0 + r.h + 3, r.w, 3);
    ctx.fillStyle = danger ? (Math.floor(G.time * 8) % 2 ? '#ff3b5c' : '#ffb347') : '#c2457a';
    ctx.fillRect(r.x0, r.y0 + r.h + 3, r.w * left, 3);
  }

  function drawTargetLine() {
    const tg = G.target;
    if (!tg || tg.dead || tg.lx == null) return;
    const p = swordTip();
    ctx.save();
    ctx.strokeStyle = 'rgba(89,243,255,0.28)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = -G.time * 20;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(tg.lx, tg.ly + 9);
    ctx.stroke();
    ctx.restore();
  }

  function glow(x, y, r, c, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c.replace('A', a));
    g.addColorStop(1, c.replace('A', 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function drawGlows() {
    ctx.globalCompositeOperation = 'lighter';
    glow(W * 0.8, 48, 70, 'rgba(255,240,210,A)', 0.12);
    for (const s of [-1, 1]) glow(KX + s * 28, GROUND_Y - 37, 46, 'rgba(255,150,60,A)', 0.2 + Math.random() * 0.06);
    glow(KX, GROUND_Y - 10, 30, 'rgba(138,79,208,A)', 0.25);
    glow(KX, KY, 42, 'rgba(89,243,255,A)', 0.05 + (G.energy / 100) * 0.12);
    if (G.energy >= 100 && G.knight.dead === 0) {
      const tp = swordTip();
      glow(tp.x, tp.y, 18, 'rgba(89,243,255,A)', 0.4 + Math.sin(G.time * 8) * 0.15);
    }
    for (const e of G.enemies) if (e.kind === 'fireball' && !e.dead) glow(e.x, e.y - 6, 22, 'rgba(255,120,40,A)', 0.45);
    const b = G.boss;
    if (b && b.alpha > 0) {
      const ec = SPR.bossEyes[b.variant];
      const rr = parseInt(ec.slice(1, 3), 16), gg = parseInt(ec.slice(3, 5), 16), bb = parseInt(ec.slice(5, 7), 16);
      const charge = b.intro <= 0 && b.dying <= 0 ? b.castT / b.castMax : 0;
      glow(b.x, b.top + 28, 26 + charge * 30, `rgba(${rr},${gg},${bb},A)`, (0.2 + charge * 0.35) * b.alpha);
    }
    // Sword swing arc
    const k = G.knight;
    if (k.swing > 0 && 1 - k.swing < 0.45) {
      const p = swordPivot();
      const prog = (1 - k.swing) / 0.45;
      const a0 = -2.3, a1 = lerp(-2.3, 0.9, easeOut(prog));
      const sa = a => (p.dir > 0 ? a : Math.PI - a);
      ctx.strokeStyle = `rgba(190,245,255,${0.7 * (1 - prog * 0.5)})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 19, sa(a0), sa(a1), p.dir < 0);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFx() {
    ctx.globalCompositeOperation = 'lighter';
    for (const f of G.fx) {
      const p = 1 - f.life / f.max;
      const a = 1 - p;
      if (f.type === 'streak') {
        const g = ctx.createLinearGradient(f.x1, f.y1, f.x2, f.y2);
        g.addColorStop(0, `rgba(89,243,255,${a * 0.2})`);
        g.addColorStop(1, `rgba(255,255,255,${a})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = 3 * a + 0.5;
        ctx.beginPath();
        ctx.moveTo(f.x1, f.y1);
        ctx.lineTo(f.x2, f.y2);
        ctx.stroke();
      } else if (f.type === 'cross') {
        const L = f.size * (0.6 + easeOut(p) * 0.6);
        for (const [ang, c] of [[f.a + 0.75, '255,255,255'], [f.a - 0.75, '89,243,255']]) {
          ctx.strokeStyle = `rgba(${c},${a})`;
          ctx.lineWidth = 3.2 * a;
          ctx.beginPath();
          ctx.moveTo(f.x - Math.cos(ang) * L / 2, f.y - Math.sin(ang) * L / 2);
          ctx.lineTo(f.x + Math.cos(ang) * L / 2, f.y + Math.sin(ang) * L / 2);
          ctx.stroke();
        }
      } else if (f.type === 'ring') {
        ctx.strokeStyle = f.c;
        ctx.globalAlpha = a;
        ctx.lineWidth = 2 * a + 0.4;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * easeOut(p), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.type === 'bolt') {
        ctx.strokeStyle = f.c;
        ctx.globalAlpha = a;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        f.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Numbers pop in slightly oversized, with a thick rounded outline and a hard drop
  // shadow (like the pixel HUD) so they stay readable over busy art.
  function drawFloaters() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.4px';
    for (const f of G.floaters) {
      const p = 1 - f.life / f.max;
      ctx.globalAlpha = clamp(f.life / f.max * 2.5, 0, 1);
      const num = /^[+-]\d/.test(f.text);
      const fs = f.size * (num ? 1.3 : 1) * (p < 0.12 ? 1.3 - p * 2.5 : 1);
      ctx.font = num ? `400 ${fs}px ${NUM_FONT}` : `700 ${fs}px ${FONT}`;
      ctx.fillStyle = 'rgba(5,4,10,0.9)';
      ctx.fillText(f.text, f.x, f.y + 1.3);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(5,4,10,0.92)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.c;
      ctx.fillText(f.text, f.x, f.y);
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.lineJoin = 'miter';
    ctx.globalAlpha = 1;
  }

  function drawUltSplit() {
    const u = G.ult;
    const p = u.t / u.dur;
    const y0 = u.y + 30, y1 = u.y - 30;
    const open = p < 0.15 ? 0 : Math.sin(clamp((p - 0.15) / 0.8, 0, 1) * Math.PI) * (reduceMotion ? 3 : 9);
    const ang = Math.atan2(y1 - y0, W);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    ctx.fillStyle = '#020104';
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-20, -20); ctx.lineTo(W + 20, -20); ctx.lineTo(W + 20, y1); ctx.lineTo(-20, y0);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(buf, -nx * open - open * 0.6, -ny * open);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-20, y0); ctx.lineTo(W + 20, y1); ctx.lineTo(W + 20, H + 20); ctx.lineTo(-20, H + 20);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(buf, nx * open + open * 0.6, ny * open);
    ctx.restore();
    const reach = p < 0.15 ? p / 0.15 : 1;
    const lw = 1 + open * 0.35 + (p < 0.2 ? 6 * (1 - p / 0.2) : 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const [c, off] of [['rgba(255,60,200,0.8)', -1.6], ['rgba(60,240,255,0.8)', 1.6], ['rgba(255,255,255,1)', 0]]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(-20, y0 + off);
      ctx.lineTo(lerp(-20, W + 20, reach), lerp(y0, y1, reach) + off);
      ctx.stroke();
    }
    const r = ultReach();
    if (r < W && p >= 0.15) {
      const k = Math.sin(clamp((p - 0.15) / 0.8, 0, 1) * Math.PI);
      ctx.strokeStyle = `rgba(89,243,255,${0.85 * k})`;
      ctx.lineWidth = 2;
      for (const s of [-1, 1]) {
        const x = KX + s * r, y = lerp(y0, y1, (x + 20) / (W + 40));
        ctx.beginPath();
        ctx.moveTo(x, y - 22 * k);
        ctx.lineTo(x, y + 22 * k);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  let vignetteGrad = null;
  function drawScreenFx() {
    if (!vignetteGrad) {
      vignetteGrad = ctx.createRadialGradient(KX, H * 0.58, H * 0.32, KX, H * 0.58, W * 0.72);
      vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.62)');
    }
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    const low = G.state !== 'title' && G.hp === 1 ? 0.18 + Math.sin(G.time * 5) * 0.08 : 0;
    const red = Math.max(G.hurtFlash * 0.55, G.errFlash * 0.5, low);
    if (red > 0) {
      const g = ctx.createRadialGradient(KX, H / 2, H * 0.25, KX, H / 2, W * 0.7);
      g.addColorStop(0, 'rgba(224,52,78,0)');
      g.addColorStop(1, `rgba(224,52,78,${red})`);
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
    if (G.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(G.flash, 0.9)})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
  }

  function render() {
    drawWorld();
    const sc = scale * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const amp = G.trauma * G.trauma * 7 * (reduceMotion ? 0.3 : 1);
    const ox = Math.sin(G.time * 53.1) * amp, oy = Math.cos(G.time * 47.7) * amp;
    ctx.setTransform(sc, 0, 0, sc, ox * sc, oy * sc);
    ctx.imageSmoothingEnabled = false;
    if (G.ult) drawUltSplit();
    else ctx.drawImage(buf, 0, 0);
    drawGlows();
    drawFx();
    if (G.state === 'playing') drawTargetLine();
    if (G.state !== 'title') {
      drawLabels();
      drawBossLabel();
    }
    drawFloaters();
    drawScreenFx();
  }

  /* ======================= update ======================= */
  function update(dt) {
    G.time += dt;
    G.trauma = Math.max(0, G.trauma - dt * 1.5);
    G.flash = Math.max(0, G.flash - dt * 2.2);
    G.hurtFlash = Math.max(0, G.hurtFlash - dt * 1.4);
    G.errFlash = Math.max(0, G.errFlash - dt * 1.5);
    ambient(dt);
    updateUlt(dt);

    let sdt = dt;
    if (G.hitStop > 0) {
      G.hitStop -= dt;
      sdt = 0;
    }
    if (G.ult && !G.ult.fired) sdt *= 0.15;

    const k = G.knight;
    k.swing = Math.max(0, k.swing - dt / 0.22);
    k.twitch = Math.max(0, k.twitch - dt);
    k.hurt = Math.max(0, k.hurt - dt);
    G.steadyCd -= dt;
    G.warpT = Math.max(0, G.warpT - sdt);

    if (G.state === 'playing') {
      G.stats.time += dt;
      updateSpawner(sdt);
      updateBoss(sdt);
      updateEnemies(sdt);
      updatePrincess(sdt);
      faceThreat();
    } else if (G.state === 'floorclear') {
      updateBoss(sdt);
      updatePrincess(sdt);
      G.clearT -= dt;
      if (G.clearT <= 0 && (G.coinsArr.length === 0 || G.clearT < -2)) {
        if (G.princess && !G.princess.gifted) openGift();
        else openShop();
      }
    } else if (G.state === 'climbing') {
      updateClimb(dt);
    } else if (G.state === 'dying') {
      G.dying -= dt;
      k.dead = Math.min(1, k.dead + dt * 1.2);
      sdt *= 0.3;
      if (G.dying <= 0) showGameOver();
    }
    const menu = G.state === 'paused' || G.state === 'shop' || G.state === 'gift';
    if (!menu) updateCoins(sdt);
    updateParticles(menu ? dt * 0.25 : sdt);
    for (const f of G.fx) f.life -= dt;
    G.fx = G.fx.filter(f => f.life > 0);
    for (const f of G.floaters) {
      f.life -= dt;
      f.y -= 16 * dt;
    }
    G.floaters = G.floaters.filter(f => f.life > 0);
  }

  function faceThreat() {
    const k = G.knight;
    if (k.swing > 0) return;
    const tg = G.target;
    if (tg && tg.kind !== 'boss') {
      k.flip = tg.x < KX;
      return;
    }
    let best = null, bd = Infinity;
    for (const e of G.enemies) {
      const d = Math.hypot(e.x - KX, e.y - KY);
      if (d < bd) { bd = d; best = e; }
    }
    if (best && Math.abs(best.x - KX) > 4) k.flip = best.x < KX;
  }

  /* ======================= HUD (DOM) ======================= */
  const hud = {
    floor: $('hudFloor'), alt: $('hudAlt'), score: $('hudScore'), mult: $('hudMult'), combo: $('hudCombo'), coins: $('hudCoins'),
    coinsWrap: $('hudCoinsWrap'), hearts: $('hudHearts'), energy: $('energy'), energyFill: $('energyFill'),
    energyText: $('energyText'), prog: $('floorProg'), progWrap: $('floorProgWrap'), bossBar: $('bossBar'),
    bossName: $('bossName'), bossFill: $('bossFill'), bossTicks: $('bossTicks'), wpm: $('hudWpm'), acc: $('hudAcc'), ups: $('hudUps')
  };
  const cache = {};
  function setText(el, key, v) {
    if (cache[key] === v) return false;
    cache[key] = v;
    el.textContent = v;
    return true;
  }
  function pulse(el, cls = 'pulse') {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  const HEART_SVG = '<svg viewBox="0 0 7 6" shape-rendering="crispEdges" aria-hidden="true"><path d="M1 0h2v1h1V0h2v1h1v2h-1v1h-1v1h-1v1H3V5H2V4H1V3H0V1h1z"/><rect class="hl" x="1" y="1" width="1" height="1"/></svg>';

  function updateHUD() {
    if ($('hud').hidden) return;
    setText(hud.floor, 'floor', String(G.floor));
    setText(hud.alt, 'alt', Math.round(G.floorF * 12) + ' m'); // counts up live during the climb
    setText(hud.score, 'score', G.score.toLocaleString(G.lang === 'es' ? 'es-ES' : 'en-US'));
    const m = comboMult();
    if (setText(hud.mult, 'mult', 'x' + m) && m > 1) pulse(hud.mult);
    hud.mult.classList.toggle('hot', m >= 3);
    setText(hud.combo, 'combo', String(G.combo));
    if (setText(hud.coins, 'coins', String(G.coins))) pulse(hud.coinsWrap);

    const hk = G.hp + '/' + G.maxHp;
    if (cache.hearts !== hk) {
      const prev = cache.hearts ? parseInt(cache.hearts, 10) : G.hp;
      cache.hearts = hk;
      hud.hearts.innerHTML = Array.from({ length: G.maxHp }, (_, i) => `<span class="heart ${i < G.hp ? 'full' : 'empty'}">${HEART_SVG}</span>`).join('');
      hud.hearts.setAttribute('aria-label', `${G.hp} / ${G.maxHp}`);
      if (G.hp < prev) pulse(hud.hearts, 'shake');
    }

    const e = Math.floor(G.energy);
    if (cache.energy !== e) {
      cache.energy = e;
      hud.energyFill.style.transform = `scaleX(${e / 100})`;
      hud.energy.classList.toggle('ready', e >= 100);
      hud.energy.setAttribute('aria-valuenow', String(e));
      hud.energyText.textContent = e >= 100 ? t('energyReady') : t('energy');
    }

    const showProg = !G.plan || !G.plan.boss;
    hud.progWrap.style.visibility = showProg ? 'visible' : 'hidden';
    if (showProg && G.plan) {
      const p = G.plan.count ? clamp(G.floorDone / G.plan.count, 0, 1) : 0;
      if (cache.prog !== p) {
        cache.prog = p;
        hud.prog.style.transform = `scaleX(${p})`;
      }
    }

    const b = G.boss;
    hud.bossBar.classList.toggle('open', !!b);
    if (b) {
      setText(hud.bossName, 'bossName', bossName(b));
      const p = b.hp / b.maxHp;
      if (cache.bossP !== p) {
        cache.bossP = p;
        hud.bossFill.style.transform = `scaleX(${p})`;
      }
      if (cache.bossSegs !== b.segs) {
        cache.bossSegs = b.segs;
        hud.bossTicks.innerHTML = Array.from({ length: b.segs - 1 }, (_, i) => `<i style="left:${((i + 1) / b.segs) * 100}%"></i>`).join('');
      }
    }

    if (Math.floor(G.time * 4) !== cache.statTick) {
      cache.statTick = Math.floor(G.time * 4);
      const mins = G.stats.time / 60;
      hud.wpm.textContent = mins > 0.05 ? Math.round(G.stats.correct / 5 / mins) : '0';
      const tot = G.stats.correct + G.stats.errors;
      hud.acc.textContent = (tot ? Math.round((G.stats.correct / tot) * 100) : 100) + '%';
    }

    if (cache.ups !== G.upgVersion + G.lang) {
      cache.ups = G.upgVersion + G.lang;
      hud.ups.replaceChildren(...Object.entries(G.upgrades).map(([id, n]) => {
        const s = document.createElement('span');
        s.className = 'up-chip r' + UPG[id].rarity;
        s.title = t('up')[id][0];
        const img = new Image();
        img.src = SPR.icons[id];
        img.alt = t('up')[id][0];
        s.append(img);
        if (n > 1) {
          const c = document.createElement('b');
          c.textContent = n;
          s.append(c);
        }
        return s;
      }));
    }
  }

  // Blackletter and Pixelify numerals are hard to read ("1" looks like "ı", "5" like "8"):
  // set digits in the numeric face.
  function withNums(text) {
    return text.split(/(\d+)/).filter(Boolean).map(part => {
      if (!/^\d+$/.test(part)) return document.createTextNode(part);
      const s = document.createElement('span');
      s.className = 'num';
      s.textContent = part;
      return s;
    });
  }

  function banner(title, sub, kind) {
    const el = $('banner');
    $('bannerTitle').replaceChildren(...withNums(title));
    $('bannerSub').textContent = sub || '';
    el.dataset.kind = kind || '';
    pulse(el, 'show');
  }

  /* ======================= screens ======================= */
  const screens = ['scrTitle', 'scrPause', 'scrShop', 'scrGift', 'scrOver'].map($);
  function show(el, focusSel) {
    el.classList.add('open');
    el.removeAttribute('inert');
    el.setAttribute('aria-hidden', 'false');
    const f = focusSel && el.querySelector(focusSel);
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
  }
  function hide(el) {
    el.classList.remove('open');
    el.setAttribute('inert', '');
    el.setAttribute('aria-hidden', 'true');
  }
  function hideAll() {
    screens.forEach(hide);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function toTitle() {
    audio.stopMusic();
    hideAll();
    $('hud').hidden = true;
    G.state = 'title';
    G.enemies = [];
    G.boss = null;
    G.coinsArr = [];
    G.target = null;
    G.ult = null;
    G.knight = { flip: false, swing: 0, twitch: 0, hurt: 0, dead: 0 };
    G.floor = 1;
    G.floorF = 1;
    buildSky();
    renderBest();
    show($('scrTitle'), '#btnStart');
  }

  function pause() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    show($('scrPause'), '#btnResume');
    audio.duckMusic(0.12);
  }
  function resume() {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    hideAll();
    audio.duckMusic(0.55);
  }

  const haggle = () => (1 - 0.25 * lvl('haggler')) * (lvl('treasury') ? 0.5 : 1);
  function rerollCost() { return Math.round((5 + G.floor * 3 + G.shop.rerolls * 8) * haggle()); }
  function potionCost() { return Math.round((10 + G.floor * 2) * haggle()); }

  function rollOffers() {
    const avail = UPGRADES.filter(u => !u.fallback && u.rarity < 3 && lvl(u.id) < u.max);
    const weights = G.floor >= 10 ? [50, 35, 15] : [62, 28, 10];
    const out = [];
    while (out.length < 3 && avail.length) {
      let r = Math.random() * avail.reduce((s, u) => s + weights[u.rarity], 0);
      let i = 0;
      for (; i < avail.length - 1; i++) {
        r -= weights[avail[i].rarity];
        if (r <= 0) break;
      }
      out.push(avail[i].id);
      avail.splice(i, 1);
    }
    const fb = ['bounty', 'mend'];
    while (out.length < 3) out.push(fb[out.length % 2]);
    return out;
  }

  function rollLegendary() {
    const out = shuffle(UPGRADES.filter(u => u.rarity === 3 && lvl(u.id) < u.max)).slice(0, 3).map(u => u.id);
    const fb = ['bounty', 'mend'];
    while (out.length < 3) out.push(fb[out.length % 2]);
    return out;
  }

  // A rescued princess offers a choice of legendary blessings before the usual shop.
  function openGift() {
    const p = G.princess;
    p.gifted = true;
    G.state = 'gift';
    G.gift = { offers: rollLegendary() };
    G.shopLock = G.time + 0.6;
    $('giftPortrait').src = p.portrait;
    renderGift(true);
    show($('scrGift'), '.card');
    audio.duckMusic(0.2);
  }

  function renderGift(animate) {
    const p = G.princess;
    $('giftTitle').textContent = t('princessFree', { name: p ? p.name : '' });
    $('giftCards').replaceChildren(...G.gift.offers.map((id, i) => makeCard(id, i, animate, pickGift)));
  }

  function pickGift(i) {
    if (G.state !== 'gift' || G.time < G.shopLock) return;
    const id = G.gift.offers[i];
    if (!id) return;
    applyUpgrade(id);
    audio.rescue();
    hideAll();
    openShop();
  }

  function openShop() {
    G.state = 'shop';
    G.vacuum = false;
    G.shop = { offers: rollOffers(), rerolls: 0 };
    G.shopLock = G.time + 0.6; // ignore keys still in flight from the fight
    renderShop(true);
    show($('scrShop'), '.card');
    audio.duckMusic(0.2);
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function makeCard(id, i, animate, onPick) {
    const u = UPG[id];
    const [name, desc] = t('up')[id];
    const cur = lvl(id);
    const b = el('button', `card r${u.rarity}${animate ? ' enter' : ''}`);
    b.type = 'button';
    b.style.setProperty('--i', i);
    const icon = new Image();
    icon.src = SPR.icons[id];
    icon.alt = '';
    icon.className = 'card-icon';
    b.append(
      el('span', 'card-key', String(i + 1)),
      el('span', 'card-rarity', t('rarity' + u.rarity)),
      icon,
      el('span', 'card-name', name),
      el('span', 'card-desc'),
      el('span', 'card-owned', u.fallback ? '' : cur ? t('owned', { n: cur, m: u.max }) : t('newTag'))
    );
    b.querySelector('.card-desc').append(...withNums(desc));
    b.setAttribute('aria-label', `${i + 1}. ${name}. ${desc}`);
    b.addEventListener('click', () => onPick(i));
    return b;
  }

  function renderShop(animate) {
    $('shopCards').replaceChildren(...G.shop.offers.map((id, i) => makeCard(id, i, animate, pickCard)));
    const rc = rerollCost(), pc = potionCost();
    $('shopCoins').textContent = G.coins;
    $('rerollCost').textContent = rc;
    $('btnReroll').disabled = G.coins < rc;
    $('btnReroll').title = G.coins < rc ? t('needCoins') : '';
    $('potionCost').textContent = pc;
    const full = G.hp >= G.maxHp;
    $('btnPotion').disabled = full || G.coins < pc;
    $('potionNote').textContent = full ? t('healthFull') : G.coins < pc ? t('needCoins') : t('potionDesc');
  }

  function applyUpgrade(id) {
    if (id === 'bounty') G.coins += 25;
    else if (id === 'mend') heal(2);
    else {
      G.upgrades[id] = lvl(id) + 1;
      if (id === 'heart') {
        G.maxHp++;
        heal(1);
      } else if (id === 'glass') {
        G.maxHp--;
        G.hp = Math.min(G.hp, G.maxHp);
      } else if (id === 'guardian') G.guardian = 1;
      else if (id === 'phoenix') G.phoenix = 2;
      else if (id === 'crown') {
        G.maxHp += 2;
        heal(G.maxHp);
      } else if (id === 'treasury') G.coins += 120;
      G.upgVersion++;
    }
  }

  function pickCard(i) {
    if (G.state !== 'shop' || G.time < G.shopLock) return;
    const id = G.shop.offers[i];
    if (!id) return;
    applyUpgrade(id);
    audio.pick();
    hideAll();
    beginClimb();
  }

  function reroll() {
    if (G.state !== 'shop') return;
    const c = rerollCost();
    if (G.coins < c) {
      audio.denied();
      pulse($('btnReroll'), 'deny');
      return;
    }
    G.coins -= c;
    G.shop.rerolls++;
    G.shop.offers = rollOffers();
    audio.reroll();
    renderShop(true);
  }

  function buyPotion() {
    if (G.state !== 'shop') return;
    const c = potionCost();
    if (G.hp >= G.maxHp || G.coins < c) {
      audio.denied();
      pulse($('btnPotion'), 'deny');
      return;
    }
    G.coins -= c;
    heal(1);
    audio.pick();
    renderShop(false);
  }

  function showGameOver() {
    G.state = 'gameover';
    const tot = G.stats.correct + G.stats.errors;
    const mins = G.stats.time / 60;
    const isBest = G.score > (G.best.score || 0);
    if (isBest || G.floor > (G.best.floor || 0)) {
      G.best = { score: Math.max(G.score, G.best.score || 0), floor: Math.max(G.floor, G.best.floor || 0) };
      store.set('tk_best', G.best);
    }
    const loc = G.lang === 'es' ? 'es-ES' : 'en-US';
    $('overReached').textContent = t('reached', { n: G.floor });
    $('stScore').textContent = G.score.toLocaleString(loc);
    $('stFloor').textContent = G.floor;
    $('stWpm').textContent = mins > 0.05 ? Math.round(G.stats.correct / 5 / mins) : 0;
    $('stAcc').textContent = (tot ? Math.round((G.stats.correct / tot) * 100) : 100) + '%';
    $('stCombo').textContent = G.maxCombo;
    $('stSlain').textContent = G.stats.kills;
    $('overBest').hidden = !isBest || G.score === 0;
    G.overLock = G.time + 0.8;
    show($('scrOver'), '#btnAgain');
  }

  function renderBest() {
    const b = G.best;
    $('bestScore').textContent = (b.score || 0).toLocaleString(G.lang === 'es' ? 'es-ES' : 'en-US');
    $('bestFloor').textContent = t('bestFloor', { n: b.floor || 0 });
  }

  /* ======================= i18n / settings ======================= */
  function applyI18n() {
    document.documentElement.lang = G.lang;
    document.title = t('docTitle') + ' — SLOMBO GAMES';
    document.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach(n => n.setAttribute('aria-label', t(n.dataset.i18nAria)));
    document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === G.lang)));
    document.querySelectorAll('[data-sound-state]').forEach(n => { n.textContent = G.muted ? t('off') : t('on'); });
    document.querySelectorAll('[data-sound]').forEach(b => b.setAttribute('aria-pressed', String(!G.muted)));
    for (const k in cache) delete cache[k];
    renderBest();
    if (G.state === 'shop') renderShop(false);
    if (G.state === 'gift') renderGift(false);
  }

  function setLang(l) {
    if (l !== 'en' && l !== 'es') return;
    G.lang = l;
    store.set('tk_lang', l);
    applyI18n();
    audio.ui();
  }

  function toggleSound() {
    G.muted = !G.muted;
    store.set('tk_muted', G.muted);
    audio.init();
    audio.setMuted(G.muted);
    applyI18n();
    audio.ui();
  }

  /* ======================= input ======================= */
  function buttonFocused() {
    const a = document.activeElement;
    return !!a && (a.tagName === 'BUTTON' || a.tagName === 'A');
  }

  function onKey(e) {
    if (e.isComposing) return;
    const k = e.key;
    switch (G.state) {
      case 'title':
        if (k === 'Enter' && !buttonFocused()) {
          e.preventDefault();
          startRun();
        }
        return;
      case 'paused':
        if (k === 'Escape' || (k === 'Enter' && !buttonFocused())) {
          e.preventDefault();
          resume();
        }
        return;
      case 'shop':
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (k === '1' || k === '2' || k === '3') {
          e.preventDefault();
          pickCard(+k - 1);
        } else if (k === 'r' || k === 'R') {
          e.preventDefault();
          reroll();
        } else if (k === 'p' || k === 'P') {
          e.preventDefault();
          buyPotion();
        }
        return;
      case 'gift':
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (k === '1' || k === '2' || k === '3') {
          e.preventDefault();
          pickGift(+k - 1);
        }
        return;
      case 'gameover':
        if (k === 'Enter' && !buttonFocused()) {
          e.preventDefault();
          if (G.time > G.overLock) startRun();
        }
        return;
      case 'playing':
        onPlayKey(e);
        return;
      default:
        // floorclear / climbing / dying: swallow keys that would scroll or navigate.
        if (k === ' ' || k === 'Backspace' || k === 'Tab' || k === "'" || k === '/') e.preventDefault();
    }
  }

  function onPlayKey(e) {
    const k = e.key;
    if (k === 'Escape') {
      e.preventDefault();
      pause();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
    // Space types a space only when a boss phrase expects one; otherwise it is the
    // Dimensional Cut. Enter always casts it, for players mid-phrase.
    if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      const tg = G.target;
      if (k !== 'Enter' && tg && !tg.dead && tg.word[tg.typed] === ' ') typeChar(' ');
      else tryUltimate();
      return;
    }
    if (k === 'Backspace') {
      // Release the lock (progress is kept) so the next letter can pick a new foe.
      e.preventDefault();
      G.target = null;
      return;
    }
    if (k === 'Tab' || k === "'" || k === '/') e.preventDefault();
    if (k.length !== 1) return;
    e.preventDefault();
    if (e.repeat) return;
    const c = norm(k);
    if (!/^[a-z]$/.test(c)) return;
    typeChar(c);
  }

  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', e => {
    if (G.state === 'playing' && e.key === ' ') e.preventDefault();
  });
  window.addEventListener('blur', () => pause());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  $('btnStart').addEventListener('click', startRun);
  $('btnResume').addEventListener('click', resume);
  $('btnQuit').addEventListener('click', toTitle);
  $('btnAgain').addEventListener('click', () => { if (G.time > G.overLock) startRun(); });
  $('btnToTitle').addEventListener('click', toTitle);
  $('btnReroll').addEventListener('click', reroll);
  $('btnPotion').addEventListener('click', buyPotion);
  $('btnPauseHud').addEventListener('click', pause);
  document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
  document.querySelectorAll('[data-sound]').forEach(b => b.addEventListener('click', toggleSound));

  /* ======================= layout ======================= */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = window.innerWidth, vh = window.innerHeight;
    const newW = Math.round(clamp((H * vw) / vh, 560, 900));
    const shift = Math.round(newW / 2) - KX;
    W = newW;
    KX = Math.round(W / 2);
    scale = Math.min(vw / W, vh / H);
    const cw = Math.floor(W * scale), ch = Math.floor(H * scale);
    stage.style.width = cw + 'px';
    stage.style.height = ch + 'px';
    stage.style.setProperty('--u', scale + 'px');
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    if (shift) {
      for (const e of G.enemies) { e.x += shift; e.lx = null; }
      for (const c of G.coinsArr) c.x += shift;
      for (const p of G.particles) p.x += shift;
      if (G.boss) { G.boss.x += shift; }
      if (G.princess) { G.princess.x += shift; G.princess.fromX += shift; }
    }
    buf.width = W;
    decal.width = W;
    decal.height = H;
    vignetteGrad = null;
    buildSky();
    buildMountains();
    curBiome = biomeOf(G.floor);
    groundCv = buildGround(curBiome);
    if (G.state === 'climbing' && nextBiome) groundNext = buildGround(nextBiome);
    buildStars();
    buildClouds();
  }

  /* ======================= boot ======================= */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    updateHUD();
    requestAnimationFrame(frame);
  }

  resetRun();
  $('potionIcon').src = SPR.icons.potion;
  towerTex = buildTowerTex();
  buildMoon();
  resize();
  window.addEventListener('resize', resize);
  applyI18n();
  hide($('scrPause'));
  hide($('scrShop'));
  hide($('scrGift'));
  hide($('scrOver'));
  show($('scrTitle'), '#btnStart');
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => offCache.clear());
  if (document.fonts) document.fonts.load('20px "Jersey 10"').catch(() => {}); // canvas floaters need it before the HUD shows
  requestAnimationFrame(t0 => {
    last = t0;
    requestAnimationFrame(frame);
  });

  if (/[?&]debug\b/.test(location.search)) {
    window.__tk = { G, typeChar, startRun, tryUltimate, pickCard, pickGift, bank, spawnEnemy, onKey, startFloor };
  }
})();
