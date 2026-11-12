(() => {
  'use strict';
  const B = window.ArchipelBoard, E = window.ArchipelEngine, A = window.ArchipelArt;
  const S = 60; // Hex-Radius in SVG-Einheiten
  const SQ3 = Math.sqrt(3);
  const RES = B.RESOURCES;
  const RI = {
    wood: { de: 'Holz', icon: '🪵', bg: 'linear-gradient(160deg,#4f9a4a,#1f5a25)' },
    brick: { de: 'Lehm', icon: '🧱', bg: 'linear-gradient(160deg,#e07a45,#9c3a17)' },
    sheep: { de: 'Wolle', icon: '🐑', bg: 'linear-gradient(160deg,#b4e07a,#5f9a2f)' },
    wheat: { de: 'Getreide', icon: '🌾', bg: 'linear-gradient(160deg,#f7d56b,#c58d12)' },
    ore: { de: 'Erz', icon: '🪨', bg: 'linear-gradient(160deg,#a6b3c0,#4f5d6b)' },
  };
  const TI = { sea: 'Meer', forest: 'Wald', hills: 'Hügel', pasture: 'Weide', fields: 'Acker', mountains: 'Gebirge', gold: 'Goldfluss', desert: 'Wüste' };
  const TI_ICON = { sea: '🌊', forest: '🌲', hills: '🧱', pasture: '🐑', fields: '🌾', mountains: '⛰️', gold: '💰', desert: '🌵' };
  const DEV_INFO = {
    knight: { de: 'Ritter', icon: '⚔️', desc: 'Räuber oder Pirat versetzen und eine Karte ziehen' },
    vp: { de: 'Siegpunkt', icon: '⭐', desc: '+1 Siegpunkt (nur für dich sichtbar)' },
    roadBuilding: { de: 'Straßenbau', icon: '🛤️', desc: '2 Straßen oder Schiffe gratis bauen' },
    yearOfPlenty: { de: 'Erfindung', icon: '🎁', desc: '2 beliebige Rohstoffe nehmen' },
    monopoly: { de: 'Monopol', icon: '💎', desc: 'Alle Karten einer Rohstoffsorte von den anderen' },
  };
  const PIECE_DE = { settlement: 'Siedlung', city: 'Stadt', road: 'Straße', ship: 'Schiff' };
  const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  const ROLL_MS = 1300; // so lange rollen die Würfel, bevor die Zahl erscheint
  const $app = document.getElementById('app');

  const st = {
    me: null, games: [], g: null, gameId: null,
    mode: null, routeType: 'road', moveFrom: null, drag: null, justDragged: false,
    ed: { tool: 'swapTiles', sel: null, terrain: 'forest', number: 6, size: null, islands: null },
    trade: { to: 'all', give: E.emptyRes(), get: E.emptyRes() },
    bank: { give: 'wood', get: 'ore' },
    discard: E.emptyRes(), gold: E.emptyRes(),
    devUI: null, yop: ['wood', 'wood'], mono: 'wood',
    lastPulse: null, seen: {}, popups: [], panel: null,
    rolling: null, pendingState: null, overlayKey: null,
  };
  let socket = null;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const miniCards = res => RES.filter(r => res[r]).map(r => Array(res[r]).fill(`<span class="mini-card" style="background:${RI[r].bg}" title="${RI[r].de}">${RI[r].icon}</span>`).join('')).join('');
  const colorOf = (g, i) => (g.players[i] && g.players[i].color) || '#999';
  const colorById = id => (E.COLORS.find(c => c.id === id) || { hex: '#999' }).hex;
  const nameOf = (g, i) => (i === g.me ? 'Du' : esc(g.players[i].name));

  function toast(msg, type) {
    const c = document.getElementById('toasts');
    const d = document.createElement('div');
    d.className = 'toast ' + (type || '');
    d.textContent = msg;
    c.appendChild(d);
    setTimeout(() => d.remove(), type === 'turn' ? 2600 : 3800);
  }

  async function api(path, body) {
    const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Fehler');
    return j;
  }

  // ---------- Verbindung ----------
  function connect() {
    if (socket) return;
    socket = io();
    socket.on('connect', () => { socket.emit('lobby:list'); if (st.gameId) socket.emit('game:open', { id: st.gameId }); });
    socket.on('connect_error', err => { if (err && err.message === 'unauthorized') { socket.disconnect(); socket = null; st.me = null; render(); } });
    socket.on('games', list => { st.games = list; if (!st.gameId) renderLobby(); });
    socket.on('state', g => { if (g.id === st.gameId) onState(g); });
    socket.on('gameMissing', id => { if (id === st.gameId) { toast('Dieses Spiel gibt es nicht (mehr).', 'error'); location.hash = ''; } });
  }

  function act(action, cb) {
    socket.emit('game:action', { id: st.gameId, action }, res => {
      if (res && res.error) { toast(res.error, 'error'); if (cb) cb(false); } else if (cb) cb(true);
    });
  }

  // Neue Zustände: Bei einem neuen Wurf rollen die Würfel erst eine Weile, dann wird der Zustand übernommen.
  function onState(g) {
    if (st.rolling) { st.pendingState = g; return; }
    const seen = st.seen[g.id];
    if (!seen) { // beim ersten Laden keine alten Popups zeigen
      st.seen[g.id] = { roll: g.lastRoll ? g.lastRoll.id : 0, steal: g.lastSteal ? g.lastSteal.id : 0, trade: g.lastTrade ? g.lastTrade.id : 0, dev: g.lastDev ? g.lastDev.id : 0 };
      applyState(g);
      return;
    }
    if (g.lastRoll && g.lastRoll.id > seen.roll && st.g && g.status === 'playing') {
      seen.roll = g.lastRoll.id;
      st.rolling = { roll: g.lastRoll, by: g.players[g.lastRoll.by].name };
      st.pendingState = g;
      renderOverlay();
      renderDock();
      const tick = setInterval(() => {
        const el = document.getElementById('rollDice');
        if (el) el.innerHTML = dieFace(1 + Math.floor(Math.random() * 6), false, true, true) + dieFace(1 + Math.floor(Math.random() * 6), true, true, true);
      }, 90);
      setTimeout(() => {
        clearInterval(tick);
        const roll = st.rolling.roll;
        st.rolling = null;
        st.popups.unshift({ type: 'roll', data: roll });
        const next = st.pendingState;
        st.pendingState = null;
        applyState(next);
      }, ROLL_MS);
      return;
    }
    applyState(g);
  }

  function applyState(g) {
    const prev = st.g, seen = st.seen[g.id];
    if (!prev || prev.current !== g.current || prev.phase !== g.phase || prev.turn !== g.turn || prev.status !== g.status) {
      st.mode = null; st.moveFrom = null; st.devUI = null;
    }
    if (g.phase === 'discard' && (!prev || prev.phase !== 'discard')) st.discard = E.emptyRes();
    if (g.phase === 'gold' && (!prev || prev.phase !== 'gold')) st.gold = E.emptyRes();
    if (seen && g.lastRoll && g.lastRoll.id > seen.roll) seen.roll = g.lastRoll.id;
    // Neue Popups kommen vor noch nicht bestätigte ältere; die älteren erscheinen danach.
    const fresh = [];
    if (seen && g.lastDev && g.lastDev.id > (seen.dev || 0)) { seen.dev = g.lastDev.id; fresh.push({ type: 'dev', data: g.lastDev }); }
    if (seen && g.lastSteal && g.lastSteal.id > seen.steal) { seen.steal = g.lastSteal.id; fresh.push({ type: 'steal', data: g.lastSteal }); }
    if (seen && g.lastTrade && g.lastTrade.id > seen.trade) {
      seen.trade = g.lastTrade.id;
      fresh.push({ type: 'trade', data: g.lastTrade });
      if (st.panel === 'trade') st.panel = null;
    }
    if (fresh.length) st.popups.unshift(...fresh);
    if (prev && g.status === 'playing' && g.me >= 0 && g.current === g.me && (prev.current !== g.me || prev.status !== 'playing')) toast('Du bist am Zug!', 'turn');
    if (prev && prev.status === 'lobby' && g.status === 'playing') toast('Das Spiel beginnt!', 'turn');
    st.g = g;
    render();
  }

  // ---------- Routing ----------
  function route() {
    const m = location.hash.match(/^#game\/(\d+)/);
    const id = m ? Number(m[1]) : null;
    if (id !== st.gameId) {
      st.gameId = id; st.g = null; st.mode = null; st.panel = null; st.popups = []; st.rolling = null; st.pendingState = null;
      st.ed.sel = null; st.ed.size = null; st.ed.islands = null;
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
      <div class="login-wrap"><form class="login card" id="loginForm">
        <div class="logo">⛵</div><h1>Inselrunde</h1><p class="sub">Besiedeln · Handeln · Segeln</p>
        <label>Name<input name="name" autocomplete="username" required autofocus></label>
        <label>Passwort<input type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn primary big">Einloggen</button><div class="err" id="loginErr"></div>
      </form></div>`;
    document.getElementById('loginForm').onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      try { const r = await api('/api/login', { name: f.name.value, password: f.password.value }); st.me = r.user; connect(); render(); }
      catch (err) { document.getElementById('loginErr').textContent = err.message; }
    };
  }

  async function logout() {
    await api('/api/logout', {}).catch(() => {});
    if (socket) { socket.disconnect(); socket = null; }
    st.me = null; st.g = null; location.hash = ''; render();
  }

  // ---------- Lobby ----------
  function renderLobby() {
    if (!st.me || st.gameId) return;
    if (!document.getElementById('gameList')) {
      $app.innerHTML = `
        <header class="topbar"><div class="brand">⛵ Inselrunde</div><div class="spacer"></div>
          <div>👤 ${esc(st.me.name)}</div><button class="btn small" id="logoutBtn">Logout</button></header>
        <main class="lobby-main">
          <section class="card">
            ${st.me.editor ? `<h2>Neues Spiel</h2>
            <form id="createForm">
              <label>Name der Runde<input name="name" placeholder="z. B. Sonntagsrunde" maxlength="40"></label>
              <label>Spielfeld<select name="size"><option value="4">Groß (für 4 Spieler)</option><option value="3">Klein (für 3 Spieler)</option></select></label>
              <label>Inseln<select name="islands"><option value="2">2 Inseln</option><option value="3">3 Inseln</option></select></label>
              <button class="btn primary">Spiel erstellen</button>
              <div class="muted">Danach kannst du die Karte generieren und anpassen – die anderen sehen alles live.</div>
            </form>` : `<h2>Hallo ${esc(st.me.name)}!</h2><div class="muted">Felix erstellt die Spiele und die Karte. Sobald ein Spiel da ist, kannst du rechts beitreten.</div>`}
          </section>
          <section class="card"><h2>Spiele</h2><div id="gameList"></div></section>
        </main>`;
      document.getElementById('logoutBtn').onclick = logout;
      const cf = document.getElementById('createForm');
      if (cf) cf.onsubmit = e => {
        e.preventDefault();
        socket.emit('game:create', { name: cf.name.value, size: Number(cf.size.value), islands: Number(cf.islands.value) }, res => {
          if (res && res.error) return toast(res.error, 'error');
          location.hash = '#game/' + res.id;
        });
      };
      document.getElementById('gameList').onclick = e => {
        const b = e.target.closest('button[data-a]');
        if (!b) return;
        const id = Number(b.dataset.id);
        if (b.dataset.a === 'open') location.hash = '#game/' + id;
        if (b.dataset.a === 'join') socket.emit('game:join', { id }, res => { if (res && res.error) return toast(res.error, 'error'); location.hash = '#game/' + id; });
        if (b.dataset.a === 'delete' && confirm('Spiel wirklich löschen?')) socket.emit('game:delete', { id }, res => { if (res && res.error) toast(res.error, 'error'); });
      };
    }
    const statusDe = { lobby: 'Karte wird erstellt', playing: 'läuft', finished: 'beendet' };
    document.getElementById('gameList').innerHTML = st.games.length ? st.games.map(g => {
      const joined = g.players.some(p => p.id === st.me.id);
      return `<div class="game-item"><div class="info">
          <div class="name">${esc(g.name)} <span class="badge ${g.status}">${statusDe[g.status]}</span></div>
          <div class="muted">${g.players.map(p => esc(p.name)).join(', ')} · ${g.size === 3 ? 'kleines' : 'großes'} Feld · ${g.islands} Inseln
          ${g.current ? ' · am Zug: ' + esc(g.current) : ''}${g.winner ? ' · 🏆 ' + esc(g.winner) : ''}</div></div>
        ${g.status === 'lobby' && !joined && g.players.length < 4 ? `<button class="btn ok small" data-a="join" data-id="${g.id}">Beitreten</button>` : ''}
        <button class="btn small" data-a="open" data-id="${g.id}">${joined ? 'Öffnen' : 'Zuschauen'}</button>
        ${g.hostId === st.me.id ? `<button class="btn danger small" data-a="delete" data-id="${g.id}">🗑</button>` : ''}</div>`;
    }).join('') : '<div class="muted">Noch keine Spiele.</div>';
  }

  // ---------- Spielansicht ----------
  function renderGame() {
    if (!document.getElementById('board')) {
      $app.innerHTML = `
        <div class="game">
          <header class="topbar">
            <a href="#" class="btn small">← Lobby</a><div class="title" id="gameTitle"></div>
            <div class="chips" id="chips"></div>
            <div class="row">
              <button class="btn small" data-a="panel" data-v="costs">🧾 Baukosten</button>
              <button class="btn small" data-a="panel" data-v="stats">📊 Statistik</button>
              <button class="btn small" data-a="panel" data-v="log">📜 Verlauf</button>
            </div>
          </header>
          <div class="stage" id="stage">
            <aside class="turn" id="turn"></aside>
            <div class="board-wrap"><svg id="board" xmlns="http://www.w3.org/2000/svg"></svg></div>
            <div id="overlay"></div>
          </div>
          <footer class="dock" id="dock"></footer>
        </div>`;
      document.getElementById('board').addEventListener('click', onBoardClick);
      const game = $app.querySelector('.game');
      game.addEventListener('click', onUiClick);
      game.addEventListener('change', onUiChange);
      game.addEventListener('pointerdown', onPointerDown);
    }
    document.getElementById('gameTitle').textContent = st.g.name;
    drawBoard();
    renderChips();
    renderStatus();
    renderDock();
    renderOverlay();
  }

  // ---------- Brett ----------
  const hexPx = (q, r) => ({ x: SQ3 * (q + r / 2) * S, y: 1.5 * r * S });
  function vPx(vk) { const p = B.vertexPos(vk); return { x: p.x * S, y: p.y * S }; }
  function hexPoints(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (-90 + 60 * i); pts.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1)); }
    return pts.join(' ');
  }
  let staticDefs = null;
  function svgDefs() {
    if (!staticDefs) {
      staticDefs = '<defs>' + A.terrainSymbols() + `
        <linearGradient id="frameSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2a7fc0"/><stop offset="100%" stop-color="#1a5a94"/></linearGradient>
        <radialGradient id="tokenG" cx="40%" cy="35%" r="70%"><stop offset="0%" stop-color="#fffaf0"/><stop offset="100%" stop-color="#ecdcb4"/></radialGradient>
        <filter id="tileShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#021428" flood-opacity=".55"/></filter>
        <filter id="boardShadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity=".55"/></filter>
      </defs>`;
    }
    return staticDefs;
  }

  const myTurnNow = g => g.status === 'playing' && g.me >= 0 && g.me === g.current;

  function canPlaceKind(g, kind) {
    if (!myTurnNow(g)) return false;
    const my = g.players[g.me];
    if (g.phase === 'setup') {
      if (g.setup.expect === 'settlement') return kind === 'settlement';
      if (g.setup.expect === 'route') return kind === 'road' || kind === 'ship';
      return false;
    }
    if (g.phase !== 'main' || my.left[kind] <= 0) return false;
    const free = (kind === 'road' || kind === 'ship') && g.freeRoads > 0;
    return free || E.hasRes(my.res, E.COSTS[kind]);
  }

  function computeHot(g) {
    const hot = { v: [], e: [], h: [] };
    if (!myTurnNow(g)) return hot;
    const p = g.me;
    if (g.phase === 'setup') {
      if (g.setup.expect === 'settlement') hot.v = E.legalSpots(g, p, 'settlement');
      else if (g.setup.expect === 'route') hot.e = E.legalSpots(g, p, st.routeType);
    } else if (g.phase === 'robber') {
      const piece = st.drag && st.drag.rob ? st.drag.kind : null;
      hot.h = Object.keys(g.map.hexes).filter(k => {
        const land = B.isLand(g.map.hexes[k].t);
        return !piece || (piece === 'robber' ? land : !land);
      });
    } else if (g.phase === 'main') {
      if (PIECE_DE[st.mode]) {
        const s = E.legalSpots(g, p, st.mode);
        if (st.mode === 'settlement' || st.mode === 'city') hot.v = s; else hot.e = s;
      } else if (st.mode === 'moveShip') hot.e = st.moveFrom ? E.shipMoveTargets(g, p, st.moveFrom) : E.movableShips(g, p);
    }
    return hot;
  }

  function drawBoard() {
    const g = st.g, m = g.map, G = B.buildGraph(m.size);
    const svg = document.getElementById('board');
    const editing = g.status === 'lobby' && g.hostId === st.me.id;
    const hot = computeHot(g);
    const keys = Object.keys(m.hexes);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const k of keys) {
      const c = hexPx(m.hexes[k].q, m.hexes[k].r);
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }
    const pad = S * 2.1;
    svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`);

    let frame = '<g filter="url(#boardShadow)">';
    for (const k of keys) { const c = hexPx(m.hexes[k].q, m.hexes[k].r); frame += `<polygon points="${hexPoints(c.x, c.y, S * 1.78)}" fill="#c99a5b"/>`; }
    frame += '</g>';
    for (const k of keys) { const c = hexPx(m.hexes[k].q, m.hexes[k].r); frame += `<polygon points="${hexPoints(c.x, c.y, S * 1.68)}" fill="#0f4777"/>`; }
    for (const k of keys) { const c = hexPx(m.hexes[k].q, m.hexes[k].r); frame += `<polygon points="${hexPoints(c.x, c.y, S * 1.62)}" fill="url(#frameSea)"/>`; }

    let tiles = '', tokens = '';
    const ed = k => (editing ? ` data-hex="${k}"` : '');
    for (const k of keys) {
      const h = m.hexes[k], c = hexPx(h.q, h.r), cls = `tile${editing ? ' editable' : ''}`;
      if (h.t === 'sea') {
        tiles += `<g class="${cls}"${ed(k)}><use href="#t-sea" x="${c.x - S}" y="${c.y - S}" width="${2 * S}" height="${2 * S}"/>
          <polygon points="${hexPoints(c.x, c.y, S * 0.985)}" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2"/></g>`;
        continue;
      }
      tiles += `<g class="${cls}"${ed(k)} filter="url(#tileShadow)">
        <polygon points="${hexPoints(c.x, c.y, S * 0.985)}" fill="#e8d7a8"/>
        <use href="#t-${h.t}" x="${c.x - S * 0.91}" y="${c.y - S * 0.91}" width="${S * 1.82}" height="${S * 1.82}"/>
        <polygon points="${hexPoints(c.x, c.y, S * 0.91)}" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="1.5"/></g>`;
      if (B.isProducing(h.t)) tokens += numberToken(c.x, c.y, h.n, editing ? k : null);
    }

    let harbors = '';
    for (const hb of m.harbors) {
      if (!G.edges[hb.edge]) continue;
      const geo = B.harborGeometry(m, hb.edge);
      const a = { x: geo.a.x * S, y: geo.a.y * S }, b = { x: geo.b.x * S, y: geo.b.y * S }, mid = { x: geo.mid.x * S, y: geo.mid.y * S };
      harbors += A.harbor(a, b, mid, geo.dir, S, (x, y) => hb.type === 'any'
        ? `<text x="${x}" y="${y + 6}" font-size="17" font-weight="800" text-anchor="middle" fill="#3b2a17">3:1</text>`
        : `<text x="${x}" y="${y + 1}" font-size="16" text-anchor="middle">${RI[hb.type].icon}</text><text x="${x}" y="${y + 14}" font-size="11" font-weight="800" text-anchor="middle" fill="#3b2a17">2:1</text>`);
    }

    let routes = '', buildings = '';
    if (g.pieces) {
      for (const ek in g.pieces.e) {
        const pc = g.pieces.e[ek], e = G.edges[ek], a = vPx(e.a), b = vPx(e.b);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (pc.type === 'road') {
          const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
          routes += `<g transform="translate(${mx},${my}) rotate(${ang})">${A.road(colorOf(g, pc.owner), S * 0.68)}</g>`;
        } else {
          routes += `<g transform="translate(${mx},${my}) scale(${S / 60 * 1.25})">${st.moveFrom === ek ? '<circle r="24" fill="none" stroke="#ffcf6b" stroke-width="4"/>' : ''}${A.ship(colorOf(g, pc.owner))}</g>`;
        }
      }
      for (const vk in g.pieces.v) {
        const pc = g.pieces.v[vk], p = vPx(vk);
        buildings += `<g transform="translate(${p.x},${p.y}) scale(${S / 60 * (pc.type === 'city' ? 1.55 : 1.5)})">${pc.type === 'city' ? A.city(colorOf(g, pc.owner)) : A.settlement(colorOf(g, pc.owner))}</g>`;
      }
    }

    // Räuber & Pirat – in der Räuber-Phase für den aktiven Spieler greifbar (oberste Ebene)
    const grab = myTurnNow(g) && g.phase === 'robber';
    let thieves = '';
    if (m.robber && m.hexes[m.robber]) {
      const c = hexPx(m.hexes[m.robber].q, m.hexes[m.robber].r);
      thieves += `<g transform="translate(${c.x - S * 0.5},${c.y}) scale(${S / 50})" ${grab ? 'data-rob="robber" style="cursor:grab"' : 'pointer-events="none"'}>${grab ? '<circle r="22" fill="rgba(255,207,107,.25)" stroke="#ffcf6b" stroke-width="2"/>' : ''}${A.robber()}</g>`;
    }
    if (m.pirate && m.hexes[m.pirate]) {
      const c = hexPx(m.hexes[m.pirate].q, m.hexes[m.pirate].r);
      thieves += `<g transform="translate(${c.x},${c.y}) scale(${S / 45})" ${grab ? 'data-rob="pirate" style="cursor:grab"' : 'pointer-events="none"'}>${grab ? '<circle r="26" fill="rgba(255,207,107,.25)" stroke="#ffcf6b" stroke-width="2"/>' : ''}${A.pirate()}</g>`;
    }

    let overlay = '';
    if (st.ed.sel && editing && m.hexes[st.ed.sel]) { const c = hexPx(m.hexes[st.ed.sel].q, m.hexes[st.ed.sel].r); overlay += `<polygon class="sel-h" points="${hexPoints(c.x, c.y, S * 0.92)}"/>`; }
    if (g.last && g.last.id !== st.lastPulse) {
      st.lastPulse = g.last.id;
      let p = null;
      if (g.last.kind === 'v') p = vPx(g.last.key);
      else if (g.last.kind === 'e' && G.edges[g.last.key]) { const a = vPx(G.edges[g.last.key].a), b = vPx(G.edges[g.last.key].b); p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
      else if (g.last.kind === 'h' && m.hexes[g.last.key]) p = hexPx(m.hexes[g.last.key].q, m.hexes[g.last.key].r);
      if (p) overlay += `<circle class="pulse" cx="${p.x}" cy="${p.y}" r="${g.last.kind === 'h' ? S * 0.8 : S * 0.35}" fill="none" stroke="#ffe08f" stroke-width="5"/>`;
    }
    for (const k of hot.h) { const h = m.hexes[k], c = hexPx(h.q, h.r); overlay += `<polygon class="hot-h" data-hex="${k}" points="${hexPoints(c.x, c.y, S * 0.85)}"/>`; }
    for (const ek of hot.e) {
      const e = G.edges[ek], a = vPx(e.a), b = vPx(e.b);
      overlay += `<line class="hot-e" data-e="${ek}" x1="${a.x + (b.x - a.x) * 0.2}" y1="${a.y + (b.y - a.y) * 0.2}" x2="${a.x + (b.x - a.x) * 0.8}" y2="${a.y + (b.y - a.y) * 0.8}" stroke-width="${S * 0.24}"/>`;
    }
    for (const vk of hot.v) { const p = vPx(vk); overlay += `<circle class="hot-v" data-v="${vk}" cx="${p.x}" cy="${p.y}" r="${S * 0.18}"/>`; }

    svg.innerHTML = svgDefs() + frame + tiles + harbors + tokens + routes + buildings + overlay + thieves;
  }

  function numberToken(x, y, n, editKey) {
    const r = S * 0.31, attr = editKey ? ` data-hex="${editKey}" class="tile editable"` : ' pointer-events="none"';
    if (!n) {
      return `<g${attr}><circle cx="${x}" cy="${y}" r="${r}" fill="rgba(255,240,240,.9)" stroke="#e53935" stroke-width="2.5" stroke-dasharray="5 3"/>
        <text x="${x}" y="${y + 8}" font-size="${S * 0.34}" font-weight="800" text-anchor="middle" fill="#e53935">?</text></g>`;
    }
    const red = n === 6 || n === 8, col = red ? '#d32f2f' : '#2b2118';
    let s = `<g${attr}><circle cx="${x}" cy="${y + 2.5}" r="${r}" fill="rgba(0,0,0,.35)"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="url(#tokenG)" stroke="#bfa36e" stroke-width="2"/>
      <text x="${x}" y="${y + S * 0.07}" font-size="${S * (red ? 0.32 : 0.28)}" font-weight="800" text-anchor="middle" fill="${col}" font-family="Georgia, serif">${n}</text>`;
    const pips = PIPS[n] || 0, gap = 5.5;
    for (let i = 0; i < pips; i++) s += `<circle cx="${x + (i - (pips - 1) / 2) * gap}" cy="${y + S * 0.18}" r="2" fill="${col}"/>`;
    return s + '</g>';
  }

  function place(kind, key) {
    const g = st.g;
    act({ type: 'build', kind, at: key }, ok => { if (ok && g.phase !== 'setup' && !(st.g.freeRoads > 0 && (kind === 'road' || kind === 'ship'))) st.mode = null; });
  }

  function onBoardClick(e) {
    if (st.drag || st.justDragged) return;
    const t = e.target.closest('[data-v],[data-e],[data-hex]');
    if (!t) return;
    const g = st.g;
    if (g.status === 'lobby') { if (t.dataset.hex) editorClick(t.dataset.hex); return; }
    if (t.dataset.v) place(g.phase === 'setup' ? 'settlement' : st.mode, t.dataset.v);
    else if (t.dataset.e) {
      if (g.phase === 'setup') place(st.routeType, t.dataset.e);
      else if (st.mode === 'moveShip') {
        if (!st.moveFrom) { st.moveFrom = t.dataset.e; render(); }
        else act({ type: 'moveShip', from: st.moveFrom, to: t.dataset.e }, () => { st.moveFrom = null; st.mode = null; render(); });
      } else place(st.mode, t.dataset.e);
    } else if (t.dataset.hex && g.phase === 'robber') act({ type: 'moveRobber', hex: t.dataset.hex });
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

  // ---------- Drag & Drop (Figuren aus dem Vorrat, Räuber/Pirat auf dem Brett) ----------
  function pieceIcon(kind, color) {
    const inner = kind === 'settlement' ? A.settlement(color) : kind === 'city' ? A.city(color)
      : kind === 'road' ? `<g transform="rotate(-25)">${A.road(color, 40)}</g>`
      : kind === 'ship' ? A.ship(color) : kind === 'robber' ? A.robber() : A.pirate();
    return `<svg viewBox="-28 -34 56 54">${inner}</svg>`;
  }

  function onPointerDown(e) {
    if (e.button > 0) return;
    const g = st.g;
    const rob = e.target.closest('[data-rob]');
    const el = rob || e.target.closest('[data-drag]');
    if (!el) return;
    const kind = rob ? rob.dataset.rob : el.dataset.drag;
    if (!rob && !canPlaceKind(g, kind)) {
      if (myTurnNow(g)) toast(g.phase === 'main' ? 'Dafür fehlen dir Rohstoffe oder Figuren.' : 'Das geht gerade nicht.', 'error');
      return;
    }
    e.preventDefault();
    const wasActive = st.mode === kind;
    if (!rob) {
      if (g.phase === 'setup' && kind !== 'settlement') st.routeType = kind;
      if (g.phase === 'main') st.mode = kind;
      st.moveFrom = null;
    }
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.innerHTML = pieceIcon(kind, g.me >= 0 ? g.players[g.me].color : '#999');
    ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
    ghost.style.display = 'none';
    document.body.appendChild(ghost);
    st.drag = { kind, rob: !!rob, x0: e.clientX, y0: e.clientY, moved: false, ghost, hover: null, wasActive };
    drawBoard(); renderDock();
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd, { once: true });
  }
  function hotUnder(x, y, rob) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    return rob ? el.closest('.hot-h') : el.closest('[data-v],[data-e]');
  }
  function onDragMove(e) {
    const d = st.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) { d.moved = true; d.ghost.style.display = 'block'; }
    d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px';
    const h = hotUnder(e.clientX, e.clientY, d.rob);
    if (h !== d.hover) { if (d.hover) d.hover.classList.remove('hover'); if (h) h.classList.add('hover'); d.hover = h; }
  }
  function onDragEnd(e) {
    window.removeEventListener('pointermove', onDragMove);
    const d = st.drag;
    if (!d) return;
    d.ghost.remove();
    st.drag = null;
    if (d.moved) { st.justDragged = true; setTimeout(() => { st.justDragged = false; }, 50); }
    if (!d.moved) { // einfacher Klick auf eine Figur: Bau-Modus an/aus
      if (!d.rob && st.g.phase === 'main' && d.wasActive) st.mode = null;
      render();
      return;
    }
    const h = hotUnder(e.clientX, e.clientY, d.rob);
    if (d.rob) { if (h) act({ type: 'moveRobber', hex: h.dataset.hex, piece: d.kind }); }
    else if (h) place(d.kind, h.dataset.v || h.dataset.e);
    else if (st.g.phase === 'main') st.mode = null;
    render();
  }

  // ---------- Spieler-Chips ----------
  function renderChips() {
    const g = st.g, el = document.getElementById('chips');
    if (g.status === 'lobby') { el.innerHTML = ''; return; }
    el.innerHTML = g.players.map((p, i) => {
      const vp = p.vpTotal !== undefined ? p.vpTotal : p.vpPublic;
      const tags = [`<span class="tag" title="So viele Rohstoffkarten hat ${esc(p.name)} auf der Hand">${p.resCount} ${p.resCount === 1 ? 'Karte' : 'Karten'}</span>`];
      if (p.devCount) tags.push(`<span class="tag" title="Entwicklungskarten auf der Hand">${p.devCount} Entw.</span>`);
      if (p.knights) tags.push(`<span class="tag" title="Ausgespielte Ritter">⚔️ ${p.knights}</span>`);
      if (g.longestRoad === i) tags.push('<span class="tag gold" title="Längste Handelsstraße (+2 Siegpunkte)">🛣️ Längste Straße</span>');
      if (g.largestArmy === i) tags.push('<span class="tag gold" title="Größte Rittermacht (+2 Siegpunkte)">🛡️ Rittermacht</span>');
      return `<div class="chip ${i === g.current && g.status === 'playing' ? 'current' : ''}">
        <span class="avatar" style="background:${p.color}">${esc(p.name[0])}</span>
        <span class="nm">${esc(p.name)}${i === g.me ? ' (du)' : ''}</span>${tags.join('')}
        <span class="vp" title="Siegpunkte – Ziel: ${g.settings.vpTarget}">⭐ ${vp}</span></div>`;
    }).join('');
  }

  // ---------- Zug-Anzeige: Kreis links neben dem Brett ----------
  function renderStatus() {
    const g = st.g, el = document.getElementById('turn');
    if (g.status === 'lobby') { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = '';
    if (g.status === 'finished') {
      const w = g.players[g.winner];
      el.innerHTML = `<div class="turn-ring win" style="--pc:${w.color}"><div class="ic">🏆</div><div class="who">${esc(w.name)}</div><div class="act">gewinnt das Spiel!</div></div>`;
      el.classList.remove('mine');
      return;
    }
    const cur = g.players[g.current], mine = myTurnNow(g);
    let icon = '', text = '', extra = '';
    switch (g.phase) {
      case 'setup':
        icon = '🏗️';
        if (g.setup.expect === 'settlement') text = mine ? 'Setze eine Siedlung' : 'setzt eine Siedlung';
        else if (g.setup.expect === 'route') text = mine ? 'Baue eine Straße oder ein Schiff' : 'baut eine Straße oder ein Schiff';
        else text = mine ? 'Fertig? Zug beenden' : 'ist gleich fertig';
        break;
      case 'roll': icon = '🎲'; text = mine ? 'Würfle!' : 'würfelt gleich'; break;
      case 'discard': icon = '✋'; text = 'Eine 7! Abwerfen: ' + Object.keys(g.discards).map(i => esc(g.players[i].name)).join(', '); break;
      case 'gold': icon = '💰'; text = 'Goldfluss: ' + Object.keys(g.goldPending).map(i => esc(g.players[i].name)).join(', ') + ' wählt'; break;
      case 'robber':
        icon = '🏴‍☠️';
        if (!g.robberMoved) text = mine ? 'Versetze Räuber oder Pirat' : 'versetzt Räuber oder Pirat';
        else {
          const cands = g.stealCandidates || [];
          text = mine ? (cands.length ? 'Bei wem ziehen?' : 'Niemand zum Ziehen') : 'wählt, bei wem gezogen wird';
          if (mine) extra = cands.length
            ? cands.map(i => `<button class="btn small primary" data-a="steal" data-v="${i}"><span class="dot-s" style="background:${g.players[i].color}"></span>Bei ${esc(g.players[i].name)} ziehen (${g.players[i].resCount})</button>`).join('')
            : '<button class="btn small primary" data-a="steal" data-v="">Weiter</button>';
        }
        break;
      case 'main':
        icon = '🔨';
        text = mine ? 'Baue, handle oder beende den Zug' : 'ist am Zug';
        if (mine && g.freeRoads > 0) text = `Noch ${g.freeRoads} gratis Straße(n)/Schiff(e)`;
        if (mine && st.mode === 'moveShip') { text = st.moveFrom ? 'Ziel für das Schiff wählen' : 'Schiff am offenen Ende wählen'; extra = '<button class="btn small" data-a="cancelMode">Abbrechen</button>'; }
        break;
    }
    el.innerHTML = `<div class="turn-ring" style="--pc:${cur.color}">
        <div class="ic">${icon}</div>
        <div class="who">${mine ? 'Du bist dran' : esc(cur.name)}</div>
        <div class="act">${text}</div>
        ${g.turn ? `<div class="rnd">Zug ${g.turn}</div>` : '<div class="rnd">Aufbau</div>'}
      </div>${extra ? `<div class="turn-extra">${extra}</div>` : ''}`;
    el.classList.toggle('mine', mine);
  }

  // ---------- Dock (unten) ----------
  function dieFace(n, red, big, spinning) {
    const pos = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[n] || [];
    let s = `<div class="die${red ? ' red' : ''}${big ? ' big' : ''}${spinning ? ' spin' : ''}">`;
    for (let i = 1; i <= 9; i++) s += `<span class="${pos.includes(i) ? 'pip' : ''}"></span>`;
    return s + '</div>';
  }

  function renderDock() {
    const g = st.g, el = document.getElementById('dock');
    if (g.status === 'lobby') { el.innerHTML = lobbyDock(g); return; }
    const me = g.me, my = me >= 0 ? g.players[me] : null, myTurn = myTurnNow(g);
    let h = '<div class="dock-sec"><div class="sec-title">Würfel</div><div class="dice-row">';
    h += g.dice ? dieFace(g.dice[0]) + dieFace(g.dice[1], true) : '<span class="muted">–</span>';
    h += '</div>';
    if (myTurn && g.phase === 'roll') h += `<button class="btn primary" data-a="roll" ${st.rolling ? 'disabled' : ''}>🎲 Würfeln</button>`;
    else if (myTurn && (g.phase === 'main' || (g.phase === 'setup' && g.setup.expect === 'done'))) {
      const mustBuild = g.phase === 'main' && g.freeRoads > 0 && (my.left.road > 0 && E.legalSpots(g, me, 'road').length > 0 || my.left.ship > 0 && E.legalSpots(g, me, 'ship').length > 0);
      h += `<button class="btn primary" data-a="endTurn" ${mustBuild ? 'disabled title="Erst die Gratis-Straßen bauen"' : ''}>Zug beenden ➡️</button>`;
      if (mustBuild) h += `<div class="muted" style="font-size:12px">Noch ${g.freeRoads}× bauen</div>`;
    }
    if (myTurn && g.undoCount > 0) h += '<button class="btn small" data-a="undo">↩️ Rückgängig</button>';
    h += '</div>';
    if (!my) { el.innerHTML = h + '<div class="divider"></div><div class="dock-sec grow"><div class="muted">Du schaust zu.</div></div>'; return; }

    h += '<div class="divider"></div><div class="dock-sec"><div class="sec-title">Deine Rohstoffe</div><div class="hand">';
    h += RES.map(r => `<div class="rcard ${my.res[r] ? '' : 'zero'}" style="background:${RI[r].bg}" title="${RI[r].de}"><span class="cnt">${my.res[r]}</span><span class="ic">${RI[r].icon}</span><span class="lbl">${RI[r].de}</span></div>`).join('');
    h += '</div></div>';

    const groups = {};
    my.dev.forEach(d => { (groups[d.type] = groups[d.type] || { total: 0, playable: 0 }).total++; if (true) groups[d.type].playable++; });
    const canPlay = t => myTurn && !g.devPlayed && t !== 'vp' && groups[t].playable > 0 && (g.phase === 'main' || (t === 'knight' && g.phase === 'roll'));
    h += '<div class="divider"></div><div class="dock-sec"><div class="sec-title">Entwicklung</div><div class="devs">';
    h += Object.keys(groups).map(t => `<div class="dcard ${canPlay(t) ? 'playable' : ''}" ${canPlay(t) ? `data-a="playDev" data-v="${t}"` : ''} title="${DEV_INFO[t].de}: ${DEV_INFO[t].desc}${t !== 'vp' && !canPlay(t) ? ' (gerade nicht spielbar)' : ''}">
      <span class="cnt">${groups[t].total}</span><span class="ic">${DEV_INFO[t].icon}</span><span class="lbl">${DEV_INFO[t].de}</span></div>`).join('') || '<span class="muted">keine</span>';
    if (my.knights > 0) h += `<div class="dcard played" title="Ausgespielte Ritter – offen für alle sichtbar, zählen für die Rittermacht"><span class="cnt">${my.knights}</span><span class="ic">⚔️</span><span class="lbl">ausgespielt</span></div>`;
    h += '</div></div>';

    h += '<div class="divider"></div><div class="dock-sec grow"><div class="sec-title">Dein Vorrat – auf das Brett ziehen</div><div class="supply">';
    for (const kind of ['settlement', 'city', 'road', 'ship']) {
      const can = canPlaceKind(g, kind);
      const active = st.mode === kind || (g.phase === 'setup' && myTurn && ((g.setup.expect === 'settlement' && kind === 'settlement') || (g.setup.expect === 'route' && st.routeType === kind)));
      h += `<div class="piece ${can ? '' : 'off'} ${active ? 'active' : ''}" data-drag="${kind}" title="${PIECE_DE[kind]} – kostet ${E.fmtRes(E.COSTS[kind])}">
        ${pieceIcon(kind, my.color)}<span class="cnt">${my.left[kind]}×</span><span class="cost">${PIECE_DE[kind]}</span></div>`;
    }
    h += '</div></div>';

    if (myTurn && g.phase === 'main') {
      const movable = E.movableShips(g, me).length > 0;
      h += `<div class="divider"></div><div class="dock-sec actions-col"><div class="sec-title">Aktionen</div>
        <button class="btn" data-a="panel" data-v="trade">🤝 Handeln</button>
        <button class="btn" data-a="buyDev" ${E.hasRes(my.res, E.COSTS.dev) && g.devDeckCount > 0 ? '' : 'disabled'}>📜 Entwicklung kaufen</button>
        <button class="btn ${st.mode === 'moveShip' ? 'active' : ''}" data-a="moveShip" ${movable ? '' : 'disabled'}>⛵ Schiff versetzen</button></div>`;
    }
    el.innerHTML = h;
  }

  function lobbyDock(g) {
    const me = g.me, isHost = g.hostId === st.me.id, ed = st.ed;
    const hostName = esc((g.players.find(p => p.userId === g.hostId) || {}).name || 'Felix');
    let h = `<div class="dock-sec"><div class="sec-title">Spieler (${g.players.length}/4)</div><div class="lobby-players">
      ${g.players.map(p => `<div class="chip"><span class="avatar" style="background:${colorById(p.colorId)}">${esc(p.name[0])}</span><span class="nm">${esc(p.name)}${p.userId === g.hostId ? ' 👑' : ''}</span></div>`).join('')}</div>
      ${me < 0 && g.players.length < 4 ? '<button class="btn ok" data-a="join">Beitreten</button>' : ''}</div>`;
    if (me >= 0) {
      h += `<div class="divider"></div><div class="dock-sec"><div class="sec-title">Deine Farbe</div><div class="color-pick">
        ${E.COLORS.map(c => { const owner = g.players.find(p => p.colorId === c.id); const mine = owner && owner.userId === st.me.id;
          return `<button class="swatch-btn ${mine ? 'mine' : ''}" style="background:${c.hex}" data-a="color" data-v="${c.id}"
            title="${c.de}${owner ? ' – ' + esc(owner.name) : ''}" ${owner && !mine ? 'disabled' : ''}>${owner ? `<span class="who" style="color:${c.id === 'white' ? '#222' : '#fff'}">${esc(owner.name[0])}</span>` : ''}</button>`; }).join('')}</div>
        <div class="muted">${E.COLORS.map(c => c.de).join(' · ')}</div></div>`;
    }
    if (!isHost) return h + `<div class="divider"></div><div class="dock-sec grow"><div class="sec-title">Karte</div><div class="muted">${hostName} erstellt gerade die Karte – du siehst jede Änderung sofort. Ziel: ${g.settings.vpTarget} Siegpunkte.</div></div>`;
    if (ed.size === null) ed.size = g.settings.size;
    if (ed.islands === null) ed.islands = g.settings.islands;
    const missing = Object.values(g.map.hexes).filter(x => B.isProducing(x.t) && !x.n).length;
    const islands = B.computeIslands(g.map).sizes;
    const tools = [['swapTiles', '🔀 Felder tauschen'], ['swapNumbers', '🔢 Zahlen tauschen'], ['setTerrain', '🖌️ Feld malen'], ['setNumber', '#️⃣ Zahl setzen']];
    h += `<div class="divider"></div><div class="dock-sec"><div class="sec-title">Zufallskarte</div>
      <div class="row"><select data-bind="ed.size"><option value="4" ${ed.size === 4 ? 'selected' : ''}>Groß (4 Sp.)</option><option value="3" ${ed.size === 3 ? 'selected' : ''}>Klein (3 Sp.)</option></select>
      <select data-bind="ed.islands"><option value="2" ${ed.islands === 2 ? 'selected' : ''}>2 Inseln</option><option value="3" ${ed.islands === 3 ? 'selected' : ''}>3 Inseln</option></select></div>
      <div class="row"><button class="btn primary" data-a="regen">🎲 Neu generieren</button><button class="btn" data-a="harbors">⚓ Häfen neu</button></div>
      <div class="muted">${islands.length} Insel(n): ${islands.join(' / ')} Felder</div></div>
      <div class="divider"></div><div class="dock-sec grow"><div class="sec-title">Bearbeiten</div>
      <div class="palette">${tools.map(([k, l]) => `<button class="btn small ${ed.tool === k ? 'active' : ''}" data-a="tool" data-v="${k}">${l}</button>`).join('')}</div>
      ${ed.tool === 'setTerrain' ? `<div class="palette">${B.ALL_TERRAINS.map(t => `<button class="btn small ${ed.terrain === t ? 'active' : ''}" data-a="terrain" data-v="${t}">${TI_ICON[t]} ${TI[t]}</button>`).join('')}</div>` : ''}
      ${ed.tool === 'setNumber' ? `<div class="palette">${B.NUMBERS.map(n => `<button class="btn small ${ed.number === n ? 'active' : ''}" data-a="number" data-v="${n}" style="${n === 6 || n === 8 ? 'color:#ff7a7a' : ''}">${n}</button>`).join('')}<button class="btn small ${ed.number === null ? 'active' : ''}" data-a="number" data-v="">✖</button></div>` : ''}
      <div class="muted">${{ swapTiles: 'Zwei Felder anklicken → tauschen (mit Zahl).', swapNumbers: 'Zwei Rohstoff-Felder anklicken → nur Zahlen tauschen.', setTerrain: 'Feldtyp wählen, dann Felder anklicken.', setNumber: 'Zahl wählen, dann Rohstoff-Feld anklicken.' }[ed.tool]}
      ${missing ? `<span style="color:var(--err)"> · ${missing} Feld(er) ohne Zahl</span>` : ''}</div></div>
      <div class="divider"></div><div class="dock-sec"><div class="sec-title">Start</div>
      <div class="row">Ziel <button class="btn small" data-a="vp" data-d="-1">−</button><b>${g.settings.vpTarget} ⭐</b><button class="btn small" data-a="vp" data-d="1">+</button></div>
      <button class="btn ok" data-a="start" ${g.players.length < 2 ? 'disabled' : ''}>▶ Spiel starten (${g.players.length})</button></div>`;
    return h;
  }

  // ---------- Overlays ----------
  function counterRow(path, max) {
    const obj = getPath(path);
    return `<div class="res-counters">${RES.map(r => `<div class="rc">
      <div class="rc-icon" style="background:${RI[r].bg}" title="${RI[r].de}">${RI[r].icon}</div>
      <div class="rc-ctrl"><button data-a="cnt" data-path="${path}" data-res="${r}" data-d="-1" ${obj[r] <= 0 ? 'disabled' : ''}>−</button>
      <b>${obj[r]}</b><button data-a="cnt" data-path="${path}" data-res="${r}" data-d="1" ${max && obj[r] >= max[r] ? 'disabled' : ''}>+</button></div></div>`).join('')}</div>`;
  }
  const modal = (inner, opts = {}) => `<div class="overlay-back" ${opts.close ? `data-a="${opts.close}"` : ''}><div class="modal card ${opts.wide ? 'wide' : ''}" data-stop="1">
    ${opts.close ? `<button class="btn icon close" data-a="${opts.close}">✕</button>` : ''}${inner}</div></div>`;

  // Pflicht-Aufforderungen (Abwerfen, Gold, Tauschangebot, Fortschrittskarten)
  function promptModal(g) {
    const me = g.me, my = me >= 0 ? g.players[me] : null;
    if (g.status !== 'playing' || !my) return ['', ''];
    if (g.phase === 'discard' && g.discards[me]) {
      const need = g.discards[me], sel = E.sumRes(st.discard);
      return ['discard', modal(`<h3>Eine 7! Wirf ${need} Karten ab</h3><div class="muted">${sel} von ${need} gewählt</div>${counterRow('discard', my.res)}
        <button class="btn primary big" data-a="discard" ${sel !== need ? 'disabled' : ''}>Abwerfen</button>`)];
    }
    if (g.phase === 'gold' && g.goldPending[me]) {
      const need = g.goldPending[me], sel = E.sumRes(st.gold), max = {};
      RES.forEach(r => { max[r] = need; });
      return ['gold', modal(`<h3>💰 Goldfluss: Wähle ${need} Rohstoff(e)</h3><div class="muted">${sel} von ${need} gewählt</div>${counterRow('gold', max)}
        <button class="btn primary big" data-a="gold" ${sel !== need ? 'disabled' : ''}>Nehmen</button>`)];
    }
    const t = g.trade;
    if (t && t.from !== me && (t.to === null || t.to === me) && !t.declined.includes(me) && g.phase === 'main') {
      const canPay = E.hasRes(my.res, t.get);
      return ['offer', modal(`<h3>🤝 Tauschangebot von ${esc(g.players[t.from].name)}</h3>
        <div class="trade-line"><span class="muted">Du bekommst</span><span class="cost-res">${miniCards(t.give)}</span></div>
        <div class="trade-line"><span class="muted">Du gibst</span><span class="cost-res">${miniCards(t.get)}</span></div>
        <div class="row" style="margin-top:12px"><button class="btn ok" data-a="accept" ${canPay ? '' : 'disabled'}>Annehmen</button><button class="btn danger" data-a="decline">Ablehnen</button>
        ${canPay ? '' : '<span class="muted">Dir fehlen Karten.</span>'}</div>`)];
    }
    if (st.devUI === 'yearOfPlenty') {
      const opts = sel => RES.map(r => `<option value="${r}" ${sel === r ? 'selected' : ''}>${RI[r].icon} ${RI[r].de}</option>`).join('');
      return ['yop', modal(`<h3>🎁 Erfindung: 2 Rohstoffe wählen</h3><div class="row"><select data-bind="yop.0">${opts(st.yop[0])}</select><select data-bind="yop.1">${opts(st.yop[1])}</select></div>
        <button class="btn primary big" style="margin-top:12px" data-a="confirmYop">Nehmen</button>`, { close: 'cancelDev' })];
    }
    if (st.devUI === 'monopoly') {
      return ['mono', modal(`<h3>💎 Monopol: Welcher Rohstoff?</h3><select data-bind="mono">${RES.map(r => `<option value="${r}" ${st.mono === r ? 'selected' : ''}>${RI[r].icon} ${RI[r].de}</option>`).join('')}</select>
        <button class="btn primary big" style="margin-top:12px" data-a="confirmMono">Ausspielen</button>`, { close: 'cancelDev' })];
    }
    if (st.devUI === 'knight' || st.devUI === 'roadBuilding') {
      const d = DEV_INFO[st.devUI];
      return ['dev-' + st.devUI, modal(`<h3>${d.icon} ${d.de} ausspielen?</h3><p class="muted">${d.desc}.<br>Das lässt sich danach nicht rückgängig machen.</p>
        <div class="row" style="margin-top:12px"><button class="btn primary big" data-a="confirmDev" data-v="${st.devUI}">Ja, ausspielen</button><button class="btn" data-a="cancelDev">Abbrechen</button></div>`, { close: 'cancelDev' })];
    }
    return ['', ''];
  }

  function popupHtml(g, p) {
    if (p.type === 'roll') {
      const lr = p.data, anyGain = lr.gains.some(r => E.sumRes(r) > 0) || Object.keys(lr.gold || {}).length;
      let body = `<div class="row" style="justify-content:center;gap:14px;margin:6px 0 10px">${dieFace(lr.dice[0], false, true)}${dieFace(lr.dice[1], true, true)}<div class="dice-sum big-sum">${lr.sum}</div></div>
        <div class="center muted">${nameOf(g, lr.by)} ${lr.by === g.me ? 'hast' : 'hat'} gewürfelt</div>`;
      if (lr.sum === 7) body += `<div class="gain-row"><span style="font-size:22px">🥷</span><div><b>Räuber!</b> Wer mehr als 7 Karten hat, wirft die Hälfte ab. Danach wird Räuber oder Pirat versetzt.</div></div>`;
      else {
        body += g.players.map((pl, i) => {
          const gain = lr.gains[i] || {}, gold = (lr.gold || {})[i], has = E.sumRes(gain) > 0 || gold;
          return `<div class="gain-row ${has ? '' : 'none'}"><span class="dot" style="background:${pl.color}"></span><span class="nm">${esc(pl.name)}${i === g.me ? ' (du)' : ''}</span>
            <div class="cards">${has ? miniCards(gain) + (gold ? `<span class="mini-card" style="background:linear-gradient(160deg,#ffe58a,#c8941a)">💰</span><span class="muted">×${gold} Gold – frei wählbar</span>` : '') : '<span class="muted">bekommt nichts</span>'}</div></div>`;
        }).join('');
        if (!anyGain) body += '<div class="center muted" style="margin-top:8px">Niemand bekommt etwas.</div>';
      }
      return body;
    }
    if (p.type === 'steal') {
      const s = p.data, piece = s.piece === 'pirate' ? 'Pirat' : 'Räuber', icon = s.piece === 'pirate' ? '🏴‍☠️' : '🥷';
      let msg;
      if (s.victim === null) msg = `${nameOf(g, s.thief)} ${s.thief === g.me ? 'hast' : 'hat'} den ${piece}en versetzt – dort war niemand zum Ziehen.`;
      else if (s.thief === g.me) msg = s.res ? `Du hast bei <b>${esc(g.players[s.victim].name)}</b> diese Karte gezogen:` : `<b>${esc(g.players[s.victim].name)}</b> hatte keine Karten – du bekommst nichts.`;
      else if (s.victim === g.me) msg = s.res ? `<b>${esc(g.players[s.thief].name)}</b> hat dir diese Karte gezogen:` : `<b>${esc(g.players[s.thief].name)}</b> wollte bei dir ziehen – du hattest keine Karten.`;
      else msg = `<b>${esc(g.players[s.thief].name)}</b> hat bei <b>${esc(g.players[s.victim].name)}</b> ${s.hadCard ? 'eine Karte gezogen.' : 'gezogen – aber keine Karte bekommen.'}`;
      const card = s.res ? `<div class="row" style="justify-content:center;margin-top:12px"><div class="rcard big-card" style="background:${RI[s.res].bg}"><span class="ic">${RI[s.res].icon}</span><span class="lbl">${RI[s.res].de}</span></div></div>` : '';
      return `<h3>${icon} ${piece}</h3><div>${msg}</div>${card}`;
    }
    if (p.type === 'dev') {
      const d = p.data, who = d.by === g.me ? 'Du' : esc(g.players[d.by].name), info = DEV_INFO[d.card];
      let what = '';
      if (d.card === 'knight') what = `${who} ${d.by === g.me ? 'versetzt' : 'versetzt'} jetzt den Räuber oder Piraten und zieht eine Karte. <span class="muted">(Ritter gespielt: ${d.knights})</span>`;
      else if (d.card === 'roadBuilding') what = `${who} ${d.by === g.me ? 'baust' : 'baut'} jetzt 2 Straßen oder Schiffe gratis. Der Zug endet erst, wenn beide gebaut sind.`;
      else if (d.card === 'yearOfPlenty') what = `${who} ${d.by === g.me ? 'nimmst' : 'nimmt'} sich 2 Rohstoffe von der Bank:<div class="cost-res" style="margin-top:8px">${miniCards(d.res)}</div>`;
      else if (d.card === 'monopoly') {
        const mine = d.lost && d.lost[g.me] ? `<div style="margin-top:8px"><b>Du</b> gibst ${d.lost[g.me]}× ${RI[d.res].de} ab.</div>` : '';
        what = `${who} ${d.by === g.me ? 'wählst' : 'wählt'} Monopol auf <b>${RI[d.res].de}</b> und ${d.by === g.me ? 'erhältst' : 'erhält'} <b>${d.total}</b> Karte(n) von den anderen.${mine}`;
      }
      return `<h3>${info.icon} ${info.de} ausgespielt</h3><div><b>${who}</b> ${d.by === g.me ? 'spielst' : 'spielt'} die Karte <b>${info.de}</b>.</div><div style="margin-top:8px">${what}</div>`;
    }
    if (p.type === 'trade') {
      const t = p.data;
      return `<h3>🤝 Handel abgeschlossen</h3>
        <div><b>${nameOf(g, t.to)}</b> ${t.to === g.me ? 'hast' : 'hat'} das Angebot von <b>${t.from === g.me ? 'dir' : esc(g.players[t.from].name)}</b> angenommen.</div>
        <div class="trade-line"><span class="muted">${esc(g.players[t.from].name)} gibt</span><span class="cost-res">${miniCards(t.give)}</span></div>
        <div class="trade-line"><span class="muted">${esc(g.players[t.to].name)} gibt</span><span class="cost-res">${miniCards(t.get)}</span></div>`;
    }
    return '';
  }

  function renderOverlay() {
    const g = st.g, el = document.getElementById('overlay');
    if (!el || !g) return;
    let h = '', key = '';
    if (st.panel === 'log') {
      key = 'log';
      h += `<div class="drawer card"><button class="btn icon close" data-a="closePanel">✕</button><h3>📜 Spielverlauf</h3>
        <div class="log">${g.log.slice(-150).reverse().map(l => `<div>${esc(l.msg)}</div>`).join('')}</div></div>`;
    } else if (st.panel === 'costs') {
      key = 'costs';
      const color = g.me >= 0 && g.players[g.me].color ? g.players[g.me].color : colorById(g.players[0].colorId);
      const row = (icon, name, cost, info) => `<div class="cost-row">${icon}<div class="grow"><div class="name">${name}</div><div class="muted">${info}</div></div><div class="cost-res">${miniCards(cost)}</div></div>`;
      h += `<div class="drawer card"><button class="btn icon close" data-a="closePanel">✕</button><h3>🧾 Baukosten</h3>
        ${row(pieceIcon('road', color), 'Straße', E.COSTS.road, '0 Siegpunkte')}
        ${row(pieceIcon('ship', color), 'Schiff', E.COSTS.ship, '0 Siegpunkte')}
        ${row(pieceIcon('settlement', color), 'Siedlung', E.COSTS.settlement, '1 Siegpunkt')}
        ${row(pieceIcon('city', color), 'Stadt', E.COSTS.city, '2 Siegpunkte (ersetzt eine Siedlung)')}
        ${row('<svg viewBox="-24 -30 48 48"><text x="0" y="0" font-size="30" text-anchor="middle">📜</text></svg>', 'Entwicklungskarte', E.COSTS.dev, 'Ritter, Siegpunkt, Fortschritt')}
        <div class="muted" style="margin-top:10px">Längste Handelsstraße (ab 5) +2 · Größte Rittermacht (ab 3) +2 · Neue Insel besiedeln +${E.ISLAND_BONUS} · Ziel: ${g.settings.vpTarget} ⭐</div></div>`;
    } else if (st.panel === 'stats') { key = 'stats'; h += statsPage(g); }
    else if (st.panel === 'trade' && myTurnNow(g) && g.phase === 'main') { key = 'trade'; h += tradeModal(g); }

    if (g.status !== 'lobby') {
      if (st.rolling) {
        key += '|rolling';
        h += modal(`<div class="row" id="rollDice" style="justify-content:center;gap:14px;margin:10px 0">${dieFace(3, false, true, true)}${dieFace(5, true, true, true)}</div>
          <div class="center muted">${esc(st.rolling.by)} würfelt …</div>`);
      } else if (st.popups.length) {
        const p = st.popups[0];
        key += '|pop' + p.type + (p.data.id || '');
        h += modal(popupHtml(g, p) + '<button class="btn primary big" style="margin-top:14px" data-a="closePopup">OK</button>', { close: 'closePopup' });
      } else {
        const [pk, ph] = promptModal(g);
        if (pk) { key += '|' + pk; h += ph; }
      }
    }
    el.innerHTML = h;
    // gleiches Fenster wie vorher -> keine erneute Einblend-Animation
    el.classList.toggle('still', key !== '' && key === st.overlayKey);
    st.overlayKey = key;
  }

  function statsPage(g) {
    const stats = g.diceStats || {}, total = g.rollCount || 0;
    const ways = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
    let max = 1;
    for (let i = 2; i <= 12; i++) max = Math.max(max, stats[i] || 0, total * ways[i] / 36);
    let bars = '';
    for (let i = 2; i <= 12; i++) {
      const v = stats[i] || 0, exp = total * ways[i] / 36;
      bars += `<div class="bar-col" title="${i}: ${v}× (erwartet ≈ ${exp.toFixed(1)})"><div class="bar-area">
        <div class="bar ${i === 7 ? 'seven' : ''}" style="height:${(v / max) * 100}%"><span class="val">${v}</span></div>
        ${total ? `<div class="exp" style="bottom:${(exp / max) * 100}%"></div>` : ''}</div><span class="num">${i}</span></div>`;
    }
    let table = '';
    if (g.diceStatsBy) {
      table = `<table class="st"><tr><th>Spieler</th>${[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => `<th>${i}</th>`).join('')}<th>Σ</th></tr>
        ${g.players.map((p, idx) => { const s = g.diceStatsBy[idx] || {}; let sum = 0;
          const cells = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => { sum += s[i] || 0; return `<td>${s[i] || 0}</td>`; }).join('');
          return `<tr><td><span style="color:${p.color}">●</span> ${esc(p.name)}</td>${cells}<td><b>${sum}</b></td></tr>`; }).join('')}</table>`;
    }
    return modal(`<h3>📊 Würfelstatistik · ${total} Würfe</h3><div class="stats-chart">${bars}</div>
      <div class="muted" style="margin-top:6px">Balken = tatsächlich gewürfelt · gestrichelt = statistisch erwartet</div>${table}`, { close: 'closePanel', wide: true });
  }

  function tradeModal(g) {
    const me = g.me, my = g.players[me];
    const rateOpts = RES.map(r => `<option value="${r}" ${st.bank.give === r ? 'selected' : ''}>${RI[r].icon} ${RI[r].de} (${E.tradeRate(g, me, r)}:1)</option>`).join('');
    const getOpts = RES.map(r => `<option value="${r}" ${st.bank.get === r ? 'selected' : ''}>${RI[r].icon} ${RI[r].de}</option>`).join('');
    const rate = E.tradeRate(g, me, st.bank.give);
    let h = `<h3>🤝 Handeln</h3>
      <div class="sec-title" style="margin-top:12px">Mit der Bank / Hafen</div>
      <div class="row"><select data-bind="bank.give">${rateOpts}</select> → <select data-bind="bank.get">${getOpts}</select>
      <button class="btn" data-a="bankTrade" ${my.res[st.bank.give] >= rate && st.bank.give !== st.bank.get ? '' : 'disabled'}>Tauschen</button></div>
      <div class="sec-title" style="margin-top:18px">Mit Mitspielern</div>`;
    const t = g.trade;
    if (t && t.from === me) {
      h += `<div>Offenes Angebot an <b>${t.to === null ? 'alle' : esc(g.players[t.to].name)}</b></div>
        <div class="trade-line"><span class="muted">Du gibst</span>${miniCards(t.give)}</div><div class="trade-line"><span class="muted">Du bekommst</span>${miniCards(t.get)}</div>
        <div class="muted">${t.declined.length ? 'Abgelehnt von: ' + t.declined.map(i => esc(g.players[i].name)).join(', ') : 'Warte auf Antwort …'}</div>
        <button class="btn small" data-a="cancelTrade" style="margin-top:6px">Zurückziehen</button>`;
    } else {
      const others = g.players.map((p, i) => i).filter(i => i !== me);
      const ok = E.sumRes(st.trade.give) > 0 && E.sumRes(st.trade.get) > 0 && E.hasRes(my.res, st.trade.give);
      h += `<div class="muted">Vorher absprechen – hier nur bestätigen. Der Tausch wird danach allen angezeigt.</div>
        <div class="row" style="margin-top:8px">An: <select data-bind="trade.to"><option value="all">alle</option>${others.map(i => `<option value="${i}" ${String(st.trade.to) === String(i) ? 'selected' : ''}>${esc(g.players[i].name)}</option>`).join('')}</select></div>
        <div class="muted" style="margin-top:8px">Ich gebe:</div>${counterRow('trade.give', my.res)}
        <div class="muted">Ich bekomme:</div>${counterRow('trade.get', null)}
        <button class="btn primary" data-a="propose" ${ok ? '' : 'disabled'}>Angebot senden</button>`;
    }
    return modal(h, { close: 'closePanel' });
  }

  // ---------- Formular-Helfer & Klicks ----------
  function getPath(path) { return path.split('.').reduce((o, k) => o[k], st); }
  function setPath(path, val) { const parts = path.split('.'), last = parts.pop(); parts.reduce((o, k) => o[k], st)[last] = val; }

  function onUiChange(e) {
    const el = e.target.closest('[data-bind]');
    if (!el) return;
    let val = el.value;
    if (el.dataset.bind === 'ed.size' || el.dataset.bind === 'ed.islands') val = Number(val);
    setPath(el.dataset.bind, val);
    if (el.closest('#overlay')) renderOverlay(); else render();
  }

  function onUiClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    // Klick in ein Fenster hinein schließt es nicht (nur der Hintergrund)
    if (b.classList.contains('overlay-back') && e.target.closest('[data-stop]')) return;
    if (b.tagName === 'A') e.preventDefault();
    const a = b.dataset.a, v = b.dataset.v, g = st.g;
    switch (a) {
      case 'panel': st.panel = st.panel === v ? null : v; renderOverlay(); break;
      case 'closePanel': st.panel = null; renderOverlay(); break;
      case 'closePopup': st.popups.shift(); renderOverlay(); break;
      case 'join': socket.emit('game:join', { id: g.id }, res => { if (res && res.error) toast(res.error, 'error'); }); break;
      case 'color': act({ type: 'color', color: v }); break;
      case 'regen': st.ed.sel = null; act({ type: 'regenerate', size: st.ed.size, islands: st.ed.islands }); break;
      case 'harbors': act({ type: 'harbors' }); break;
      case 'tool': st.ed.tool = v; st.ed.sel = null; render(); break;
      case 'terrain': st.ed.terrain = v; renderDock(); break;
      case 'number': st.ed.number = v === '' ? null : Number(v); renderDock(); break;
      case 'vp': act({ type: 'settings', vpTarget: g.settings.vpTarget + Number(b.dataset.d) }); break;
      case 'start': act({ type: 'start' }); break;
      case 'route': st.routeType = v; render(); break;
      case 'roll': act({ type: 'roll' }); break;
      case 'undo': act({ type: 'undo' }); break;
      case 'moveShip': st.mode = st.mode === 'moveShip' ? null : 'moveShip'; st.moveFrom = null; render(); break;
      case 'cancelMode': st.mode = null; st.moveFrom = null; render(); break;
      case 'buyDev': act({ type: 'buyDev' }); break;
      case 'endTurn': act({ type: 'endTurn' }); break;
      case 'steal': act({ type: 'steal', target: v === '' ? null : Number(v) }); break;
      case 'playDev':
        st.devUI = v; renderOverlay(); // immer erst eine Rückfrage – nie versehentlich ausspielen
        break;
      case 'confirmYop': act({ type: 'playDev', card: 'yearOfPlenty', res1: st.yop[0], res2: st.yop[1] }, ok => { if (ok) { st.devUI = null; renderOverlay(); } }); break;
      case 'confirmMono': act({ type: 'playDev', card: 'monopoly', res: st.mono }, ok => { if (ok) { st.devUI = null; renderOverlay(); } }); break;
      case 'confirmDev': act({ type: 'playDev', card: v }, ok => { if (ok) { st.devUI = null; renderOverlay(); } }); break;
      case 'cancelDev': st.devUI = null; renderOverlay(); break;
      case 'cnt': { const obj = getPath(b.dataset.path); obj[b.dataset.res] = Math.max(0, obj[b.dataset.res] + Number(b.dataset.d)); renderOverlay(); break; }
      case 'discard': act({ type: 'discard', res: st.discard }, ok => { if (ok) st.discard = E.emptyRes(); }); break;
      case 'gold': act({ type: 'gold', res: st.gold }, ok => { if (ok) st.gold = E.emptyRes(); }); break;
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
