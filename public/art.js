// Vektor-Grafiken: Geländefelder, Figuren, Häfen. Alles reines SVG, keine Bilddateien.
window.ArchipelArt = (() => {
  'use strict';

  // Deterministischer Zufall, damit jedes Feld gleich aussieht, egal wann es gezeichnet wird
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function hexPts(r) {
    const p = [];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (-90 + 60 * i); p.push((r * Math.cos(a)).toFixed(1) + ',' + (r * Math.sin(a)).toFixed(1)); }
    return p.join(' ');
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, f = Math.abs(amt);
    r = Math.round(r + (t - r) * f); g = Math.round(g + (t - g) * f); b = Math.round(b + (t - b) * f);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  // Positionen rund um die Mitte (Mitte bleibt frei für den Zahlen-Chip)
  const RING = [[-52, -50], [0, -70], [52, -50], [-74, -4], [74, -4], [-50, 46], [0, 70], [50, 46], [-28, -30], [28, -30]];

  function tree(x, y, s, dark) {
    return `<g transform="translate(${x},${y}) scale(${s})">
      <ellipse cx="3" cy="13" rx="11" ry="3.5" fill="rgba(0,0,0,.25)"/>
      <rect x="-2.5" y="5" width="5" height="9" rx="1" fill="#6b4a2b"/>
      <polygon points="0,-24 -13,-4 13,-4" fill="${dark ? '#1d5a2c' : '#22652f'}"/>
      <polygon points="0,-16 -15,8 15,8" fill="${dark ? '#2a7a3a' : '#2f8a42'}"/>
      <polygon points="0,-16 -15,8 0,8" fill="rgba(255,255,255,.08)"/>
      <polygon points="0,-24 -13,-4 0,-4" fill="rgba(255,255,255,.1)"/></g>`;
  }
  function sheep(x, y, s, flip) {
    return `<g transform="translate(${x},${y}) scale(${flip ? -s : s},${s})">
      <ellipse cx="0" cy="9" rx="11" ry="3" fill="rgba(0,0,0,.2)"/>
      <line x1="-5" y1="3" x2="-5" y2="9" stroke="#333" stroke-width="2"/><line x1="5" y1="3" x2="5" y2="9" stroke="#333" stroke-width="2"/>
      <circle cx="-5" cy="-1" r="5.5" fill="#fbfbf7"/><circle cx="1" cy="-3" r="6" fill="#ffffff"/><circle cx="6" cy="0" r="5" fill="#f3f3ee"/>
      <circle cx="0" cy="2" r="5.5" fill="#f7f7f2"/>
      <ellipse cx="11" cy="-2" rx="3.6" ry="3" fill="#2b2b2b"/></g>`;
  }
  function peak(x, y, s) {
    return `<g transform="translate(${x},${y}) scale(${s})">
      <ellipse cx="2" cy="2" rx="30" ry="5" fill="rgba(0,0,0,.2)"/>
      <polygon points="0,-40 -30,0 30,0" fill="#7d8b98"/>
      <polygon points="0,-40 -30,0 0,0" fill="#a7b3bf"/>
      <polygon points="0,-40 -10,-26 -4,-28 0,-22 5,-28 10,-26" fill="#ffffff"/>
      <polygon points="0,-40 -10,-26 -4,-28 0,-22" fill="#e6eef5"/></g>`;
  }
  function bricks(x, y, s) {
    let out = `<g transform="translate(${x},${y}) scale(${s})"><ellipse cx="0" cy="9" rx="16" ry="3.5" fill="rgba(0,0,0,.25)"/>`;
    const rows = [[-14, 0, 3], [-9, -6, 2], [-4, -12, 1]];
    for (const [x0, y0, n] of rows) for (let i = 0; i < n; i++) {
      out += `<rect x="${x0 + i * 10}" y="${y0}" width="9" height="5.5" rx="1" fill="#b4472a" stroke="#f1c7a8" stroke-width="1"/>`;
    }
    return out + '</g>';
  }
  function wheat(x, y, s) {
    let out = `<g transform="translate(${x},${y}) scale(${s})">`;
    for (const dx of [-5, 0, 5]) {
      out += `<line x1="${dx * 0.4}" y1="10" x2="${dx}" y2="-8" stroke="#a87512" stroke-width="1.6"/>
        <ellipse cx="${dx}" cy="-11" rx="2.6" ry="5.5" fill="#f9d05a" stroke="#a87512" stroke-width=".8"/>`;
    }
    return out + '<rect x="-5" y="1" width="10" height="2.5" fill="#8a5a12"/></g>';
  }
  function cactus(x, y, s) {
    return `<g transform="translate(${x},${y}) scale(${s})">
      <ellipse cx="2" cy="14" rx="12" ry="3" fill="rgba(0,0,0,.2)"/>
      <rect x="-4" y="-18" width="8" height="32" rx="4" fill="#3f8f4a"/>
      <path d="M-4,-2 h-6 a3,3 0 0 1 -3,-3 v-8 a3,3 0 0 1 6,0 v5 h3" fill="#3f8f4a"/>
      <path d="M4,2 h6 a3,3 0 0 0 3,-3 v-10 a3,3 0 0 0 -6,0 v7 h-3" fill="#3f8f4a"/>
      <rect x="-2" y="-16" width="2" height="28" rx="1" fill="rgba(255,255,255,.18)"/></g>`;
  }
  function nugget(x, y, s) {
    return `<g transform="translate(${x},${y}) scale(${s})">
      <ellipse cx="1" cy="5" rx="9" ry="2.5" fill="rgba(0,0,0,.25)"/>
      <path d="M-8,3 L-5,-5 L2,-8 L8,-3 L7,4 L-2,6 Z" fill="#f7c331" stroke="#a87512" stroke-width="1"/>
      <path d="M-5,-5 L2,-8 L1,-2 L-4,0 Z" fill="#ffe58a"/></g>`;
  }

  function terrainSymbols() {
    const R = 100;
    const base = (id, a, b) => `<radialGradient id="tg-${id}" cx="40%" cy="30%" r="80%"><stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/></radialGradient>`;
    let defs = `<clipPath id="hexclip"><polygon points="${hexPts(R)}"/></clipPath>`;
    defs += base('forest', '#5fae55', '#2c6a2f') + base('pasture', '#b6e27a', '#6daa3c') + base('fields', '#f6dc77', '#d39e2a')
      + base('hills', '#e59a68', '#a24b26') + base('mountains', '#a9b5c1', '#5f6d7a') + base('gold', '#86c56b', '#4c8a3f')
      + base('desert', '#f4e2ad', '#d2b06a') + base('sea', '#3f97d6', '#1b5f9c');
    const sym = (id, inner) => `<symbol id="t-${id}" viewBox="-100 -100 200 200" overflow="visible"><g clip-path="url(#hexclip)">
      <rect x="-110" y="-110" width="220" height="220" fill="url(#tg-${id})"/>${inner}</g></symbol>`;
    const r = rng(7);
    // Wald
    let f = '';
    for (let i = 0; i < 26; i++) f += `<circle cx="${(r() - .5) * 180}" cy="${(r() - .5) * 180}" r="${2 + r() * 4}" fill="rgba(0,40,0,.18)"/>`;
    [[-52, -48], [-20, -68], [20, -66], [54, -44], [-80, -8], [78, -10], [-58, 40], [-24, 66], [22, 68], [58, 42], [-44, -6], [44, 0], [-6, -40], [0, 80], [-82, 30], [84, 30]]
      .forEach(([x, y], i) => { f += tree(x, y, 0.95 + (i % 3) * 0.15, i % 2); });
    // Weide
    let p = '';
    for (let i = 0; i < 40; i++) { const x = (r() - .5) * 180, y = (r() - .5) * 180; p += `<path d="M${x},${y} l-2,-6 M${x},${y} l2,-7 M${x},${y} l4,-5" stroke="rgba(40,90,20,.45)" stroke-width="1.5"/>`; }
    p += '<path d="M-90,60 Q-40,50 0,62 T90,55" fill="none" stroke="rgba(120,80,40,.5)" stroke-width="3" stroke-dasharray="2 8"/>';
    [[-50, -44, 1.2], [38, -54, 1.1], [64, 6, 1.15], [-66, 12, 1.1], [-26, 52, 1.2], [34, 46, 1.1]].forEach(([x, y, s], i) => { p += sheep(x, y, s, i % 2); });
    // Acker
    let w = '';
    for (let i = -14; i < 14; i++) w += `<line x1="${i * 15 - 120}" y1="-120" x2="${i * 15 + 60}" y2="120" stroke="${i % 2 ? 'rgba(180,120,20,.35)' : 'rgba(255,240,170,.35)'}" stroke-width="8"/>`;
    [[-50, -46], [44, -50], [-70, 10], [70, 8], [-36, 54], [38, 56], [0, -72]].forEach(([x, y]) => { w += wheat(x, y, 1.25); });
    // Hügel
    let h = '';
    [[-60, -50, 50], [55, -55, 44], [-70, 40, 46], [65, 45, 50], [0, 80, 40], [0, -85, 40]].forEach(([x, y, rr]) => {
      h += `<ellipse cx="${x}" cy="${y}" rx="${rr}" ry="${rr * 0.55}" fill="rgba(120,45,15,.35)"/><ellipse cx="${x - 6}" cy="${y - 5}" rx="${rr * 0.7}" ry="${rr * 0.35}" fill="rgba(255,190,140,.18)"/>`;
    });
    [[-48, -38], [48, -42], [-58, 38], [56, 40], [0, 66]].forEach(([x, y]) => { h += bricks(x, y, 1.3); });
    // Gebirge
    let m = '';
    [[-50, -26, 1.1], [8, -44, 1.3], [60, -20, 1.05], [-70, 50, 1], [62, 62, 1.1], [-14, 88, 1], [-90, 0, .8], [92, 18, .8]].forEach(([x, y, s]) => { m += peak(x, y, s); });
    // Goldfluss
    let g = '<path d="M-110,-40 C-50,-70 -30,10 10,0 S60,60 110,40" fill="none" stroke="#2f7fc0" stroke-width="30"/>'
      + '<path d="M-110,-40 C-50,-70 -30,10 10,0 S60,60 110,40" fill="none" stroke="#5fb3ee" stroke-width="14" opacity=".8"/>'
      + '<path d="M-110,-40 C-50,-70 -30,10 10,0 S60,60 110,40" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="6 12" opacity=".7"/>';
    [[-60, -22], [-44, -66], [40, 20], [58, 70], [-10, 30], [20, -30], [70, 10], [-70, 30]].forEach(([x, y], i) => { g += nugget(x, y, 1.1 + (i % 2) * .3); });
    for (let i = 0; i < 10; i++) { const x = (r() - .5) * 150, y = (r() - .5) * 150; g += `<path d="M${x},${y - 5} L${x + 1.5},${y - 1.5} L${x + 5},${y} L${x + 1.5},${y + 1.5} L${x},${y + 5} L${x - 1.5},${y + 1.5} L${x - 5},${y} L${x - 1.5},${y - 1.5} Z" fill="#fff8d0"/>`; }
    // Wüste
    let d = '';
    [[-60, -40], [40, -60], [-30, 50], [60, 30], [0, 0]].forEach(([x, y]) => {
      d += `<path d="M${x - 50},${y + 10} Q${x},${y - 25} ${x + 50},${y + 10}" fill="rgba(255,250,220,.4)"/><path d="M${x - 50},${y + 10} Q${x},${y - 25} ${x + 50},${y + 10}" fill="none" stroke="rgba(170,120,50,.35)" stroke-width="2"/>`;
    });
    d += cactus(-46, -10, 1.7) + cactus(50, 40, 1.4) + cactus(20, -52, 1.1);
    d += '<ellipse cx="-30" cy="55" rx="8" ry="5" fill="#b9a07a"/><ellipse cx="-20" cy="58" rx="5" ry="3.5" fill="#a88f68"/>';
    // Meer
    let s = '';
    for (let i = 0; i < 9; i++) { const x = (r() - .5) * 150, y = (r() - .5) * 160; s += `<path d="M${x - 14},${y} q7,-6 14,0 t14,0" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="2.5" stroke-linecap="round"/>`; }
    return defs + sym('forest', f) + sym('pasture', p) + sym('fields', w) + sym('hills', h) + sym('mountains', m) + sym('gold', g) + sym('desert', d) + sym('sea', s);
  }

  // ---------- Figuren (Ursprung = Mittelpunkt) ----------
  // Kleines 3D-Haus (Front mit Giebel, Seitenwand, Dachfläche). w = Breite, h = Wandhöhe, r = Giebelhöhe
  function house(x, y, w, h, r, c, d, l, k, sw) {
    const x0 = x - w / 2, x1 = x + w / 2, dx = w * 0.45, dy = -w * 0.3;
    return `<polygon points="${x1},${y - h} ${x1 + dx},${y - h + dy} ${x1 + dx},${y + dy} ${x1},${y}" fill="${d}" stroke="${k}" stroke-width="${sw}" stroke-linejoin="round"/>
      <polygon points="${x},${y - h - r} ${x + dx},${y - h - r + dy} ${x1 + dx},${y - h + dy} ${x1},${y - h}" fill="${l}" stroke="${k}" stroke-width="${sw}" stroke-linejoin="round"/>
      <polygon points="${x0},${y} ${x0},${y - h} ${x},${y - h - r} ${x1},${y - h} ${x1},${y}" fill="${c}" stroke="${k}" stroke-width="${sw}" stroke-linejoin="round"/>
      <rect x="${x - w * 0.14}" y="${y - h * 0.55}" width="${w * 0.28}" height="${h * 0.55}" fill="rgba(0,0,0,.4)"/>`;
  }
  // Siedlung: mehrere kleine Häuser auf einem runden Sockel
  function settlement(color) {
    const c = color, d = shade(color, -0.35), l = shade(color, 0.25), b = shade(color, -0.2), k = '#141414';
    return `<ellipse cx="2" cy="12" rx="19" ry="6" fill="rgba(0,0,0,.4)"/>
      <ellipse cx="0" cy="9" rx="18" ry="6.5" fill="${b}" stroke="${k}" stroke-width="1.3"/>
      <ellipse cx="0" cy="7.5" rx="17" ry="5.5" fill="${shade(color, 0.1)}"/>
      ${house(-5, 3, 9, 7, 5, c, d, l, k, 1.2)}
      ${house(7, 2, 8, 6, 4.5, c, d, l, k, 1.2)}
      ${house(-9, 10, 9, 7, 5, c, d, l, k, 1.2)}
      ${house(3, 11, 10, 8, 5.5, c, d, l, k, 1.2)}`;
  }
  // Stadt: großes Gebäude mit mehreren Giebeln und Turm auf Sockel
  function city(color) {
    const c = color, d = shade(color, -0.35), l = shade(color, 0.25), b = shade(color, -0.2), k = '#141414';
    const win = (x, y) => `<rect x="${x}" y="${y}" width="3" height="4" fill="rgba(0,0,0,.45)"/>`;
    let gables = '';
    const front = [[-19, -9], [-9, 1], [1, 11]]; // Giebel von links nach rechts
    for (const [xl, xr] of front) {
      const xm = (xl + xr) / 2;
      gables += `<polygon points="${xm},-12 ${xm + 7},-17 ${xr + 7},-8 ${xr},-3" fill="${l}" stroke="${k}" stroke-width="1.3" stroke-linejoin="round"/>`;
    }
    let facade = `<polygon points="-19,12 -19,-3 ${front.map(([xl, xr]) => `${xl},-3 ${(xl + xr) / 2},-12 ${xr},-3`).join(' ')} 11,12" fill="${c}" stroke="${k}" stroke-width="1.3" stroke-linejoin="round"/>`;
    for (const [xl, xr] of front) { const xm = (xl + xr) / 2; facade += win(xm - 4, 1) + win(xm + 1, 1) + win(xm - 1.5, -7); }
    return `<ellipse cx="2" cy="15" rx="26" ry="7" fill="rgba(0,0,0,.4)"/>
      <ellipse cx="0" cy="12" rx="25" ry="7.5" fill="${b}" stroke="${k}" stroke-width="1.3"/>
      <ellipse cx="0" cy="10.5" rx="24" ry="6.5" fill="${shade(color, 0.1)}"/>
      <polygon points="-10,-18 -5,-21 -5,-6 -10,-3" fill="${d}" stroke="${k}" stroke-width="1.3" stroke-linejoin="round"/>
      <rect x="-17" y="-18" width="7" height="15" fill="${c}" stroke="${k}" stroke-width="1.3"/>
      <polygon points="-17,-18 -13.5,-30 -10,-18" fill="${l}" stroke="${k}" stroke-width="1.3" stroke-linejoin="round"/>
      <polygon points="-10,-18 -13.5,-30 -5,-21" fill="${d}" stroke="${k}" stroke-width="1.3" stroke-linejoin="round"/>
      ${win(-15, -14)}
      <polygon points="11,-3 18,-8 18,7 11,12" fill="${d}" stroke="${k}" stroke-width="1.3" stroke-linejoin="round"/>
      ${gables}${facade}
      <rect x="-6.5" y="5" width="5" height="7" rx="2" fill="rgba(0,0,0,.5)"/>`;
  }
  function road(color, len) {
    const d = shade(color, -0.4), l = shade(color, 0.35), L = len, h = 9;
    return `<rect x="${-L / 2 + 2}" y="${-h / 2 + 4}" width="${L}" height="${h}" rx="3" fill="rgba(0,0,0,.4)"/>
      <rect x="${-L / 2}" y="${-h / 2 + 2.5}" width="${L}" height="${h}" rx="3" fill="${d}" stroke="#141414" stroke-width="1.3"/>
      <rect x="${-L / 2}" y="${-h / 2 - 1}" width="${L}" height="${h}" rx="3" fill="${color}" stroke="#141414" stroke-width="1.3"/>
      <rect x="${-L / 2 + 3}" y="${-h / 2 + .5}" width="${L - 6}" height="2.4" rx="1.2" fill="${l}" opacity=".85"/>`;
  }
  function ship(color) {
    const l = shade(color, 0.3), k = '#141414';
    return `<ellipse cx="0" cy="12" rx="18" ry="3.5" fill="rgba(0,0,0,.35)"/>
      <path d="M-17,2 L17,2 L12,11 L-12,11 Z" fill="#7a5432" stroke="${k}" stroke-width="1.5" stroke-linejoin="round"/>
      <rect x="-15" y="3.5" width="30" height="2.8" fill="${color}"/>
      <line x1="0" y1="3" x2="0" y2="-20" stroke="${k}" stroke-width="2"/>
      <path d="M2,-19 Q15,-9 2,0 Z" fill="${color}" stroke="${k}" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M-2,-15 Q-12,-7 -2,0 Z" fill="${l}" stroke="${k}" stroke-width="1.3" stroke-linejoin="round"/>
      <polygon points="0,-20 7,-22 0,-24" fill="${color}" stroke="${k}" stroke-width=".8"/>`;
  }
  function robber() {
    return `<ellipse cx="0" cy="15" rx="12" ry="4" fill="rgba(0,0,0,.45)"/>
      <path d="M-11,15 Q-13,-2 0,-6 Q13,-2 11,15 Z" fill="#3a3f47" stroke="#0d0f12" stroke-width="1.5"/>
      <circle cx="0" cy="-12" r="7.5" fill="#3a3f47" stroke="#0d0f12" stroke-width="1.5"/>
      <path d="M-7,10 Q-8,-1 -2,-4" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2"/>
      <circle cx="-2.5" cy="-14" r="2.2" fill="rgba(255,255,255,.3)"/>`;
  }
  function pirate() {
    return `<ellipse cx="0" cy="14" rx="22" ry="4" fill="rgba(0,0,0,.4)"/>
      <path d="M-21,3 L21,3 L15,13 L-15,13 Z" fill="#1c1c1c" stroke="#000" stroke-width="1.5"/>
      <line x1="0" y1="3" x2="0" y2="-26" stroke="#4a3520" stroke-width="2.5"/>
      <path d="M2,-25 L2,0 L19,0 Z" fill="#222"/><path d="M-2,-21 L-2,0 L-15,0 Z" fill="#2c2c2c"/>
      <circle cx="8" cy="-8" r="3.6" fill="#f2f2f2"/><rect x="6.2" y="-5.6" width="3.6" height="2.4" fill="#f2f2f2"/>
      <polygon points="0,-26 9,-24 0,-22" fill="#c62828"/>`;
  }

  // Hafen mit zwei Holzstegen und Plattform. a,b: Ecken; mid; dir: Richtung aufs Meer (alles in Pixeln)
  function harbor(a, b, mid, dir, S, label) {
    const P = { x: mid.x + dir.x * S * 0.62, y: mid.y + dir.y * S * 0.62 };
    let out = '<g pointer-events="none">';
    for (const v of [a, b]) {
      const sx = v.x + (P.x - v.x) * 0.12, sy = v.y + (P.y - v.y) * 0.12;
      const ex = P.x, ey = P.y;
      const len = Math.hypot(ex - sx, ey - sy), ang = Math.atan2(ey - sy, ex - sx) * 180 / Math.PI;
      out += `<g transform="translate(${sx},${sy}) rotate(${ang})">
        <rect x="0" y="-4" width="${len}" height="11" fill="rgba(0,0,0,.25)" rx="1"/>
        <rect x="0" y="-5.5" width="${len}" height="11" fill="#b07a43" stroke="#5a3a1c" stroke-width="1.3" rx="1"/>`;
      for (let x = 4; x < len - 2; x += 5) out += `<line x1="${x}" y1="-5.5" x2="${x}" y2="5.5" stroke="#6e4826" stroke-width="1"/>`;
      for (let x = 3; x < len; x += 12) out += `<circle cx="${x}" cy="-6.5" r="2" fill="#4a2f16"/><circle cx="${x}" cy="6.5" r="2" fill="#4a2f16"/>`;
      out += '</g>';
    }
    const r = S * 0.3;
    out += `<circle cx="${P.x}" cy="${P.y + 3}" r="${r + 4}" fill="rgba(0,0,0,.3)"/>
      <circle cx="${P.x}" cy="${P.y}" r="${r + 4}" fill="#8a5a2c" stroke="#5a3a1c" stroke-width="1.5"/>
      <circle cx="${P.x}" cy="${P.y}" r="${r}" fill="#fff6e3" stroke="#c9a46a" stroke-width="1.5"/>`;
    out += label(P.x, P.y, r);
    return out + '</g>';
  }

  return { shade, hexPts, terrainSymbols, settlement, city, road, ship, robber, pirate, harbor };
})();
