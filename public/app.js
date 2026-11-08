(() => {
  'use strict';
  const B = window.ArchipelBoard, E = window.ArchipelEngine;
  const S = 60; // Hex-Radius in SVG-Einheiten
  const SQ3 = Math.sqrt(3);
  const RES = B.RESOURCES;
  const RI = {
    wood: { de: 'Holz', icon: '🪵', color: '#2e6b30' },
    brick: { de: 'Lehm', icon: '🧱', color: '#b5532a' },
    sheep: { de: 'Wolle', icon: '🐑', color: '#7cb342' },
    wheat: { de: 'Getreide', icon: '🌾', color: '#d9a417' },
    ore: { de: 'Erz', icon: '🪨', color: '#6d7b86' },
  };
  const TI = {
    sea: { de: 'Meer', icon: '🌊', a: '#3d8bc4', b: '#245f8f' },
    forest: { de: 'Wald', icon: '🌲', a: '#4c9a4f', b: '#1f5e25' },
    hills: { de: 'Hügel (Lehm)', icon: '🧱', a: '#dd8550', b: '#9c4520' },
    pasture: { de: 'Weide', icon: '🐑', a: '#b5dd6e', b: '#6fa335' },
    fields: { de: 'Acker', icon: '🌾', a: '#f6dc6b', b: '#d4a417' },
    mountains: { de: 'Gebirge (Erz)', icon: '⛰️', a: '#b3bcc4', b: '#66737e' },
    gold: { de: 'Goldfluss', icon: '💰', a: '#ffe48a', b: '#c8941a' },
    desert: { de: 'Wüste', icon: '🌵', a: '#f1e0b0', b: '#cfb072' },
  };
  const DEV_INFO = {
    knight: { de: 'Ritter', icon: '⚔️', desc: 'Räuber oder Pirat versetzen' },
    vp: { de: 'Siegpunkt', icon: '⭐', desc: '+1 Siegpunkt (nur du siehst ihn)' },
    roadBuilding: { de: 'Straßenbau', icon: '🛤️', desc: '2 Straßen/Schiffe gratis' },
    yearOfPlenty: { de: 'Erfindung', icon: '🎁', desc: '2 Rohstoffe aus der Bank' },
    monopoly: { de: 'Monopol', icon: '💎', desc: 'Alle Karten einer Sorte' },
  };
  const BUILD_INFO = {
    road: { de: 'Straße', icon: '🛤️' }, ship: { de: 'Schiff', icon: '⛵' },
    settlement: { de: 'Siedlung', icon: '🏠' }, city: { de: 'Stadt', icon: '🏰' },
  };
  const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  const $app = document.getElementById('app');

  const st = {
    me: null, games: [], g: null, gameId: null,
    mode: null, routeType: 'road', moveFrom: null,
    ed: { tool: 'swapTiles', sel: null, terrain: 'forest', number: 6, size: null, islands: null },
    trade: { to: 'all', give: E.emptyRes(), get: E.emptyRes() },
    bank: { give: 'wood', get: 'ore' },
    discard: E.emptyRes(), gold: E.emptyRes(),
    devUI: null, yop: ['wood', 'wood'], mono: 'wood',
    rollAnimUntil: 0, lastPulse: null,
  };
  let socket = null;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const resIcons = cost => RES.filter(r => cost[r]).map(r => RI[r].icon.repeat(cost[r])).join('');

  function toast(msg, type) {
    const c = document.getElementById('toasts');
    const d = document.createElement('div');
    d.className = 'toast ' + (type || '');
    d.textContent = msg;
    c.appendChild(d);
    setTimeout(() => d.remove(), type === 'turn' ? 3000 : 3800);
  }

  async function api(path, body) {
    const r = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Fehler');
    return j;
  }

  // ---------- Verbindung ----------
  function connect() {
    if (socket) return;
    socket = io();
    socket.on('connect', () => {
      socket.emit('lobby:list');
      if (st.gameId) socket.emit('game:open', { id: st.gameId });
    });
    socket.on('connect_error', err => {
      if (err && err.message === 'unauthorized') { socket.disconnect(); socket = null; st.me = null; render(); }
    });
    socket.on('games', list => { st.games = list; if (!st.gameId) renderLobby(); });
    socket.on('state', g => { if (g.id === st.gameId) onState(g); });
    socket.on('gameMissing', id => { if (id === st.gameId) { toast('Dieses Spiel gibt es nicht (mehr).', 'error'); location.hash = ''; } });
  }

  function act(action, cb) {
    socket.emit('game:action', { id: st.gameId, action }, res => {
      if (res && res.error) { toast(res.error, 'error'); if (cb) cb(false); }
      else if (cb) cb(true);
    });
  }

  function onState(g) {
    const prev = st.g;
    if (!prev || prev.current !== g.current || prev.phase !== g.phase || prev.turn !== g.turn || prev.status !== g.status) {
      st.mode = null; st.moveFrom = null; st.devUI = null;
    }
    if (g.phase === 'discard' && (!prev || prev.phase !== 'discard')) st.discard = E.emptyRes();
    if (g.phase === 'gold' && (!prev || prev.phase !== 'gold')) st.gold = E.emptyRes();
    if (prev && g.rollCount && g.rollCount !== prev.rollCount) st.rollAnimUntil = Date.now() + 650;
    if (prev && g.status === 'playing' && g.me >= 0 && g.current === g.me && (prev.current !== g.me || prev.status !== 'playing')) {
      toast('Du bist am Zug!', 'turn');
    }
    if (prev && prev.status === 'lobby' && g.status === 'playing') toast('Das Spiel hat begonnen!', 'turn');
    st.g = g;
    render();
  }

  // ---------- Routing ----------
  function route() {
    const m = location.hash.match(/^#game\/(\d+)/);
    const id = m ? Number(m[1]) : null;
    if (id !== st.gameId) {
      st.gameId = id; st.g = null; st.mode = null; st.ed.sel = null; st.ed.size = null; st.ed.islands = null;
      if (socket && socket.connected) { if (id) socket.emit('game:open', { id }); else { socket.emit('game:close'); socket.emit('lobby:list'); } }
    }
    render();
  }
  window.addEventListener('hashchange', route);

  function render() {
    if (!st.me) return renderLogin();
    if (st.gameId) {
      if (!st.g) { $app.innerHTML = '<div class="loading">Lade Spiel …</div>'; return; }
      return renderGame();
    }
    renderLobby();
  }

  // ---------- Login ----------
  function renderLogin() {
    $app.innerHTML = `
      <div class="login-wrap">
        <form class="login panel" id="loginForm">
          <h1>⛵ Archipel</h1>
          <p class="sub">Inseln besiedeln · handeln · segeln</p>
          <label>Name<input name="name" autocomplete="username" required autofocus></label>
          <label>Passwort<input type="password" name="password" autocomplete="current-password" required></label>
          <button class="btn primary big">Einloggen</button>
          <div class="err" id="loginErr"></div>
        </form>
      </div>`;
    document.getElementById('loginForm').onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      try {
        const r = await api('/api/login', { name: f.name.value, password: f.password.value });
        st.me = r.user;
        connect();
        render();
      } catch (err) { document.getElementById('loginErr').textContent = err.message; }
    };
  }

  async function logout() {
    await api('/api/logout', {}).catch(() => {});
    if (socket) { socket.disconnect(); socket = null; }
    st.me = null; st.g = null;
    location.hash = '';
    render();
  }

  // ---------- Lobby ----------
  function renderLobby() {
    if (!st.me || st.gameId) return;
    if (!document.getElementById('gameList')) {
      $app.innerHTML = `
        <header class="topbar"><div class="brand">⛵ Archipel</div><div class="title"></div>
          <div>👤 ${esc(st.me.name)}</div><button class="btn small" id="logoutBtn">Logout</button></header>
        <main class="lobby-main">
          <section class="panel">
            <h2>Neues Spiel</h2>
            <form id="createForm">
              <label>Name der Runde<input name="name" placeholder="z. B. Sonntagsrunde" maxlength="40"></label>
              <label>Spielfeld
                <select name="size"><option value="4">Groß (für 4 Spieler)</option><option value="3">Klein (für 3 Spieler)</option></select></label>
              <label>Inseln
                <select name="islands"><option value="2">2 Inseln</option><option value="3">3 Inseln</option></select></label>
              <button class="btn primary">Spiel erstellen</button>
              <div class="muted">Die Karte kannst du danach gemeinsam mit den anderen bearbeiten.</div>
            </form>
          </section>
          <section class="panel"><h2>Spiele</h2><div id="gameList"></div></section>
        </main>`;
      document.getElementById('logoutBtn').onclick = logout;
      document.getElementById('createForm').onsubmit = e => {
        e.preventDefault();
        const f = e.target;
        socket.emit('game:create', { name: f.name.value, size: Number(f.size.value), islands: Number(f.islands.value) }, res => {
          if (res && res.error) return toast(res.error, 'error');
          location.hash = '#game/' + res.id;
        });
      };
      document.getElementById('gameList').onclick = e => {
        const b = e.target.closest('button[data-a]');
        if (!b) return;
        const id = Number(b.dataset.id);
        if (b.dataset.a === 'open') location.hash = '#game/' + id;
        if (b.dataset.a === 'join') socket.emit('game:join', { id }, res => {
          if (res && res.error) return toast(res.error, 'error');
          location.hash = '#game/' + id;
        });
        if (b.dataset.a === 'delete' && confirm('Spiel wirklich löschen?')) socket.emit('game:delete', { id }, res => {
          if (res && res.error) toast(res.error, 'error');
        });
      };
    }
    const statusDe = { lobby: 'Karte wird erstellt', playing: 'läuft', finished: 'beendet' };
    document.getElementById('gameList').innerHTML = st.games.length ? st.games.map(g => {
      const joined = g.players.some(p => p.id === st.me.id);
      return `<div class="game-item">
        <div class="info">
          <div class="name">${esc(g.name)} <span class="badge ${g.status}">${statusDe[g.status]}</span></div>
          <div class="muted">${g.players.map(p => esc(p.name)).join(', ')} · ${g.size === 3 ? 'kleines' : 'großes'} Feld · ${g.islands} Inseln
          ${g.current ? ' · am Zug: ' + esc(g.current) : ''}${g.winner ? ' · 🏆 ' + esc(g.winner) : ''}</div>
        </div>
        ${g.status === 'lobby' && !joined && g.players.length < 4 ? `<button class="btn ok small" data-a="join" data-id="${g.id}">Beitreten</button>` : ''}
        <button class="btn small" data-a="open" data-id="${g.id}">${joined ? 'Öffnen' : 'Zuschauen'}</button>
        ${g.hostId === st.me.id ? `<button class="btn danger small" data-a="delete" data-id="${g.id}">🗑</button>` : ''}
      </div>`;
    }).join('') : '<div class="muted">Noch keine Spiele. Erstelle links eins!</div>';
  }

  // ---------- Spielansicht ----------
  function renderGame() {
    if (!document.getElementById('board')) {
      $app.innerHTML = `
        <header class="topbar"><a href="#" class="btn small">← Lobby</a><div class="title" id="gameTitle"></div>
          <div>👤 ${esc(st.me.name)}</div></header>
        <div class="game-main">
          <div class="board-wrap"><svg id="board" xmlns="http://www.w3.org/2000/svg"></svg></div>
          <aside class="side" id="side"></aside>
        </div>`;
      document.getElementById('board').addEventListener('click', onBoardClick);
      const side = document.getElementById('side');
      side.addEventListener('click', onSideClick);
      side.addEventListener('change', onSideChange);
    }
    document.getElementById('gameTitle').textContent = st.g.name;
    drawBoard();
    renderSide();
  }

  // ---------- Spielbrett (SVG) ----------
  const hexPx = (q, r) => ({ x: SQ3 * (q + r / 2) * S, y: 1.5 * r * S });
  function vPx(vk) { const p = B.vertexPos(vk); return { x: p.x * S, y: p.y * S }; }
  function hexPoints(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (-90 + 60 * i);
      pts.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1));
    }
    return pts.join(' ');
  }

  function svgDefs() {
    let d = '<defs>';
    for (const t in TI) {
      d += `<radialGradient id="g-${t}" cx="45%" cy="35%" r="75%"><stop offset="0%" stop-color="${TI[t].a}"/><stop offset="100%" stop-color="${TI[t].b}"/></radialGradient>`;
    }
    d += `<pattern id="waves" width="48" height="24" patternUnits="userSpaceOnUse">
      <rect width="48" height="24" fill="#2a6f9e"/>
      <path d="M0 12 Q12 5 24 12 T48 12" fill="none" stroke="#4f95c4" stroke-width="2" opacity=".55"/>
      <path d="M-12 24 Q0 17 12 24 T36 24" fill="none" stroke="#3f86b8" stroke-width="1.5" opacity=".4"/></pattern>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="1.5" dy="3" stdDeviation="2" flood-opacity=".45"/></filter>
      <filter id="pshadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="1" dy="2" stdDeviation="1" flood-opacity=".6"/></filter>`;
    return d + '</defs>';
  }

  function computeHot(g) {
    const hot = { v: [], e: [], h: [] };
    if (g.status !== 'playing' || g.me < 0 || g.me !== g.current) return hot;
    const p = g.me;
    if (g.phase === 'setup') {
      if (g.setup.expect === 'settlement') hot.v = E.legalSpots(g, p, 'settlement');
      else hot.e = E.legalSpots(g, p, st.routeType);
    } else if (g.phase === 'robber') {
      hot.h = Object.keys(g.map.hexes).filter(k => k !== g.map.robber && k !== g.map.pirate);
    } else if (g.phase === 'main') {
      if (BUILD_INFO[st.mode]) {
        const s = E.legalSpots(g, p, st.mode);
        if (st.mode === 'settlement' || st.mode === 'city') hot.v = s; else hot.e = s;
      } else if (st.mode === 'moveShip') {
        hot.e = st.moveFrom ? E.shipMoveTargets(g, p, st.moveFrom) : E.movableShips(g, p);
      }
    }
    return hot;
  }

  function drawBoard() {
    const g = st.g, m = g.map, G = B.buildGraph(m.radius);
    const svg = document.getElementById('board');
    const editing = g.status === 'lobby' && g.me >= 0;
    const hot = computeHot(g);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const k in m.hexes) {
      const c = hexPx(m.hexes[k].q, m.hexes[k].r);
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }
    const pad = S * 1.15;
    svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`);

    let sea = '', land = '', tokens = '';
    const editAttr = k => (editing ? ` data-hex="${k}"` : '');
    for (const k in m.hexes) {
      const h = m.hexes[k], c = hexPx(h.q, h.r);
      if (h.t === 'sea') {
        sea += `<polygon class="tile${editing ? ' editable' : ''}"${editAttr(k)} points="${hexPoints(c.x, c.y, S * 1.01)}" fill="url(#waves)"/>`;
        continue;
      }
      land += `<g class="tile${editing ? ' editable' : ''}"${editAttr(k)}>
        <polygon points="${hexPoints(c.x, c.y, S * 0.97)}" fill="#e9d6a0" filter="url(#shadow)"/>
        <polygon points="${hexPoints(c.x, c.y, S * 0.88)}" fill="url(#g-${h.t})" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>`;
      const ic = TI[h.t].icon;
      if (h.n || B.isProducing(h.t)) {
        const fs = S * 0.3;
        land += `<text x="${c.x - S * 0.42}" y="${c.y - S * 0.22}" font-size="${fs}" text-anchor="middle">${ic}</text>
          <text x="${c.x}" y="${c.y - S * 0.48}" font-size="${fs}" text-anchor="middle">${ic}</text>
          <text x="${c.x + S * 0.42}" y="${c.y - S * 0.22}" font-size="${fs}" text-anchor="middle">${ic}</text>
          <text x="${c.x - S * 0.25}" y="${c.y + S * 0.66}" font-size="${fs * 0.85}" text-anchor="middle">${ic}</text>
          <text x="${c.x + S * 0.25}" y="${c.y + S * 0.66}" font-size="${fs * 0.85}" text-anchor="middle">${ic}</text>`;
        land += numberToken(c.x, c.y + S * 0.08, h.n);
      } else {
        land += `<text x="${c.x}" y="${c.y + S * 0.18}" font-size="${S * 0.55}" text-anchor="middle">${ic}</text>`;
      }
      land += '</g>';
    }

    // Häfen
    let harbors = '';
    for (const hb of m.harbors) {
      const e = G.edges[hb.edge];
      if (!e) continue;
      const seaHex = e.hexes.find(x => m.hexes[x] && m.hexes[x].t === 'sea');
      if (!seaHex) continue;
      const pa = vPx(e.a), pb = vPx(e.b), sc = hexPx(m.hexes[seaHex].q, m.hexes[seaHex].r);
      const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      const pos = { x: mid.x + (sc.x - mid.x) * 0.6, y: mid.y + (sc.y - mid.y) * 0.6 };
      harbors += `<g pointer-events="none">
        <line x1="${pa.x}" y1="${pa.y}" x2="${pos.x}" y2="${pos.y}" stroke="#7a5230" stroke-width="5" stroke-linecap="round"/>
        <line x1="${pb.x}" y1="${pb.y}" x2="${pos.x}" y2="${pos.y}" stroke="#7a5230" stroke-width="5" stroke-linecap="round"/>
        <circle cx="${pos.x}" cy="${pos.y}" r="${S * 0.27}" fill="#fff8e1" stroke="#6d4c41" stroke-width="2.5" filter="url(#pshadow)"/>`;
      if (hb.type === 'any') harbors += `<text x="${pos.x}" y="${pos.y + 5}" font-size="15" font-weight="800" text-anchor="middle" fill="#3b2a17">3:1</text>`;
      else harbors += `<text x="${pos.x}" y="${pos.y - 1}" font-size="15" text-anchor="middle">${RI[hb.type].icon}</text>
        <text x="${pos.x}" y="${pos.y + 13}" font-size="11" font-weight="800" text-anchor="middle" fill="#3b2a17">2:1</text>`;
      harbors += '</g>';
    }

    // Spielfiguren
    let pieces = '';
    const col = i => (g.players[i] && g.players[i].color) || '#999';
    if (g.pieces) {
      for (const ek in g.pieces.e) {
        const pc = g.pieces.e[ek], e = G.edges[ek];
        const a = vPx(e.a), b = vPx(e.b);
        if (pc.type === 'road') {
          const x1 = a.x + (b.x - a.x) * 0.16, y1 = a.y + (b.y - a.y) * 0.16, x2 = a.x + (b.x - a.x) * 0.84, y2 = a.y + (b.y - a.y) * 0.84;
          pieces += `<g filter="url(#pshadow)"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1a1a1a" stroke-width="${S * 0.17 + 3}" stroke-linecap="round"/>
            <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col(pc.owner)}" stroke-width="${S * 0.17}" stroke-linecap="round"/></g>`;
        } else {
          const sel = st.moveFrom === ek;
          pieces += shipSvg((a.x + b.x) / 2, (a.y + b.y) / 2, col(pc.owner), sel);
        }
      }
      for (const vk in g.pieces.v) {
        const pc = g.pieces.v[vk], p = vPx(vk), k = S / 60;
        const path = pc.type === 'city'
          ? 'M-15,10 L15,10 L15,-4 L3,-4 L3,-10 L-6,-19 L-15,-10 Z'
          : 'M-10,8 L10,8 L10,-3 L0,-12 L-10,-3 Z';
        pieces += `<path transform="translate(${p.x},${p.y}) scale(${k * 1.15})" d="${path}" fill="${col(pc.owner)}" stroke="#1a1a1a" stroke-width="2" stroke-linejoin="round" filter="url(#pshadow)"/>`;
      }
    }
    // Räuber & Pirat
    if (m.robber && m.hexes[m.robber]) {
      const c = hexPx(m.hexes[m.robber].q, m.hexes[m.robber].r);
      pieces += `<g transform="translate(${c.x - S * 0.48},${c.y + S * 0.1}) scale(${S / 50})" filter="url(#pshadow)" pointer-events="none">
        <path d="M-9,12 Q-11,-2 0,-6 Q11,-2 9,12 Z" fill="#2b2b2b" stroke="#000" stroke-width="1"/>
        <circle cx="0" cy="-11" r="6.5" fill="#2b2b2b" stroke="#000" stroke-width="1"/></g>`;
    }
    if (m.pirate && m.hexes[m.pirate]) {
      const c = hexPx(m.hexes[m.pirate].q, m.hexes[m.pirate].r);
      pieces += `<g transform="translate(${c.x},${c.y}) scale(${S / 40})" filter="url(#pshadow)" pointer-events="none">
        <path d="M-15,3 L15,3 L10,11 L-10,11 Z" fill="#1d1d1d" stroke="#000"/>
        <line x1="0" y1="3" x2="0" y2="-17" stroke="#3a2a1a" stroke-width="2"/>
        <path d="M1,-16 L1,0 L13,0 Z" fill="#1d1d1d"/><path d="M-1,-14 L-1,0 L-11,0 Z" fill="#1d1d1d"/>
        <text x="4" y="-3" font-size="7" text-anchor="middle" fill="#fff">☠</text></g>`;
    }

    // Hervorhebungen
    let overlay = '';
    if (st.ed.sel && editing && m.hexes[st.ed.sel]) {
      const c = hexPx(m.hexes[st.ed.sel].q, m.hexes[st.ed.sel].r);
      overlay += `<polygon class="sel-h" points="${hexPoints(c.x, c.y, S * 0.92)}"/>`;
    }
    if (g.last && g.last.id !== st.lastPulse) {
      st.lastPulse = g.last.id;
      let p = null;
      if (g.last.kind === 'v') p = vPx(g.last.key);
      else if (g.last.kind === 'e' && G.edges[g.last.key]) { const a = vPx(G.edges[g.last.key].a), b = vPx(G.edges[g.last.key].b); p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
      else if (g.last.kind === 'h' && m.hexes[g.last.key]) p = hexPx(m.hexes[g.last.key].q, m.hexes[g.last.key].r);
      if (p) overlay += `<circle class="pulse" cx="${p.x}" cy="${p.y}" r="${g.last.kind === 'h' ? S * 0.8 : S * 0.35}" fill="none" stroke="#fff176" stroke-width="5"/>`;
    }
    for (const k of hot.h) { const h = m.hexes[k], c = hexPx(h.q, h.r); overlay += `<polygon class="hot-h" data-hex="${k}" points="${hexPoints(c.x, c.y, S * 0.85)}"/>`; }
    for (const ek of hot.e) {
      const e = G.edges[ek], a = vPx(e.a), b = vPx(e.b);
      const x1 = a.x + (b.x - a.x) * 0.2, y1 = a.y + (b.y - a.y) * 0.2, x2 = a.x + (b.x - a.x) * 0.8, y2 = a.y + (b.y - a.y) * 0.8;
      overlay += `<line class="hot-e" data-e="${ek}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${S * 0.22}"/>`;
    }
    for (const vk of hot.v) { const p = vPx(vk); overlay += `<circle class="hot-v" data-v="${vk}" cx="${p.x}" cy="${p.y}" r="${S * 0.17}"/>`; }

    svg.innerHTML = svgDefs() + sea + land + harbors + pieces + overlay;
  }

  function numberToken(x, y, n) {
    const r = S * 0.29;
    if (!n) {
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fdecea" stroke="#c62828" stroke-width="2" stroke-dasharray="4 3"/>
        <text x="${x}" y="${y + 7}" font-size="${S * 0.3}" font-weight="800" text-anchor="middle" fill="#c62828">?</text>`;
    }
    const red = n === 6 || n === 8;
    let s = `<circle cx="${x}" cy="${y}" r="${r}" fill="#f6e7c1" stroke="#8a6d3b" stroke-width="2" filter="url(#pshadow)"/>
      <text x="${x}" y="${y + S * 0.06}" font-size="${S * (red ? 0.29 : 0.26)}" font-weight="800" text-anchor="middle" fill="${red ? '#c62828' : '#3b2a17'}" font-family="Georgia, serif">${n}</text>`;
    const pips = PIPS[n] || 0, gap = 5.5;
    for (let i = 0; i < pips; i++) {
      s += `<circle cx="${x + (i - (pips - 1) / 2) * gap}" cy="${y + S * 0.16}" r="1.9" fill="${red ? '#c62828' : '#3b2a17'}"/>`;
    }
    return s;
  }

  function shipSvg(x, y, color, selected) {
    const k = S / 60;
    return `<g transform="translate(${x},${y}) scale(${k * 1.1})" filter="url(#pshadow)">
      ${selected ? '<circle r="20" fill="none" stroke="#fff176" stroke-width="4"/>' : ''}
      <path d="M-14,2 L14,2 L9,10 L-9,10 Z" fill="${color}" stroke="#1a1a1a" stroke-width="2" stroke-linejoin="round"/>
      <line x1="0" y1="2" x2="0" y2="-15" stroke="#1a1a1a" stroke-width="2"/>
      <path d="M1.5,-14 L1.5,-1 L12,-1 Z" fill="${color}" stroke="#1a1a1a" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M-1.5,-11 L-1.5,-1 L-9,-1 Z" fill="${color}" stroke="#1a1a1a" stroke-width="1.5" stroke-linejoin="round"/></g>`;
  }

  function onBoardClick(e) {
    const t = e.target.closest('[data-v],[data-e],[data-hex]');
    if (!t) return;
    const g = st.g;
    if (g.status === 'lobby') { if (t.dataset.hex) editorClick(t.dataset.hex); return; }
    if (t.dataset.v) {
      const kind = g.phase === 'setup' ? 'settlement' : st.mode;
      act({ type: 'build', kind, at: t.dataset.v }, ok => { if (ok) st.mode = null; });
    } else if (t.dataset.e) {
      if (g.phase === 'setup') act({ type: 'build', kind: st.routeType, at: t.dataset.e });
      else if (st.mode === 'moveShip') {
        if (!st.moveFrom) { st.moveFrom = t.dataset.e; render(); }
        else act({ type: 'moveShip', from: st.moveFrom, to: t.dataset.e }, () => { st.moveFrom = null; st.mode = null; render(); });
      } else act({ type: 'build', kind: st.mode, at: t.dataset.e }, ok => { if (ok && !(st.g.freeRoads > 0)) st.mode = null; });
    } else if (t.dataset.hex && g.phase === 'robber') {
      act({ type: 'moveRobber', hex: t.dataset.hex });
    }
  }

  function editorClick(hex) {
    const ed = st.ed;
    if (ed.tool === 'swapTiles' || ed.tool === 'swapNumbers') {
      if (!ed.sel) ed.sel = hex;
      else if (ed.sel === hex) ed.sel = null;
      else { const a = ed.sel; ed.sel = null; act({ type: ed.tool, a, b: hex }); }
      drawBoard();
    } else if (ed.tool === 'setTerrain') act({ type: 'setTerrain', hex, t: ed.terrain });
    else if (ed.tool === 'setNumber') act({ type: 'setNumber', hex, n: ed.number });
  }

  // ---------- Seitenleiste ----------
  function renderSide() {
    const side = document.getElementById('side');
    const scroll = side.scrollTop;
    side.innerHTML = st.g.status === 'lobby' ? editorSide() : gameSide();
    side.scrollTop = scroll;
  }

  function editorSide() {
    const g = st.g, ed = st.ed, joined = g.me >= 0, isHost = g.hostId === st.me.id;
    if (ed.size === null) ed.size = g.settings.size;
    if (ed.islands === null) ed.islands = g.settings.islands;
    const hexes = Object.values(g.map.hexes);
    const counts = {};
    hexes.forEach(h => { if (h.t !== 'sea') counts[h.t] = (counts[h.t] || 0) + 1; });
    const missing = hexes.filter(h => B.isProducing(h.t) && !h.n).length;
    const islands = B.computeIslands(g.map).sizes;
    const tools = [['swapTiles', '🔀 Felder tauschen'], ['swapNumbers', '🔢 Zahlen tauschen'], ['setTerrain', '🖌️ Feld malen'], ['setNumber', '#️⃣ Zahl setzen']];
    let h = `<section class="panel">
      <h3>Spieler (${g.players.length}/4)</h3>
      ${g.players.map(p => `<div class="player"><span class="grow pname">${esc(p.name)}${p.userId === g.hostId ? ' 👑' : ''}${p.userId === st.me.id ? ' (du)' : ''}</span></div>`).join('')}
      ${!joined && g.players.length < 4 ? '<button class="btn ok big" data-a="join">Beitreten</button>' : ''}
    </section>`;
    if (!joined) return h + '<section class="panel muted">Du schaust zu. Tritt bei, um die Karte mit zu bearbeiten.</section>' + logBox(g);
    h += `<section class="panel">
      <h3>Zufallskarte</h3>
      <div class="row">
        <select data-bind="ed.size"><option value="4" ${ed.size === 4 ? 'selected' : ''}>Großes Feld (4 Sp.)</option><option value="3" ${ed.size === 3 ? 'selected' : ''}>Kleines Feld (3 Sp.)</option></select>
        <select data-bind="ed.islands"><option value="2" ${ed.islands === 2 ? 'selected' : ''}>2 Inseln</option><option value="3" ${ed.islands === 3 ? 'selected' : ''}>3 Inseln</option></select>
      </div>
      <div class="row" style="margin-top:8px"><button class="btn primary" data-a="regen">🎲 Neue Zufallskarte</button><button class="btn" data-a="harbors">⚓ Häfen neu</button></div>
      <div class="muted" style="margin-top:6px">Aktuell: ${islands.length} Insel(n) (${islands.join(' / ')} Felder). Die größte ist die Startinsel.</div>
    </section>
    <section class="panel">
      <h3>Karte bearbeiten</h3>
      <div class="palette">${tools.map(([k, l]) => `<button class="btn ${ed.tool === k ? 'active' : ''}" data-a="tool" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="muted" style="margin:8px 0 4px">${{
        swapTiles: 'Klicke zwei Felder an, um sie (samt Zahl) zu tauschen.',
        swapNumbers: 'Klicke zwei Rohstoff-Felder an, um nur die Zahlen zu tauschen.',
        setTerrain: 'Wähle einen Feldtyp und klicke auf Felder, um sie zu übermalen.',
        setNumber: 'Wähle eine Zahl und klicke auf ein Rohstoff-Feld.',
      }[ed.tool]}</div>
      ${ed.tool === 'setTerrain' ? `<div class="palette">${B.ALL_TERRAINS.map(t => `<button class="btn ${ed.terrain === t ? 'active' : ''}" data-a="terrain" data-v="${t}">${TI[t].icon} ${TI[t].de}</button>`).join('')}</div>` : ''}
      ${ed.tool === 'setNumber' ? `<div class="palette">${B.NUMBERS.map(n => `<button class="btn ${ed.number === n ? 'active' : ''}" data-a="number" data-v="${n}" style="${n === 6 || n === 8 ? 'color:#c62828' : ''}">${n}</button>`).join('')}<button class="btn ${ed.number === null ? 'active' : ''}" data-a="number" data-v="">✖ entfernen</button></div>` : ''}
      <div class="terrain-stats" style="margin-top:10px">${Object.keys(TI).filter(t => counts[t]).map(t => `<span>${TI[t].icon} ${counts[t]}</span>`).join('')}</div>
      ${missing ? `<div class="err" style="margin-top:6px">${missing} Feld(er) ohne Zahl (mit ? markiert)</div>` : ''}
    </section>
    <section class="panel">
      <h3>Regeln</h3>
      <div class="row">Siegpunkte zum Gewinnen:
        <button class="btn small" data-a="vp" data-d="-1">−</button><b>${g.settings.vpTarget}</b><button class="btn small" data-a="vp" data-d="1">+</button></div>
      <div class="muted" style="margin-top:6px">Erste Siedlung auf einer weiteren Insel: +${E.ISLAND_BONUS} Siegpunkte.</div>
    </section>
    <section class="panel">
      ${isHost ? `<button class="btn ok big" data-a="start" ${g.players.length < 2 ? 'disabled' : ''}>▶ Spiel starten (${g.players.length} Spieler)</button>
        <div class="muted" style="margin-top:6px">Die Reihenfolge wird beim Start ausgelost. Danach kann niemand mehr beitreten.</div>`
        : `<div class="muted">Warte, bis ${esc((g.players.find(p => p.userId === g.hostId) || {}).name || 'der Ersteller')} das Spiel startet. Alle Änderungen an der Karte siehst du live.</div>`}
    </section>`;
    return h + logBox(g);
  }

  function phaseText(g) {
    const cur = g.players[g.current] ? esc(g.players[g.current].name) : '';
    switch (g.phase) {
      case 'setup': return `Aufbau: setzt ${g.setup && g.setup.expect === 'settlement' ? 'eine Siedlung' : 'eine Straße oder ein Schiff'}`;
      case 'roll': return 'muss würfeln';
      case 'discard': return 'Warten auf Abwerfen: ' + Object.keys(g.discards).map(i => esc(g.players[i].name)).join(', ');
      case 'robber': return 'versetzt Räuber oder Pirat';
      case 'steal': return 'wählt, wem eine Karte gestohlen wird';
      case 'gold': return 'Goldfluss: ' + Object.keys(g.goldPending).map(i => esc(g.players[i].name)).join(', ') + ' wählt Rohstoffe';
      case 'main': return 'baut, handelt oder beendet den Zug';
      case 'finished': return 'Spiel beendet';
      default: return cur;
    }
  }

  function gameSide() {
    const g = st.g, me = g.me, my = me >= 0 ? g.players[me] : null;
    const myTurn = me >= 0 && me === g.current && g.status === 'playing';
    const cur = g.players[g.current];
    let h = '';
    if (g.status === 'finished') {
      h += `<section class="panel prompt winner">🏆 ${esc(g.players[g.winner].name)} gewinnt!</section>`;
    } else {
      h += `<section class="panel"><div class="status"><span class="dot" style="background:${cur.color}"></span>
        <div><div class="who">${myTurn ? 'Du bist am Zug' : esc(cur.name) + ' ist am Zug'}</div><div class="hint">${phaseText(g)}</div></div></div></section>`;
    }
    h += promptBox(g, me, my, myTurn);
    h += diceBox(g, myTurn);
    h += playersBox(g);
    if (my) h += handBox(g, my, myTurn);
    if (myTurn && g.phase === 'main') h += actionsBox(g, my) + tradeBox(g, me, my);
    h += statsBox(g);
    h += logBox(g);
    return h;
  }

  function counterRow(path, max) {
    const obj = getPath(path);
    return `<div class="res-counters">${RES.map(r => `<div class="rc">
      <div class="rc-icon" style="background:${RI[r].color}" title="${RI[r].de}">${RI[r].icon}</div>
      <div class="rc-ctrl"><button data-a="cnt" data-path="${path}" data-res="${r}" data-d="-1" ${obj[r] <= 0 ? 'disabled' : ''}>−</button>
      <b>${obj[r]}</b><button data-a="cnt" data-path="${path}" data-res="${r}" data-d="1" ${max && obj[r] >= max[r] ? 'disabled' : ''}>+</button></div></div>`).join('')}</div>`;
  }

  function promptBox(g, me, my, myTurn) {
    let out = '';
    const box = s => { out += `<section class="panel prompt">${s}</section>`; };
    if (g.status !== 'playing') return '';
    if (myTurn && g.phase === 'setup') {
      if (g.setup.expect === 'settlement') box('<b>Setze eine Siedlung</b><div class="muted">Klicke auf einen gelb markierten Punkt der Startinsel.</div>');
      else box(`<b>Baue eine Straße oder ein Schiff</b> an deine neue Siedlung.
        <div class="row" style="margin-top:6px"><button class="btn ${st.routeType === 'road' ? 'active' : ''}" data-a="route" data-v="road">🛤️ Straße</button>
        <button class="btn ${st.routeType === 'ship' ? 'active' : ''}" data-a="route" data-v="ship">⛵ Schiff</button></div>`);
    }
    if (g.phase === 'discard' && my && g.discards[me]) {
      const need = g.discards[me], sel = E.sumRes(st.discard);
      box(`<b>Eine 7! Wirf ${need} Karten ab</b> <span class="muted">(${sel}/${need} gewählt)</span>${counterRow('discard', my.res)}
        <button class="btn primary" data-a="discard" ${sel !== need ? 'disabled' : ''}>Abwerfen</button>`);
    }
    if (g.phase === 'gold' && my && g.goldPending[me]) {
      const need = Math.min(g.goldPending[me], E.sumRes(g.bank)), sel = E.sumRes(st.gold);
      box(`<b>💰 Goldfluss: Wähle ${need} Rohstoff(e)</b> <span class="muted">(${sel}/${need})</span>${counterRow('gold', g.bank)}
        <button class="btn primary" data-a="gold" ${sel !== need ? 'disabled' : ''}>Nehmen</button>`);
    }
    if (myTurn && g.phase === 'robber') box('<b>Versetze den Räuber oder den Piraten</b><div class="muted">Landfeld = Räuber (blockiert Ertrag), Meerfeld = Pirat (blockiert Schiffe). Klicke auf ein markiertes Feld.</div>');
    if (myTurn && g.phase === 'steal') {
      box(`<b>Von wem willst du eine Karte stehlen?</b><div class="row" style="margin-top:6px">${g.stealFrom.map(i =>
        `<button class="btn" data-a="steal" data-v="${i}"><span style="color:${g.players[i].color}">●</span> ${esc(g.players[i].name)} (${g.players[i].resCount})</button>`).join('')}</div>`);
    }
    if (myTurn && g.phase === 'main' && g.freeRoads > 0) box(`<b>Straßenbau:</b> Du kannst noch ${g.freeRoads} Straße(n)/Schiff(e) gratis bauen. Wähle unten „Straße" oder „Schiff".`);
    if (st.devUI === 'yearOfPlenty') {
      const opts = sel => RES.map(r => `<option value="${r}" ${sel === r ? 'selected' : ''}>${RI[r].icon} ${RI[r].de}</option>`).join('');
      box(`<b>🎁 Erfindung: 2 Rohstoffe wählen</b><div class="row" style="margin-top:6px">
        <select data-bind="yop.0">${opts(st.yop[0])}</select><select data-bind="yop.1">${opts(st.yop[1])}</select></div>
        <div class="row" style="margin-top:6px"><button class="btn primary" data-a="confirmYop">Nehmen</button><button class="btn" data-a="cancelDev">Abbrechen</button></div>`);
    }
    if (st.devUI === 'monopoly') {
      box(`<b>💎 Monopol: Welchen Rohstoff?</b><div class="row" style="margin-top:6px">
        <select data-bind="mono">${RES.map(r => `<option value="${r}" ${st.mono === r ? 'selected' : ''}>${RI[r].icon} ${RI[r].de}</option>`).join('')}</select>
        <button class="btn primary" data-a="confirmMono">Ausspielen</button><button class="btn" data-a="cancelDev">Abbrechen</button></div>`);
    }
    const t = g.trade;
    if (t && me >= 0 && t.from !== me && (t.to === null || t.to === me) && !t.declined.includes(me)) {
      const canPay = my && E.hasRes(my.res, t.get);
      box(`<b>🤝 Tauschangebot von ${esc(g.players[t.from].name)}</b>
        <div style="margin:6px 0">Du bekommst: <b>${fmtIcons(t.give)}</b><br>Du gibst: <b>${fmtIcons(t.get)}</b></div>
        <div class="row"><button class="btn ok" data-a="accept" ${canPay ? '' : 'disabled'}>Annehmen</button><button class="btn danger" data-a="decline">Ablehnen</button>
        ${canPay ? '' : '<span class="muted">Dir fehlen Karten.</span>'}</div>`);
    }
    return out;
  }

  const fmtIcons = r => RES.filter(k => r[k]).map(k => `${r[k]}× ${RI[k].icon}`).join('  ') || '–';

  function dieFace(n, red) {
    const pos = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[n] || [];
    let s = `<div class="die${red ? ' red' : ''}${Date.now() < st.rollAnimUntil ? ' rolling' : ''}">`;
    for (let i = 1; i <= 9; i++) s += `<span class="${pos.includes(i) ? 'pip' : ''}"></span>`;
    return s + '</div>';
  }

  function diceBox(g, myTurn) {
    const d = g.dice;
    const canRoll = myTurn && g.phase === 'roll';
    return `<section class="panel"><div class="dice-row">
      ${d ? dieFace(d[0]) + dieFace(d[1], true) + `<div class="dice-sum">= ${d[0] + d[1]}</div>` : '<div class="muted">Noch nicht gewürfelt</div>'}
      <div class="grow"></div>
      ${canRoll ? '<button class="btn primary" data-a="roll">🎲 Würfeln</button>' : ''}
    </div></section>`;
  }

  function playersBox(g) {
    return `<section class="panel"><h3>Spieler · Ziel ${g.settings.vpTarget} ⭐</h3>${g.players.map((p, i) => {
      const vpShown = p.vpTotal !== undefined ? p.vpTotal : p.vpPublic;
      return `<div class="player ${i === g.current && g.status === 'playing' ? 'current' : ''}">
        <span class="swatch" style="background:${p.color}"></span>
        <span class="pname">${esc(p.name)}${i === g.me ? ' (du)' : ''}</span>
        <span class="stats">
          <span title="Rohstoffkarten">🃏${p.resCount}</span>
          <span title="Entwicklungskarten">📜${p.devCount}</span>
          <span title="Gespielte Ritter">⚔️${p.knights}</span>
          <span title="Längste Handelsstraße">🛣️${p.routeLen}</span>
          ${g.longestRoad === i ? '<span title="Längste Handelsstraße (+2)">🏅</span>' : ''}
          ${g.largestArmy === i ? '<span title="Größte Rittermacht (+2)">🛡️</span>' : ''}
          ${p.bonusIslands && p.bonusIslands.length ? `<span title="Neue Inseln besiedelt">🏝️${p.bonusIslands.length}</span>` : ''}
          <span class="vp" title="Siegpunkte${i === g.me ? ' (inkl. deiner geheimen)' : ' (sichtbar)'}">⭐${vpShown}</span>
        </span></div>`;
    }).join('')}
    <div class="muted" style="margin-top:6px">Bank: ${RES.map(r => `${RI[r].icon}${g.bank[r]}`).join(' ')} · 📜 ${g.devDeckCount}</div></section>`;
  }

  function handBox(g, my, myTurn) {
    const cards = RES.map(r => `<div class="rcard ${my.res[r] ? '' : 'zero'}" style="background:${RI[r].color}">
      <span class="lbl">${RI[r].de}</span><span class="ic">${RI[r].icon}</span><span class="cnt">${my.res[r]}</span></div>`).join('');
    const groups = {};
    my.dev.forEach(d => { (groups[d.type] = groups[d.type] || { total: 0, playable: 0 }).total++; if (d.turn !== g.turn) groups[d.type].playable++; });
    const canPlayNow = type => myTurn && !g.devPlayed && type !== 'vp' && groups[type].playable > 0 &&
      (g.phase === 'main' || (type === 'knight' && g.phase === 'roll'));
    const devs = Object.keys(groups).map(t => `<div class="dev"><span>${DEV_INFO[t].icon}</span>
      <span class="grow"><b>${DEV_INFO[t].de}</b> ×${groups[t].total}<br><span class="muted">${DEV_INFO[t].desc}</span></span>
      ${t !== 'vp' ? `<button class="btn small" data-a="playDev" data-v="${t}" ${canPlayNow(t) ? '' : 'disabled'}>Spielen</button>` : ''}</div>`).join('');
    return `<section class="panel"><h3>Deine Karten</h3><div class="hand">${cards}</div>
      ${devs ? `<div class="dev-list">${devs}</div>` : ''}
      <div class="muted" style="margin-top:6px">Noch übrig: 🛤️${my.left.road} ⛵${my.left.ship} 🏠${my.left.settlement} 🏰${my.left.city}</div></section>`;
  }

  function actionsBox(g, my) {
    const btn = kind => {
      const free = (kind === 'road' || kind === 'ship') && g.freeRoads > 0;
      const can = (free || E.hasRes(my.res, E.COSTS[kind])) && my.left[kind] > 0;
      return `<button class="btn ${st.mode === kind ? 'active' : ''}" data-a="mode" data-v="${kind}" ${can ? '' : 'disabled'}>
        <span>${BUILD_INFO[kind].icon} ${BUILD_INFO[kind].de}</span><span class="cost">${free ? 'gratis' : resIcons(E.COSTS[kind])}</span></button>`;
    };
    const movable = E.movableShips(g, g.me).length > 0;
    return `<section class="panel"><h3>Bauen</h3>
      <div class="build-grid">${btn('road')}${btn('ship')}${btn('settlement')}${btn('city')}
        <button class="btn" data-a="buyDev" ${E.hasRes(my.res, E.COSTS.dev) && g.devDeckCount > 0 ? '' : 'disabled'}><span>📜 Entwicklung</span><span class="cost">${resIcons(E.COSTS.dev)}</span></button>
        <button class="btn ${st.mode === 'moveShip' ? 'active' : ''}" data-a="mode" data-v="moveShip" ${movable ? '' : 'disabled'}><span>⛵➡️ Schiff versetzen</span><span class="cost">1× pro Zug</span></button>
      </div>
      ${st.mode ? `<div class="muted" style="margin-top:6px">${st.mode === 'moveShip' ? (st.moveFrom ? 'Wähle das Ziel für das Schiff.' : 'Wähle ein Schiff am offenen Ende.') : 'Klicke auf eine markierte Stelle auf dem Brett.'}
        <a href="#" data-a="cancelMode">Abbrechen</a></div>` : ''}
      <button class="btn primary big" style="margin-top:10px" data-a="endTurn">Zug beenden ➡️</button></section>`;
  }

  function tradeBox(g, me, my) {
    const rateOpts = RES.map(r => `<option value="${r}" ${st.bank.give === r ? 'selected' : ''}>${RI[r].icon} ${RI[r].de} (${E.tradeRate(g, me, r)}:1)</option>`).join('');
    const getOpts = RES.map(r => `<option value="${r}" ${st.bank.get === r ? 'selected' : ''}>${RI[r].icon} ${RI[r].de}</option>`).join('');
    const rate = E.tradeRate(g, me, st.bank.give);
    let h = `<section class="panel"><h3>Handel</h3>
      <div class="sub-h">🏦 Mit der Bank / Hafen</div>
      <div class="row" style="margin-top:4px"><select data-bind="bank.give">${rateOpts}</select> → <select data-bind="bank.get">${getOpts}</select>
      <button class="btn" data-a="bankTrade" ${my.res[st.bank.give] >= rate && st.bank.give !== st.bank.get ? '' : 'disabled'}>Tauschen</button></div>`;
    const t = g.trade;
    if (t && t.from === me) {
      h += `<div class="sub-h">🤝 Dein offenes Angebot an ${t.to === null ? 'alle' : esc(g.players[t.to].name)}</div>
        <div>Du gibst ${fmtIcons(t.give)} · bekommst ${fmtIcons(t.get)}</div>
        ${t.declined.length ? `<div class="muted">Abgelehnt von: ${t.declined.map(i => esc(g.players[i].name)).join(', ')}</div>` : '<div class="muted">Warte auf Antwort …</div>'}
        <button class="btn small" data-a="cancelTrade" style="margin-top:4px">Zurückziehen</button>`;
    } else {
      const others = g.players.map((p, i) => i).filter(i => i !== me);
      const giveOk = E.sumRes(st.trade.give) > 0 && E.sumRes(st.trade.get) > 0 && E.hasRes(my.res, st.trade.give);
      h += `<div class="sub-h">🤝 Mit Mitspielern <span class="muted">(vorher absprechen, hier nur bestätigen)</span></div>
        <div class="row" style="margin-top:4px">An: <select data-bind="trade.to"><option value="all">alle</option>${others.map(i => `<option value="${i}" ${String(st.trade.to) === String(i) ? 'selected' : ''}>${esc(g.players[i].name)}</option>`).join('')}</select></div>
        <div class="muted" style="margin-top:6px">Ich gebe:</div>${counterRow('trade.give', my.res)}
        <div class="muted">Ich bekomme:</div>${counterRow('trade.get', null)}
        <button class="btn" data-a="propose" ${giveOk ? '' : 'disabled'}>Angebot senden</button>`;
    }
    return h + '</section>';
  }

  function statsBox(g) {
    const stats = g.diceStats || {};
    const total = g.rollCount || 0;
    const ways = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
    let max = 1;
    for (let i = 2; i <= 12; i++) max = Math.max(max, stats[i] || 0, total * ways[i] / 36);
    let bars = '';
    for (let i = 2; i <= 12; i++) {
      const v = stats[i] || 0, exp = total * ways[i] / 36;
      bars += `<div class="bar-col" title="${i}: ${v}× gewürfelt (erwartet ≈ ${exp.toFixed(1)})">
        <div class="bar-area">
          <div class="bar ${i === 7 ? 'seven' : ''}" style="height:${(v / max) * 100}%"><span class="val">${v || ''}</span></div>
          ${total ? `<div class="exp" style="bottom:${(exp / max) * 100}%"></div>` : ''}
        </div>
        <span class="num">${i}</span></div>`;
    }
    return `<section class="panel"><h3>Würfelstatistik · ${total} Würfe</h3><div class="stats-chart">${bars}</div>
      <div class="muted">Gestrichelt = statistisch erwartet</div></section>`;
  }

  function logBox(g) {
    return `<section class="panel"><h3>Spielverlauf</h3><div class="log">${g.log.slice(-80).reverse().map(l => `<div>${esc(l.msg)}</div>`).join('')}</div></section>`;
  }

  // ---------- Pfad-Helfer für Formularzustand ----------
  function getPath(path) { return path.split('.').reduce((o, k) => o[k], st); }
  function setPath(path, val) {
    const parts = path.split('.'), last = parts.pop();
    parts.reduce((o, k) => o[k], st)[last] = val;
  }

  function onSideChange(e) {
    const el = e.target.closest('[data-bind]');
    if (!el) return;
    const path = el.dataset.bind;
    let val = el.value;
    if (path === 'ed.size' || path === 'ed.islands') val = Number(val);
    setPath(path, val);
    renderSide();
  }

  function onSideClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    e.preventDefault();
    const a = b.dataset.a, v = b.dataset.v, g = st.g;
    switch (a) {
      // Editor
      case 'join': socket.emit('game:join', { id: g.id }, res => { if (res && res.error) toast(res.error, 'error'); }); break;
      case 'regen': act({ type: 'regenerate', size: st.ed.size, islands: st.ed.islands }); st.ed.sel = null; break;
      case 'harbors': act({ type: 'harbors' }); break;
      case 'tool': st.ed.tool = v; st.ed.sel = null; render(); break;
      case 'terrain': st.ed.terrain = v; renderSide(); break;
      case 'number': st.ed.number = v === '' ? null : Number(v); renderSide(); break;
      case 'vp': act({ type: 'settings', vpTarget: g.settings.vpTarget + Number(b.dataset.d) }); break;
      case 'start': act({ type: 'start' }); break;
      // Spiel
      case 'route': st.routeType = v; render(); break;
      case 'roll': act({ type: 'roll' }); break;
      case 'mode': st.mode = st.mode === v ? null : v; st.moveFrom = null; render(); break;
      case 'cancelMode': st.mode = null; st.moveFrom = null; render(); break;
      case 'buyDev': act({ type: 'buyDev' }); break;
      case 'endTurn': act({ type: 'endTurn' }); break;
      case 'playDev':
        if (v === 'yearOfPlenty' || v === 'monopoly') { st.devUI = v; renderSide(); }
        else act({ type: 'playDev', card: v });
        break;
      case 'confirmYop': act({ type: 'playDev', card: 'yearOfPlenty', res1: st.yop[0], res2: st.yop[1] }, ok => { if (ok) st.devUI = null; }); break;
      case 'confirmMono': act({ type: 'playDev', card: 'monopoly', res: st.mono }, ok => { if (ok) st.devUI = null; }); break;
      case 'cancelDev': st.devUI = null; renderSide(); break;
      case 'cnt': {
        const obj = getPath(b.dataset.path);
        obj[b.dataset.res] = Math.max(0, obj[b.dataset.res] + Number(b.dataset.d));
        renderSide();
        break;
      }
      case 'discard': act({ type: 'discard', res: st.discard }, ok => { if (ok) st.discard = E.emptyRes(); }); break;
      case 'gold': act({ type: 'gold', res: st.gold }, ok => { if (ok) st.gold = E.emptyRes(); }); break;
      case 'steal': act({ type: 'steal', target: Number(v) }); break;
      case 'bankTrade': act({ type: 'bankTrade', give: st.bank.give, get: st.bank.get }); break;
      case 'propose':
        act({ type: 'tradePropose', to: st.trade.to === 'all' ? null : Number(st.trade.to), give: st.trade.give, get: st.trade.get },
          ok => { if (ok) { st.trade.give = E.emptyRes(); st.trade.get = E.emptyRes(); } });
        break;
      case 'cancelTrade': act({ type: 'tradeCancel' }); break;
      case 'accept': act({ type: 'tradeAccept' }); break;
      case 'decline': act({ type: 'tradeDecline' }); break;
    }
  }

  // ---------- Start ----------
  (async () => {
    try { st.me = (await api('/api/me')).user; } catch (e) { st.me = null; }
    if (st.me) connect();
    route();
  })();
})();
