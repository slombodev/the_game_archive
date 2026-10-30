/* The Typing Knight — pixel-art sprites.
 * Every sprite is a list of rows; each character is a palette key ('.' = transparent).
 * build() rasterises them once into canvases plus flipped / white hit-flash variants.
 */
window.TKSprites = (() => {
  const K = '#0e0c16';

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function raster(rows, pal) {
    const w = Math.max(...rows.map(r => r.length)), h = rows.length;
    const c = canvas(w, h), x = c.getContext('2d');
    rows.forEach((r, j) => {
      for (let i = 0; i < r.length; i++) {
        const col = pal[r[i]];
        if (!col) continue;
        x.fillStyle = col;
        x.fillRect(i, j, 1, 1);
      }
    });
    return c;
  }

  // Left half -> full symmetric sprite.
  const mirror = rows => rows.map(r => r + [...r].reverse().join(''));

  function flipped(src) {
    const c = canvas(src.width, src.height), x = c.getContext('2d');
    x.translate(src.width, 0);
    x.scale(-1, 1);
    x.drawImage(src, 0, 0);
    return c;
  }

  function silhouette(src, color = '#ffffff') {
    const c = canvas(src.width, src.height), x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // n/f: normal + flipped, w/wf: white hit-flash, o/of: red elite outline, a/af: silver armored-elite outline.
  function variants(c) {
    const w = silhouette(c), o = silhouette(c, '#ff2d55'), a = silhouette(c, '#c9d3e0');
    return { n: c, f: flipped(c), w, wf: flipped(w), o, of: flipped(o), a, af: flipped(a) };
  }

  /* ---------------- knight (faces right; sword is drawn procedurally) ---------------- */
  const knightPal = {
    k: K, s: '#e4eaf4', m: '#9aa4b8', d: '#5a6378', r: '#e0344e', R: '#8e1c32',
    g: '#f2c14e', c: '#4b3a8c', C: '#2c2160', e: '#8ff8ff', b: '#6e4a2a', B: '#3f2a18'
  };
  const knight = [
    '......rr........',
    '.....rRRr.......',
    '....kkRRkk......',
    '...kssssmmk.....',
    '...ksmmmmmdk....',
    '...kmkkeeekk....',
    '...kmmmmmmdk....',
    '....kdmmmdk.....',
    '..cckkssmdkk....',
    '.cCkssmmmdgdk...',
    '.cCksgggmdkmmk..',
    'cCCkmmmmmdkksk..',
    'cCCkbbgbbbk.kk..',
    'cCCkmmmdmmk.....',
    '.CCkmmdkdmk.....',
    '.CCkmdk.kmdk....',
    '..Ckmdk.kmdk....',
    '...kddk..kdk....',
    '..kbBBk.kbBBk...',
    '..kkkkk.kkkkk...'
  ];

  /* ---------------- enemies ---------------- */
  const skelPal = { k: '#120e14', w: '#e8e2cf', W: '#a89f86', r: '#ff3b3b' };
  const skelTop = [
    '...kkkkkk...',
    '..kwwwwwwk..',
    '..kwrwwrwk..',
    '..kwwwwwwk..',
    '..kwwkkwwk..',
    '...kwkkwk...',
    '....kwwk....',
    '..kkwwwwkk..',
    '.kwkwkkwkwk.',
    '.kwkwwwwkwk.',
    '.kwkwkkwkwk.',
    '.kk.kwwk.kk.',
    '....kWWk....'
  ];
  const skeleton = [
    skelTop.concat(['...kwkkwk...', '...kwkkwk...', '..kwwkkwwk..']),
    skelTop.concat(['..kwk..kwk..', '..kwk..kwk..', '.kwwk..kwwk.'])
  ];

  const gobPal = { k: '#10140c', g: '#5fae3e', G: '#3a7a26', y: '#ffdd33', w: '#f0f0d0', b: '#7a4a24' };
  const gobTop = [
    'k..........k',
    'kgk.kkkk.kgk',
    '.kgkggggkgk.',
    '..kggggggk..',
    '..kgyggygk..',
    '..kGggggGk..',
    '...kgwwgk...',
    '..kkkggkkk..',
    '.kgkbbbbkgk.',
    '.kk.kbbk.kk.'
  ];
  const goblin = [
    gobTop.concat(['...kgkkgk...', '...kk..kk...']),
    gobTop.concat(['..kgk..kgk..', '..kk....kk..'])
  ];

  const batPal = { k: '#0c0812', p: '#7a46b0', P: '#3e2160', r: '#ff3355' };
  const bat = [
    [
      'kk............kk',
      'kpk..........kpk',
      'kppk..k..k..kppk',
      '.kppkkpkkpkkppk.',
      '..kpppprrppppk..',
      '...kkppppppkk...',
      '.....kpkkpk.....',
      '......k..k......'
    ],
    [
      '................',
      '......k..k......',
      '.....kpkkpk.....',
      '...kkpprrppkk...',
      '.kkppppppppppkk.',
      'kppkkkppppkkkppk',
      'kpk...kppk...kpk',
      'kk.....kk.....kk'
    ]
  ];

  const wraithPal = { k: '#0a1a22', c: '#7ff0ff', C: '#3aa6c0', e: '#ffffff' };
  const wraithTop = mirror([
    '....kk',
    '...kCC',
    '..kCcc',
    '..kCke',
    '..kCcc',
    '..kCcc',
    '.kCccc',
    '.kCccc',
    'kCcccc',
    'kCccCc',
    '.kCcCc'
  ]);
  const wraith = [
    wraithTop.concat(mirror(['.kCC.C', '..kC..', '...C..', '......'])),
    wraithTop.concat(mirror(['.kC.CC', '..C..C', '.....C', '......']))
  ];

  const golemPal = { k: '#0d0e12', s: '#8b8f99', S: '#5d616c', D: '#3a3d46', o: '#ff7a1a' };
  const golemTop = mirror([
    '.....kkkk',
    '....kSsss',
    '...kSsoss',
    '...kSssss',
    '...kDSSoS',
    '.kkkkDDDD',
    'kSsskSsss',
    'kSssksSso',
    'kSssksSoo',
    'kSSkkSsss',
    'kSSk.kSss',
    'kDDk.kDSS',
    'kssk.kDDD',
    '.kk..kSSk'
  ]);
  const golem = [
    golemTop.concat(mirror(['.....kSSk', '.....kSSk', '.....kDDk', '....kSSSk', '....kkkkk', '.........'])),
    golemTop.concat(mirror(['....kSSk.', '....kSSk.', '....kDDk.', '...kSSSk.', '...kkkkk.', '.........']))
  ];

  const treantPal = { k: '#120c08', b: '#6e4a2a', B: '#3f2a18', l: '#4f9a3a', L: '#2f6a26', e: '#ffd84a' };
  const treantTop = mirror([
    '.....kkkkk',
    '...kkLllll',
    '..kLllLlll',
    '.kLlllllLl',
    '.kLLllLlll',
    'kLlLLlllll',
    'kLLkkLLLLL',
    '.kk.kkkkkk',
    '...kbbbbbb',
    '...kbBbbBb',
    '...kbbekbb',
    'kk.kbbbbbb',
    'kbkkbBbkkk',
    'kbbbbbbBbb',
    '.kkkbBbbbb',
    '...kbbbBbb',
    '...kbBbbbb',
    '...kbbbbBb'
  ]);
  const treant = [
    treantTop.concat(mirror(['...kbBbk..', '...kbbbk..', '..kbbBbbk.', '..kkkkkkk.'])),
    treantTop.concat(mirror(['..kbBbk...', '..kbbbk...', '.kbbBbbk..', '.kkkkkkk..']))
  ];

  /* ---------------- boss (symmetric, palette-swapped per tower lord) ---------------- */
  const bossRows = mirror([
    'k...........',
    'kAk.........',
    '.kAk...g...g',
    '.kAAk..gg.gg',
    '..kAAkkggggg',
    '...kAAhhhhhh',
    '...kAhAAAAAA',
    '...kAAAAAAAA',
    '...kAAkkkkkA',
    '...kAkeeekkA',
    '...kAAkkkkkA',
    '....kAAAAAAk',
    '....kkAAkAkA',
    '..kkkaakkkkk',
    '.kcAhhAkaaaa',
    'kccAhAAAkaAh',
    'kccAAAAAkaAA',
    'kcckAAAkaaaA',
    'kcc.kkkkaaAA',
    'kcc.kAkkaagg',
    'kcc.kAkkaaaa',
    'kccckhkkaaAA',
    'kccc.kkkaaAA',
    'kccc..kaaaAk',
    '.kcc..kaaAAk',
    '.kcc..kaaAk.',
    '..kc..kAAAk.',
    '..kk.kkkkkk.'
  ]);
  const bossPalettes = [
    { a: '#2a1f3d', A: '#4a3a6a', h: '#8a7ab0', e: '#ff2d55', c: '#6b0f1a' },
    { a: '#163230', A: '#2f5f58', h: '#7ab0a6', e: '#7dff6a', c: '#2a1a4a' },
    { a: '#2e2a28', A: '#5a524c', h: '#a8a096', e: '#ffb347', c: '#4a1e0a' },
    { a: '#1d2638', A: '#3a4a6a', h: '#8aa0c8', e: '#59f3ff', c: '#10141f' },
    { a: '#3d3a4a', A: '#8a86a0', h: '#e6e2f0', e: '#ff4fd8', c: '#3a0a3a' },
    { a: '#3a2410', A: '#6a4a20', h: '#c89a4a', e: '#ff3b3b', c: '#1a0a0a' }
  ];

  /* ---------------- princesses (front-facing, built per rescue from a look) ---------------- */
  // Left halves, mirrored. h/H hair, s/S skin, e eyes, b blush, m mouth, d/D/l dress, j jewel.
  const princessBody = [
    '..kdlddd',
    '.kddlddd',
    'kdddlddd',
    'kDddlddd',
    'kDDddddd',
    'kwwwwwww',
    '.kkkkkkk'
  ];
  const princessStyles = {
    long: [
      '.......g',
      '....g..g',
      '....gggj',
      '...kGGGG',
      '..khhhhh',
      '.khhhhHh',
      '.khhHsss',
      '.khhsess',
      '.khhsess',
      '.khhsbss',
      '.khhsssm',
      '.khhhSss',
      'khhhhkSs',
      'khhhddww',
      'khhldddj',
      'khhldddd',
      'khHdlddd',
      'khHdlgss',
      '.kHkdddd'
    ],
    curly: [
      '...hh..g',
      '..hhhh.g',
      '.khhgggj',
      'khhhkGGG',
      'khHhhhhh',
      'khhhhHhh',
      'kHhhHsss',
      'khhhsess',
      'khHhsess',
      'khhhsbss',
      'kHhhsssm',
      '.khhhSss',
      '..kHhkSs',
      '...kddww',
      '..kldddj',
      '..kldddd',
      '..kdlddd',
      '..kdlgss',
      '...kdddd'
    ],
    braids: [
      '.......g',
      '....g..g',
      '....gggj',
      '...kGGGG',
      '..khhhhh',
      '..khhHhh',
      '..khHsss',
      '..khsess',
      '..khsess',
      '..khsbss',
      '..khsssm',
      '..khhSss',
      '..khkkSs',
      '..khddww',
      '.klhdddj',
      '.klHdddd',
      '.kdhlddd',
      '.kdHlgss',
      '..kjdddd'
    ]
  };
  const princessLooks = {
    styles: Object.keys(princessStyles),
    hair: [
      { h: '#f2cf6a', H: '#c4952e' }, // golden blonde
      { h: '#f4ecd8', H: '#c9bda0' }, // platinum
      { h: '#3a2f45', H: '#221a2c' }, // black
      { h: '#4a3224', H: '#2c1c12' }, // dark brown
      { h: '#7a4a2a', H: '#4a2a16' }, // chestnut
      { h: '#d8572a', H: '#9a3016' }  // red
    ],
    skin: [
      { s: '#ffe2cc', S: '#e8b496', b: '#f59aa6', m: '#c84a5e' },
      { s: '#f3c9a2', S: '#d29b72', b: '#ec8a8a', m: '#b8485a' },
      { s: '#d9a074', S: '#b07650', b: '#d8706a', m: '#9a3a48' },
      { s: '#b97a4c', S: '#8e5632', b: '#c8605a', m: '#7e2e3a' },
      { s: '#8d5a36', S: '#653c20', b: '#a84a48', m: '#5e1e2a' },
      { s: '#6a4228', S: '#4a2c18', b: '#94403e', m: '#3e1218' }
    ],
    dress: [
      { d: '#e86aa0', D: '#a83a6e', l: '#ffb0d0', j: '#59f3ff' }, // rose
      { d: '#5aa8e8', D: '#2e6aa8', l: '#bfe2ff', j: '#e0344e' }, // sky
      { d: '#3fb06a', D: '#1f7040', l: '#a8f0c0', j: '#e0344e' }, // emerald
      { d: '#9a5ae0', D: '#5e2ea0', l: '#d6b8ff', j: '#ffcf5a' }, // violet
      { d: '#d83a4a', D: '#8e1c2a', l: '#ff9aa4', j: '#59f3ff' }, // crimson
      { d: '#f0b83a', D: '#b07a1a', l: '#fff0b0', j: '#e0344e' }, // gold
      { d: '#2ab8b0', D: '#167a74', l: '#a8fff4', j: '#ff4fd8' }, // teal
      { d: '#efe6d8', D: '#bfae96', l: '#ffffff', j: '#5aa8e8' }, // ivory
      { d: '#f07a4a', D: '#b04a26', l: '#ffc0a0', j: '#3fb06a' }  // coral
    ]
  };
  function princess(look) {
    const rows = mirror(princessStyles[look.style].concat(princessBody));
    const pal = Object.assign({ k: '#140c18', g: '#f2c14e', G: '#b07a1a', e: '#160c16', w: '#fff6e8' },
      princessLooks.hair[look.hair], princessLooks.skin[look.skin], princessLooks.dress[look.dress]);
    return variants(raster(rows, pal));
  }

  /* ---------------- coin (spin frames) ---------------- */
  const coinPal = { g: '#b07a1a', G: '#ffcf5a', w: '#fff6c8' };
  const coin = [
    ['.ggg.', 'gGwGg', 'gGGGg', 'gGGGg', '.ggg.'],
    ['..g..', '.gGg.', '.gwg.', '.gGg.', '..g..'],
    ['..g..', '..G..', '..w..', '..G..', '..g..']
  ];

  /* ---------------- 8x8 upgrade icons ---------------- */
  const icons = {
    greed: [{ a: '#ffcf5a', b: '#b07a1a', w: '#fff6c8', k: K }, ['..kkkk..', '.kaaaak.', 'kaawwabk', 'kaawabbk', 'kaawabbk', 'kaaaabbk', '.kabbbk.', '..kkkk..']],
    magnet: [{ a: '#e0344e', w: '#dfe6f0' }, ['ww....ww', 'ww....ww', 'aa....aa', 'aa....aa', 'aa....aa', 'aaa..aaa', '.aaaaaa.', '..aaaa..']],
    scholar: [{ a: '#4b6bd6', b: '#ffcf5a', w: '#f0ead8', k: K }, ['.kkkkkk.', 'kwaaaaak', 'kwabbbak', 'kwaaaaak', 'kwabbbak', 'kwaaaaak', 'kwwwwwwk', '.kkkkkk.']],
    frost: [{ a: '#9be7ff', w: '#ffffff' }, ['...a....', '.a.a.a..', '..aaa...', 'aaawaaa.', '..aaa...', '.a.a.a..', '...a....', '........']],
    warcry: [{ a: '#e8d3a0', b: '#9a7a4a', w: '#ffffff', k: K }, ['......kk', '.....kak', '....kaak', 'kk.kaabk', 'kwkaabk.', 'kwaabk..', '.kbbk...', '..kk....']],
    blade: [{ w: '#eef4ff', g: '#f2c14e', k: K }, ['......kw', '.....kwk', '....kwk.', '...kwk..', 'k.kwk...', 'kgkk....', '.kgk....', 'kk.k....']],
    siphon: [{ a: '#8a4fd0', b: '#c79bff', w: '#ffffff' }, ['...a....', '..aa..a.', '.aaba.a.', '.abwbaa.', 'aabwwba.', 'abwwwba.', '.abbba..', '..aaa...']],
    regen: [{ a: '#5fd35a', b: '#2f8a2c', w: '#d8ffd0' }, ['...a....', '...a....', '..aaa...', '.aawaa..', '.awaaa..', '.aaaab..', '..abb...', '........']],
    heart: [{ a: '#e0344e', w: '#ffd0d8', k: K }, ['.kk.kk..', 'kaakaak.', 'kawaaak.', 'kaaaaak.', '.kaaak..', '..kak...', '...k....', '........']],
    steady: [{ a: '#59f3ff', w: '#ffffff', k: '#2a6a7a' }, ['..kkkk..', '.k.aa.k.', 'k..aa..k', 'kaawwaak', 'kaawwaak', 'k..aa..k', '.k.aa.k.', '..kkkk..']],
    repel: [{ a: '#59f3ff', b: '#2a8aa0', w: '#ffffff' }, ['..aaaa..', '.a....a.', 'a..bb..a', 'a.bwwb.a', 'a.bwwb.a', 'a..bb..a', '.a....a.', '..aaaa..']],
    volatile: [{ a: '#ff7a1a', b: '#ffcf5a', w: '#ffffff' }, ['a..a..a.', '.a.a.a..', '..bwb...', 'aabwwbaa', '..bwb...', '.a.a.a..', 'a..a..a.', '........']],
    chain: [{ a: '#9be7ff', w: '#ffffff' }, ['....aww.', '...aaw..', '..aaa...', '.aaaaaa.', '....aa..', '...aa...', '..aa....', '.a......']],
    aegis: [{ a: '#ffcf5a', b: '#b07a1a', w: '#fff6c8', k: K }, ['kkkkkkkk', 'kaaaabbk', 'kaawabbk', 'kaawabbk', 'kaaaabbk', '.kaaabk.', '..kabk..', '...kk...']],
    executioner: [{ a: '#9aa4b8', w: '#eef4ff', g: '#8a5a2a', k: K }, ['..kkk...', '.kwaak..', 'kwaaakk.', 'kwaaakgk', '.kwaakgk', '..kkkgk.', '.....gk.', '.....gk.']],
    bounty: [{ a: '#ffcf5a', b: '#7a4a24', w: '#fff6c8', g: '#b07a1a', k: K }, ['.kkkkkk.', 'kbbbbbbk', 'kbaaaabk', 'kkkkkkkk', 'kbbwwbbk', 'kbbggbbk', 'kbbbbbbk', 'kkkkkkkk']],
    mend: [{ a: '#e0344e', w: '#f0ead8', k: K }, ['..kkkk..', '..kwwk..', 'kkkwwkkk', 'kwwaawwk', 'kwwaawwk', 'kkkwwkkk', '..kwwk..', '..kkkk..']],
    potion: [{ a: '#e0344e', w: '#ffd0d8', k: K, g: '#9aa4b8' }, ['..kkk...', '...g....', '..kgk...', '.kaaak..', 'kaawaak.', 'kaaaaak.', '.kaaak..', '..kkk...']],
    lucky: [{ a: '#5fd35a', b: '#2f8a2c', w: '#d8ffd0' }, ['.aa.aa..', 'awaawaa.', 'aaaaaaa.', '.aaaaa..', 'aaaaaaa.', 'awaaaaa.', '.aa.aa..', '...b....']],
    haggler: [{ a: '#ffcf5a', b: '#b07a1a', w: '#fff6c8', k: K }, ['....kkk.', '...kaaak', '..kaawak', '.kaaaak.', 'kaaaak..', 'kbaak...', '.kbk....', '..k.....']],
    glacial: [{ a: '#9be7ff', b: '#3aa6c0', w: '#ffffff' }, ['bbbbbbbb', 'bwwaaaab', 'bwaaaaab', 'baaawaab', 'baaaaaab', 'baawaaab', 'baaaaaab', 'bbbbbbbb']],
    scavenger: [{ a: '#7a4a24', b: '#4a2a10', g: '#ffcf5a', k: K }, ['..kggk..', '...kk...', '..kaak..', '.kaaaak.', 'kaagaaak', 'kaaaaabk', 'kaaaabbk', '.kkkkkk.']],
    flow: [{ a: '#59f3ff', b: '#2a8aa0' }, ['........', '.aa...aa', 'a..a.a..', '....a...', '.bb...bb', 'b..b.b..', '....b...', '........']],
    keen: [{ k: K, w: '#ffffff', b: '#59f3ff' }, ['........', '..kkkk..', '.kwwwwk.', 'kwwbbwwk', 'kwwbkwwk', '.kwwwwk.', '..kkkk..', '........']],
    treasurer: [{ a: '#ffcf5a', b: '#b07a1a', k: K }, ['..kkkk..', '.kaaaak.', '.kbbbbk.', '.kaaaak.', '.kbbbbk.', '.kaaaak.', '.kbbbbk.', '..kkkk..']],
    trophy: [{ a: '#ffcf5a', b: '#b07a1a', w: '#fff6c8', k: K }, ['kkkkkkkk', 'kawaaabk', '.kwaabk.', '..kaak..', '...kk...', '...bb...', '..kbbk..', '.kkkkkk.']],
    piercing: [{ a: '#dfe6f0', b: '#9aa4b8', r: '#e0344e' }, ['......aa', '.....aaa', '....aaa.', '...aaa..', '..bbb...', 'r.bb....', 'rr......', 'rrr.....']],
    bloodthirst: [{ a: '#e0344e', b: '#8e1c32', w: '#ffffff' }, ['ww....ww', 'ww....ww', '.w....w.', '.w....w.', '....a...', '...aaa..', '...aba..', '....a...']],
    momentum: [{ a: '#59f3ff', b: '#2a8aa0' }, ['a...a...', 'aa..aa..', '.aa..aa.', '..aa..aa', '..bb..bb', '.bb..bb.', 'bb..bb..', 'b...b...']],
    giantslayer: [{ a: '#9aa4b8', w: '#eef4ff', g: '#8a5a2a', k: K }, ['kkkkkkk.', 'kwwaaak.', 'kaaaaak.', 'kkkgkkk.', '...g....', '...g....', '...g....', '...g....']],
    berserker: [{ a: '#e0344e', k: K, w: '#ffffff' }, ['.aaaaaa.', 'aaaaaaaa', 'akkaakka', 'aawaawaa', 'aaaaaaaa', 'aakkkkaa', 'aakwwkaa', '.aaaaaa.']],
    spiked: [{ a: '#9aa4b8', w: '#eef4ff', k: K }, ['w..w..w.', 'kkkkkkk.', 'kaaaaak.', 'wkawaakw', 'kaaaaak.', '.kaaak..', 'w.kak.w.', '...k....']],
    precision: [{ a: '#e0344e', w: '#ffffff' }, ['...a....', '...a....', '..aaa...', 'aaawaaa.', '..aaa...', '...a....', '...a....', '........']],
    lordsbane: [{ a: '#d4a53c', b: '#7a5a1a', r: '#e0344e' }, ['a..a..a.', 'aa.a.aa.', 'aaaaaaa.', 'aaraaaa.', 'aaarraa.', 'bbbbbbb.', '....r...', '.....r..']],
    timewarp: [{ a: '#c9b27a', b: '#ffcf5a', k: K }, ['kkkkkkk.', '.kbbbk..', '..kbk...', '...k....', '..kak...', '.kabak..', 'kkkkkkk.', '........']],
    storm: [{ a: '#9aa4b8', w: '#dfe6f0', y: '#ffdd33' }, ['..www...', '.waaaww.', 'waaaaaaw', '.aaaaaa.', '...yy...', '..yy....', '...yy...', '..y.....']],
    guardian: [{ a: '#fff6c8', b: '#ffcf5a', w: '#ffffff' }, ['..bbbb..', '.b....b.', '..bbbb..', 'w..aa..w', 'ww.aa.ww', 'wwwaawww', '.ww..ww.', '........']],
    glass: [{ a: '#bffaff', b: '#59f3ff', k: K }, ['..kkkk..', '.kaabak.', 'kaabaaak', 'kabaaabk', '.kaaabk.', '..kabk..', '...kk...', '........']],
    bloodpact: [{ a: '#e0344e', w: '#eef4ff', g: '#d4a53c' }, ['......w.', '.....w..', '....w...', '.g.w....', '..g.....', '.g.g....', 'a.......', 'aa......']],
    echo: [{ a: '#ff4fd8', w: '#ffffff' }, ['.....w.a', '....w.a.', '...w.a..', '..w.a...', '.w.a....', 'w.a.....', '.a......', '........']],
    bastion: [{ a: '#59f3ff', w: '#ffffff' }, ['..a..a..', '.a....a.', 'a..ww..a', 'a.wwww.a', 'a.wwww.a', 'a..ww..a', '.a....a.', '..a..a..']],
    reach: [{ a: '#59f3ff', w: '#ffffff' }, ['........', 'a......a', 'aa....aa', 'awwwwwwa', 'aa....aa', 'a......a', '........', '........']],
    smite: [{ y: '#ffcf5a', w: '#ffffff' }, ['...ww...', '...yy...', '...yy...', '..yyyy..', '...yy...', '..y..y..', '.y....y.', 'yyyyyyyy']],
    laststand: [{ a: '#e0344e', b: '#8e1c32', k: '#9aa4b8' }, ['kaaaaa..', 'kaabaa..', 'kabbba..', 'kaabaa..', 'kaaaaa..', 'k.......', 'k.......', 'k.......']],
    secondwind: [{ a: '#bfe6ff', b: '#59f3ff' }, ['........', 'aaaaaa..', '......a.', '.bbbbb..', '........', '..aaaaaa', '.a......', '..bbbb..']],
    snare: [{ a: '#9aa4b8', b: '#5d616c', w: '#eef4ff' }, ['w.w..w.w', 'aaa..aaa', '.a....a.', '.a....a.', '.aaaaaa.', '..bbbb..', '.b....b.', '........']],
    crown: [{ a: '#ffcf5a', b: '#b07a1a', r: '#e0344e', w: '#fff6c8' }, ['........', 'a..aa..a', 'aa.aa.aa', 'aaaaaaaa', 'arawwara', 'aaaaaaaa', 'bbbbbbbb', '........']],
    phoenix: [{ a: '#ff7a1a', b: '#ffcf5a', w: '#ffffff' }, ['a......a', 'aa....aa', '.aa..aa.', '..abba..', '..bwwb..', '...bb...', '..b..b..', '.b....b.']],
    starblade: [{ w: '#eef4ff', g: '#f2c14e', y: '#fff6c8', k: K }, ['y.....kw', '.....kwk', '....kwk.', 'y..kwk..', '.kkwk..y', '.kgk....', 'kgk.y...', 'kk......']],
    aura: [{ a: '#ffcf5a', w: '#fff6c8' }, ['.aaaaaa.', 'a......a', '.aaaaaa.', '...ww...', '..wwww..', '..wwww..', '.wwwwww.', '.wwwwww.']],
    tempest: [{ p: '#7a3ab0', w: '#c79bff', y: '#ffdd33' }, ['.pppppp.', 'pppwwppp', '.pppppp.', '...yy...', '..yy....', '.yyyyy..', '....yy..', '...y....']],
    favor: [{ r: '#e0344e', R: '#8e1c32', g: '#5fae3e' }, ['..rr....', '.rRrr...', '.rrRr...', '..rr....', '...g.g..', '...gg...', '...g....', '...g....']],
    rift: [{ m: '#ff4fd8', w: '#ffffff', c: '#59f3ff' }, ['......mw', '.....mwc', '....mwc.', '...mwc..', '..mwc...', '.mwc....', 'mwc.....', 'wc......']],
    treasury: [{ a: '#ffcf5a', b: '#7a4a24', w: '#fff6c8', k: K }, ['.a.a.a..', '.aaaaa..', 'kkkkkkkk', 'kbaaaabk', 'kkkkkkkk', 'kbbwwbbk', 'kbbbbbbk', 'kkkkkkkk']]
  };

  function build() {
    const iconUrls = {};
    for (const [id, [pal, rows]] of Object.entries(icons)) iconUrls[id] = raster(rows, pal).toDataURL();
    return {
      knight: [variants(raster(knight, knightPal))],
      skeleton: skeleton.map(f => variants(raster(f, skelPal))),
      goblin: goblin.map(f => variants(raster(f, gobPal))),
      bat: bat.map(f => variants(raster(f, batPal))),
      wraith: wraith.map(f => variants(raster(f, wraithPal))),
      golem: golem.map(f => variants(raster(f, golemPal))),
      treant: treant.map(f => variants(raster(f, treantPal))),
      bosses: bossPalettes.map(p => variants(raster(bossRows, Object.assign({ k: '#07050c', g: '#d4a53c' }, p)))),
      bossEyes: bossPalettes.map(p => p.e),
      coin: coin.map(f => raster(f, coinPal)),
      icons: iconUrls
    };
  }

  return { build, princess, princessLooks };
})();
