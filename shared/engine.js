// Spielregeln (Basis + Seefahrer). Der Server führt Aktionen aus, der Browser nutzt die
// Legalitäts-Funktionen zum Hervorheben gültiger Bauplätze.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./board'));
  else root.ArchipelEngine = factory(root.ArchipelBoard);
})(typeof self !== 'undefined' ? self : this, function (B) {
  'use strict';

  const RES = B.RESOURCES;
  const RES_DE = { wood: 'Holz', brick: 'Lehm', sheep: 'Wolle', wheat: 'Getreide', ore: 'Erz' };
  const COSTS = {
    road: { wood: 1, brick: 1 },
    ship: { wood: 1, sheep: 1 },
    settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
    city: { wheat: 2, ore: 3 },
    dev: { sheep: 1, wheat: 1, ore: 1 },
  };
  const PIECE_DE = { road: 'Straße', ship: 'Schiff', settlement: 'Siedlung', city: 'Stadt' };
  const PIECES_LEFT_DE = { road: 'Straßen', ship: 'Schiffe', settlement: 'Siedlungen', city: 'Städte' };
  const DEV_DE = { knight: 'Ritter', vp: 'Siegpunkt', roadBuilding: 'Straßenbau', yearOfPlenty: 'Erfindung', monopoly: 'Monopol' };
  const COLORS = [
    { id: 'red', hex: '#c62828' }, { id: 'blue', hex: '#1565c0' },
    { id: 'orange', hex: '#ef6c00' }, { id: 'white', hex: '#f4f4f4' },
  ];
  const DEV_DECK = [].concat(
    Array(14).fill('knight'), Array(5).fill('vp'),
    Array(2).fill('roadBuilding'), Array(2).fill('yearOfPlenty'), Array(2).fill('monopoly'));
  const ISLAND_BONUS = 2;

  class GameError extends Error {}
  const fail = m => { throw new GameError(m); };

  const emptyRes = () => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
  const sumRes = r => (r ? RES.reduce((s, k) => s + (r[k] || 0), 0) : 0);
  const hasRes = (have, need) => RES.every(k => (have[k] || 0) >= (need[k] || 0));
  function transfer(from, to, res) {
    for (const k of RES) { const n = res[k] || 0; if (n) { from[k] -= n; to[k] += n; } }
  }
  function fmtRes(res) {
    const parts = RES.filter(k => res[k]).map(k => res[k] + ' ' + RES_DE[k]);
    return parts.length ? parts.join(', ') : 'nichts';
  }
  function cleanRes(obj) {
    const r = emptyRes();
    if (obj && typeof obj === 'object') {
      for (const k of RES) {
        const n = Math.floor(Number(obj[k]) || 0);
        if (n < 0) fail('Ungültige Anzahl.');
        r[k] = n;
      }
    }
    return r;
  }

  const name = (g, i) => (g.players[i] ? g.players[i].name : '?');
  function log(g, msg) {
    g.seq = (g.seq || 0) + 1;
    g.log.push({ n: g.seq, msg, t: Date.now() });
    if (g.log.length > 300) g.log.splice(0, g.log.length - 300);
  }
  function mark(g, kind, key) { g.markSeq = (g.markSeq || 0) + 1; g.last = { kind, key, id: g.markSeq }; }

  // ---------- Geometrie-Helfer ----------
  const graph = g => B.buildGraph(g.map.radius);
  const hexT = (g, k) => (g.map.hexes[k] ? g.map.hexes[k].t : null);
  const bAt = (g, vk) => g.pieces.v[vk];
  const eAt = (g, ek) => g.pieces.e[ek];
  const edgeTouchesLand = (g, ek) => graph(g).edges[ek].hexes.some(h => B.isLand(hexT(g, h)));
  function edgeTouchesSea(g, ek) {
    const e = graph(g).edges[ek];
    return e.hexes.length < 2 || e.hexes.some(h => hexT(g, h) === 'sea');
  }
  const edgeNearPirate = (g, ek) => !!g.map.pirate && graph(g).edges[ek].hexes.includes(g.map.pirate);
  const vertexTouchesLand = (g, vk) => graph(g).vertices[vk].hexes.some(h => B.isLand(hexT(g, h)));
  function distanceOk(g, vk) {
    if (bAt(g, vk)) return false;
    return graph(g).vertices[vk].adj.every(a => !bAt(g, a));
  }
  function vertexIsland(g, vk) {
    for (const h of graph(g).vertices[vk].hexes) {
      if (g.islandOf && g.islandOf[h] !== undefined) return g.islandOf[h];
    }
    return null;
  }

  // ---------- Legalität ----------
  function ownRouteAt(g, vk, p, type) {
    return graph(g).vertices[vk].edges.some(ek => { const x = eAt(g, ek); return x && x.owner === p && x.type === type; });
  }
  // Straßen verbinden nur mit Straßen, Schiffe nur mit Schiffen – Übergang nur über eigene Siedlung/Stadt.
  function canConnect(g, ek, p, type) {
    const e = graph(g).edges[ek];
    return [e.a, e.b].some(v => {
      const b = bAt(g, v);
      if (b) return b.owner === p;
      return ownRouteAt(g, v, p, type);
    });
  }
  function legalRoad(g, p, ek) {
    if (!graph(g).edges[ek] || eAt(g, ek) || !edgeTouchesLand(g, ek)) return false;
    return canConnect(g, ek, p, 'road');
  }
  function legalShip(g, p, ek) {
    if (!graph(g).edges[ek] || eAt(g, ek) || !edgeTouchesSea(g, ek) || edgeNearPirate(g, ek)) return false;
    return canConnect(g, ek, p, 'ship');
  }
  function legalSettlement(g, p, vk) {
    const V = graph(g).vertices[vk];
    if (!V || !distanceOk(g, vk) || !vertexTouchesLand(g, vk)) return false;
    return V.edges.some(ek => { const x = eAt(g, ek); return x && x.owner === p; });
  }
  function legalSetupSettlement(g, vk) {
    const V = graph(g).vertices[vk];
    if (!V || !distanceOk(g, vk) || !vertexTouchesLand(g, vk)) return false;
    return V.hexes.filter(h => B.isLand(hexT(g, h))).every(h => g.islandOf[h] === g.startIsland);
  }
  function legalSetupRoute(g, ek, type) {
    const e = graph(g).edges[ek];
    if (!e || eAt(g, ek) || !g.setup) return false;
    const lv = g.setup.lastVertex;
    if (e.a !== lv && e.b !== lv) return false;
    return type === 'road' ? edgeTouchesLand(g, ek) : (edgeTouchesSea(g, ek) && !edgeNearPirate(g, ek));
  }
  function legalCity(g, p, vk) { const b = bAt(g, vk); return !!b && b.owner === p && b.type === 'settlement'; }

  function shipIsOpen(g, p, ek) {
    const e = graph(g).edges[ek];
    return [e.a, e.b].some(v => {
      const b = bAt(g, v);
      if (b && b.owner === p) return false;
      return !graph(g).vertices[v].edges.some(x => {
        if (x === ek) return false;
        const s = eAt(g, x);
        return s && s.owner === p && s.type === 'ship';
      });
    });
  }
  function movableShips(g, p) {
    if (g.shipMoved) return [];
    return Object.keys(g.pieces.e).filter(ek => {
      const s = g.pieces.e[ek];
      return s.owner === p && s.type === 'ship' && s.turn !== g.turn && !edgeNearPirate(g, ek) && shipIsOpen(g, p, ek);
    });
  }
  function shipMoveTargets(g, p, from) {
    const s = g.pieces.e[from];
    if (!s) return [];
    delete g.pieces.e[from];
    try { return Object.keys(graph(g).edges).filter(ek => ek !== from && legalShip(g, p, ek)); }
    finally { g.pieces.e[from] = s; }
  }

  function legalSpots(g, p, kind) {
    const G = graph(g);
    if (g.phase === 'setup') {
      if (kind === 'settlement') return Object.keys(G.vertices).filter(v => legalSetupSettlement(g, v));
      if (kind === 'road' || kind === 'ship') return Object.keys(G.edges).filter(e => legalSetupRoute(g, e, kind));
      return [];
    }
    switch (kind) {
      case 'road': return Object.keys(G.edges).filter(e => legalRoad(g, p, e));
      case 'ship': return Object.keys(G.edges).filter(e => legalShip(g, p, e));
      case 'settlement': return Object.keys(G.vertices).filter(v => legalSettlement(g, p, v));
      case 'city': return Object.keys(g.pieces.v).filter(v => legalCity(g, p, v));
      default: return [];
    }
  }

  // ---------- Längste Handelsstraße (Straßen + Schiffe) ----------
  function longestRoute(g, p) {
    const G = graph(g);
    const mine = Object.keys(g.pieces.e).filter(ek => g.pieces.e[ek].owner === p);
    let best = 0;
    const visited = new Set();
    function dfs(v, lastType, len) {
      if (len > best) best = len;
      const b = bAt(g, v);
      if (b && b.owner !== p) return; // fremde Siedlung unterbricht
      for (const ek of G.vertices[v].edges) {
        const piece = g.pieces.e[ek];
        if (!piece || piece.owner !== p || visited.has(ek)) continue;
        if (piece.type !== lastType && !(b && b.owner === p)) continue;
        visited.add(ek);
        const e = G.edges[ek];
        dfs(e.a === v ? e.b : e.a, piece.type, len + 1);
        visited.delete(ek);
      }
    }
    for (const ek of mine) {
      const e = G.edges[ek], t = g.pieces.e[ek].type;
      visited.add(ek);
      dfs(e.a, t, 1);
      dfs(e.b, t, 1);
      visited.delete(ek);
    }
    return best;
  }

  function updateLongestRoad(g) {
    const L = g.players.map((_, i) => longestRoute(g, i));
    g.players.forEach((pl, i) => { pl.routeLen = L[i]; });
    const best = Math.max(...L), h = g.longestRoad;
    let nh;
    if (h !== null && L[h] === best && best >= 5) nh = h;
    else if (best >= 5 && L.filter(x => x === best).length === 1) nh = L.indexOf(best);
    else nh = null;
    if (nh !== h) {
      g.longestRoad = nh;
      log(g, nh === null ? 'Die längste Handelsstraße gehört gerade niemandem.'
        : `🛣️ ${name(g, nh)} hat jetzt die längste Handelsstraße (${best}).`);
    }
  }

  function updateLargestArmy(g, p) {
    const k = g.players[p].knights, h = g.largestArmy;
    if (k >= 3 && h !== p && (h === null || k > g.players[h].knights)) {
      g.largestArmy = p;
      log(g, `⚔️ ${name(g, p)} hat jetzt die größte Rittermacht (${k}).`);
    }
  }

  function vp(g, p, includeHidden) {
    let v = 0;
    for (const vk in g.pieces.v) { const b = g.pieces.v[vk]; if (b.owner === p) v += b.type === 'city' ? 2 : 1; }
    if (g.longestRoad === p) v += 2;
    if (g.largestArmy === p) v += 2;
    v += ISLAND_BONUS * (g.players[p].bonusIslands || []).length;
    if (includeHidden && g.players[p].dev) v += g.players[p].dev.filter(d => d.type === 'vp').length;
    return v;
  }

  function tradeRate(g, p, r) {
    let rate = 4;
    const G = graph(g);
    for (const h of g.map.harbors) {
      const e = G.edges[h.edge];
      if (!e) continue;
      const own = [e.a, e.b].some(v => { const b = bAt(g, v); return b && b.owner === p; });
      if (!own) continue;
      if (h.type === 'any') rate = Math.min(rate, 3);
      else if (h.type === r) rate = 2;
    }
    return rate;
  }

  // ---------- Spiel anlegen / Lobby ----------
  function createGame({ id, name: gameName, host, size, islands }) {
    size = size === 3 ? 3 : 4;
    islands = islands === 3 ? 3 : 2;
    const g = {
      id, name: gameName || 'Neue Runde', hostId: host.id, status: 'lobby', createdAt: Date.now(),
      settings: { size, islands, vpTarget: 13 },
      map: B.generateMap(size, islands), players: [], seq: 0, log: [],
    };
    addPlayer(g, host);
    return g;
  }

  function addPlayer(g, user) {
    if (g.players.some(p => p.userId === user.id)) return;
    if (g.status !== 'lobby') fail('Das Spiel läuft bereits.');
    if (g.players.length >= 4) fail('Das Spiel ist voll (max. 4 Spieler).');
    g.players.push({ userId: user.id, name: user.name });
    log(g, `👋 ${user.name} ist dem Spiel beigetreten.`);
  }

  function startGame(g, userId) {
    if (g.hostId !== userId) fail('Nur der Ersteller kann das Spiel starten.');
    if (g.players.length < 2) fail('Mindestens 2 Spieler nötig.');
    const missing = Object.values(g.map.hexes).filter(h => B.isProducing(h.t) && !h.n).length;
    if (missing) fail(`${missing} Rohstoff-Feld(er) haben noch keine Zahl.`);
    const isl = B.computeIslands(g.map);
    if (!isl.sizes.length) fail('Die Karte hat kein Land.');
    g.islandOf = isl.islandOf;
    g.islandCount = isl.sizes.length;
    g.startIsland = isl.sizes.indexOf(Math.max(...isl.sizes));
    B.shuffle(g.players);
    g.players = g.players.map((p, i) => ({
      userId: p.userId, name: p.name, color: COLORS[i].hex, colorId: COLORS[i].id,
      res: emptyRes(), dev: [], knights: 0, routeLen: 0, homeIslands: [], bonusIslands: [],
      left: { road: 15, ship: 15, settlement: 5, city: 4 },
    }));
    g.pieces = { v: {}, e: {} };
    g.bank = { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 };
    g.devDeck = B.shuffle(DEV_DECK.slice());
    g.diceStats = {};
    for (let i = 2; i <= 12; i++) g.diceStats[i] = 0;
    g.rollCount = 0;
    g.dice = null;
    const order = g.players.map((_, i) => i);
    g.setup = { order: order.concat(order.slice().reverse()), step: 0, expect: 'settlement', lastVertex: null };
    Object.assign(g, {
      current: 0, turn: 0, phase: 'setup', status: 'playing', longestRoad: null, largestArmy: null,
      trade: null, devPlayed: false, shipMoved: false, freeRoads: 0, discards: {}, goldPending: {},
      stealFrom: [], returnPhase: null, winner: null, last: null,
    });
    log(g, `🚩 Das Spiel beginnt! Reihenfolge: ${g.players.map(p => p.name).join(' → ')}.`);
    log(g, `Aufbau: ${name(g, 0)} setzt die erste Siedlung (nur auf der Startinsel).`);
  }

  function lobbyAction(g, userId, p, a) {
    if (p < 0) fail('Tritt dem Spiel zuerst bei.');
    const m = g.map, pn = name(g, p);
    const two = () => {
      const A = m.hexes[a.a], H = m.hexes[a.b];
      if (!A || !H || a.a === a.b) fail('Ungültige Felder.');
      return [A, H];
    };
    switch (a.type) {
      case 'regenerate': {
        const size = Number(a.size) === 3 ? 3 : 4, islands = Number(a.islands) === 3 ? 3 : 2;
        g.settings.size = size; g.settings.islands = islands;
        g.map = B.generateMap(size, islands);
        log(g, `🎲 ${pn} hat eine neue Zufallskarte erzeugt (${size}-Spieler-Feld, ${islands} Inseln).`);
        break;
      }
      case 'swapTiles': {
        const [A, H] = two();
        [A.t, H.t] = [H.t, A.t]; [A.n, H.n] = [H.n, A.n];
        B.fixTokens(m); mark(g, 'h', a.b);
        break;
      }
      case 'swapNumbers': {
        const [A, H] = two();
        if (!B.isProducing(A.t) || !B.isProducing(H.t)) fail('Zahlen gibt es nur auf Rohstoff-Feldern (nicht Wüste/Meer).');
        [A.n, H.n] = [H.n, A.n];
        mark(g, 'h', a.b);
        break;
      }
      case 'setTerrain': {
        const H = m.hexes[a.hex];
        if (!H || !B.ALL_TERRAINS.includes(a.t)) fail('Ungültiges Feld.');
        H.t = a.t;
        B.fixTokens(m); mark(g, 'h', a.hex);
        break;
      }
      case 'setNumber': {
        const H = m.hexes[a.hex];
        if (!H) fail('Ungültiges Feld.');
        const n = a.n === null ? null : Number(a.n);
        if (n !== null && !B.NUMBERS.includes(n)) fail('Ungültige Zahl.');
        if (n !== null && !B.isProducing(H.t)) fail('Zahlen gibt es nur auf Rohstoff-Feldern.');
        H.n = n; mark(g, 'h', a.hex);
        break;
      }
      case 'harbors':
        B.placeHarbors(m);
        log(g, `⚓ ${pn} hat die Häfen neu verteilt.`);
        break;
      case 'settings': {
        const v = Math.round(Number(a.vpTarget));
        if (!(v >= 5 && v <= 25)) fail('Siegpunkte müssen zwischen 5 und 25 liegen.');
        g.settings.vpTarget = v;
        break;
      }
      case 'start': startGame(g, userId); break;
      default: fail('Diese Aktion geht in der Lobby nicht.');
    }
  }

  // ---------- Spielablauf ----------
  const PHASE_MSG = {
    setup: 'Das geht erst nach dem Aufbau.', roll: 'Zuerst würfeln.', main: 'Das geht gerade nicht.',
    discard: 'Erst müssen Karten abgeworfen werden.', robber: 'Zuerst Räuber oder Pirat versetzen.',
    steal: 'Zuerst wählen, wem du eine Karte stiehlst.', gold: 'Erst müssen Gold-Rohstoffe gewählt werden.',
  };
  function needPhase(g, ph) { if (g.phase !== ph) fail(PHASE_MSG[g.phase] || 'Das geht gerade nicht.'); }

  function setupBuild(g, p, a) {
    const s = g.setup, pl = g.players[p], G = graph(g);
    if (a.kind === 'settlement') {
      if (s.expect !== 'settlement') fail('Jetzt bitte eine Straße oder ein Schiff an die neue Siedlung bauen.');
      if (!legalSetupSettlement(g, a.at)) fail('Hier kannst du keine Siedlung bauen.');
      g.pieces.v[a.at] = { owner: p, type: 'settlement' };
      pl.left.settlement--;
      const isl = vertexIsland(g, a.at);
      if (isl !== null && !pl.homeIslands.includes(isl)) pl.homeIslands.push(isl);
      s.lastVertex = a.at; s.expect = 'route';
      mark(g, 'v', a.at);
      log(g, `🏠 ${pl.name} setzt eine Siedlung.`);
      if (s.step >= g.players.length) { // zweite Runde -> Starterträge
        const res = emptyRes();
        let gold = 0;
        for (const h of G.vertices[a.at].hexes) {
          const t = hexT(g, h);
          if (t === 'gold') gold++;
          else if (B.RESOURCE_OF[t]) res[B.RESOURCE_OF[t]]++;
        }
        for (const r of RES) res[r] = Math.min(res[r], g.bank[r]);
        if (sumRes(res)) { transfer(g.bank, pl.res, res); log(g, `${pl.name} erhält ${fmtRes(res)}.`); }
        if (gold) {
          g.goldPending = { [p]: gold }; g.returnPhase = 'setup'; g.phase = 'gold';
          log(g, `💰 ${pl.name} darf ${gold} Rohstoff(e) aus dem Goldfluss wählen.`);
        }
      }
    } else if (a.kind === 'road' || a.kind === 'ship') {
      if (s.expect !== 'route') fail('Zuerst eine Siedlung setzen.');
      if (!legalSetupRoute(g, a.at, a.kind)) fail(`Hier kannst du kein${a.kind === 'road' ? 'e Straße' : ' Schiff'} bauen.`);
      g.pieces.e[a.at] = { owner: p, type: a.kind, turn: g.turn };
      pl.left[a.kind]--;
      mark(g, 'e', a.at);
      log(g, `${a.kind === 'road' ? '🛤️' : '⛵'} ${pl.name} baut ${a.kind === 'road' ? 'eine Straße' : 'ein Schiff'}.`);
      s.step++;
      if (s.step >= s.order.length) {
        g.phase = 'roll'; g.current = 0; g.turn = 1; g.setup = null;
        log(g, `✅ Aufbau abgeschlossen. ${name(g, 0)} beginnt und würfelt.`);
      } else {
        g.current = s.order[s.step]; s.expect = 'settlement'; s.lastVertex = null;
      }
      updateLongestRoad(g);
    } else fail('Im Aufbau werden nur Siedlungen, Straßen und Schiffe gesetzt.');
  }

  function produce(g, sum) {
    const G = graph(g), claims = {}, gold = {};
    RES.forEach(r => { claims[r] = {}; });
    for (const k in g.map.hexes) {
      const h = g.map.hexes[k];
      if (h.n !== sum || k === g.map.robber || !B.isProducing(h.t)) continue;
      for (const vk of G.hexVerts[k]) {
        const b = bAt(g, vk);
        if (!b) continue;
        const amt = b.type === 'city' ? 2 : 1;
        if (h.t === 'gold') gold[b.owner] = (gold[b.owner] || 0) + amt;
        else { const r = B.RESOURCE_OF[h.t]; claims[r][b.owner] = (claims[r][b.owner] || 0) + amt; }
      }
    }
    const got = g.players.map(() => emptyRes());
    for (const r of RES) {
      const owners = Object.keys(claims[r]);
      if (!owners.length) continue;
      const total = owners.reduce((s, o) => s + claims[r][o], 0);
      if (total <= g.bank[r]) owners.forEach(o => { got[o][r] += claims[r][o]; });
      else if (owners.length === 1) { got[owners[0]][r] += g.bank[r]; log(g, `Die Bank hat nicht mehr genug ${RES_DE[r]}.`); }
      else log(g, `Die Bank hat nicht genug ${RES_DE[r]} – niemand erhält ${RES_DE[r]}.`);
    }
    let any = false;
    got.forEach((res, i) => {
      if (sumRes(res)) { any = true; transfer(g.bank, g.players[i].res, res); log(g, `${name(g, i)} erhält ${fmtRes(res)}.`); }
    });
    g.goldPending = {};
    for (const o in gold) {
      any = true;
      g.goldPending[o] = gold[o];
      log(g, `💰 ${name(g, +o)} darf ${gold[o]} Rohstoff(e) aus dem Goldfluss wählen.`);
    }
    if (!any) log(g, 'Niemand erhält Rohstoffe.');
  }

  function doRoll(g, p) {
    needPhase(g, 'roll');
    const d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6), sum = d1 + d2;
    g.dice = [d1, d2];
    g.rollCount = (g.rollCount || 0) + 1;
    g.diceStats[sum]++;
    log(g, `🎲 ${name(g, p)} würfelt ${d1} + ${d2} = ${sum}.`);
    if (sum === 7) {
      g.returnPhase = 'main';
      const d = {};
      g.players.forEach((pl, i) => { const n = sumRes(pl.res); if (n > 7) d[i] = Math.floor(n / 2); });
      g.discards = d;
      if (Object.keys(d).length) {
        g.phase = 'discard';
        log(g, `Karten abwerfen: ${Object.keys(d).map(i => `${name(g, +i)} (${d[i]})`).join(', ')}.`);
      } else g.phase = 'robber';
    } else {
      produce(g, sum);
      if (Object.keys(g.goldPending).length) { g.phase = 'gold'; g.returnPhase = 'main'; } else g.phase = 'main';
    }
  }

  function doDiscard(g, p, a) {
    needPhase(g, 'discard');
    const need = g.discards[p];
    if (!need) fail('Du musst nichts abwerfen.');
    const r = cleanRes(a.res);
    if (sumRes(r) !== need) fail(`Du musst genau ${need} Karten abwerfen.`);
    if (!hasRes(g.players[p].res, r)) fail('So viele Karten hast du nicht.');
    transfer(g.players[p].res, g.bank, r);
    delete g.discards[p];
    log(g, `${name(g, p)} wirft ${need} Karten ab.`);
    if (!Object.keys(g.discards).length) g.phase = 'robber';
  }

  function doGold(g, p, a) {
    needPhase(g, 'gold');
    const n = g.goldPending[p];
    if (!n) fail('Du hast keine Gold-Auswahl offen.');
    const need = Math.min(n, sumRes(g.bank));
    const r = cleanRes(a.res);
    if (sumRes(r) !== need) fail(`Wähle genau ${need} Rohstoff(e).`);
    if (!hasRes(g.bank, r)) fail('Die Bank hat nicht genug davon.');
    transfer(g.bank, g.players[p].res, r);
    delete g.goldPending[p];
    log(g, `💰 ${name(g, p)} wählt ${fmtRes(r)} aus dem Goldfluss.`);
    if (!Object.keys(g.goldPending).length) g.phase = g.returnPhase || 'main';
  }

  function stealFrom(g, p, t) {
    const pool = [];
    for (const r of RES) for (let i = 0; i < g.players[t].res[r]; i++) pool.push(r);
    if (!pool.length) return;
    const r = B.pick(pool);
    g.players[t].res[r]--; g.players[p].res[r]++;
    log(g, `🫳 ${name(g, p)} stiehlt ${name(g, t)} eine Karte.`);
  }

  function moveRobber(g, p, a) {
    const k = a.hex, h = g.map.hexes[k];
    if (!h) fail('Ungültiges Feld.');
    if (k === g.map.robber || k === g.map.pirate) fail('Wähle ein anderes Feld.');
    const G = graph(g), cands = new Set();
    if (B.isLand(h.t)) {
      g.map.robber = k;
      for (const v of G.hexVerts[k]) { const b = bAt(g, v); if (b && b.owner !== p) cands.add(b.owner); }
      log(g, `🥷 ${name(g, p)} versetzt den Räuber.`);
    } else {
      g.map.pirate = k;
      for (const e of G.hexEdges[k]) { const s = eAt(g, e); if (s && s.type === 'ship' && s.owner !== p) cands.add(s.owner); }
      log(g, `🏴‍☠️ ${name(g, p)} versetzt den Piraten.`);
    }
    mark(g, 'h', k);
    const list = [...cands].filter(i => sumRes(g.players[i].res) > 0);
    if (list.length > 1) { g.stealFrom = list; g.phase = 'steal'; return; }
    if (list.length === 1) stealFrom(g, p, list[0]);
    g.phase = g.returnPhase || 'main';
  }

  function mainBuild(g, p, a) {
    const pl = g.players[p], kind = a.kind;
    if (!PIECE_DE[kind]) fail('Unbekanntes Bauwerk.');
    if (pl.left[kind] <= 0) fail(`Du hast keine ${PIECES_LEFT_DE[kind]} mehr.`);
    const free = (kind === 'road' || kind === 'ship') && g.freeRoads > 0;
    if (!free && !hasRes(pl.res, COSTS[kind])) fail('Nicht genug Rohstoffe.');
    const ok = kind === 'road' ? legalRoad(g, p, a.at) : kind === 'ship' ? legalShip(g, p, a.at)
      : kind === 'settlement' ? legalSettlement(g, p, a.at) : legalCity(g, p, a.at);
    if (!ok) fail(`Hier kannst du ${kind === 'ship' ? 'kein Schiff' : kind === 'road' ? 'keine Straße' : 'keine ' + PIECE_DE[kind]} bauen.`);
    if (free) g.freeRoads--; else transfer(pl.res, g.bank, COSTS[kind]);
    if (kind === 'road' || kind === 'ship') {
      g.pieces.e[a.at] = { owner: p, type: kind, turn: g.turn };
      pl.left[kind]--;
      mark(g, 'e', a.at);
      log(g, `${kind === 'road' ? '🛤️' : '⛵'} ${pl.name} baut ${kind === 'road' ? 'eine Straße' : 'ein Schiff'}${free ? ' (gratis)' : ''}.`);
    } else if (kind === 'settlement') {
      g.pieces.v[a.at] = { owner: p, type: 'settlement' };
      pl.left.settlement--;
      mark(g, 'v', a.at);
      log(g, `🏠 ${pl.name} baut eine Siedlung.`);
      const isl = vertexIsland(g, a.at);
      if (isl !== null && !pl.homeIslands.includes(isl) && !pl.bonusIslands.includes(isl)) {
        pl.bonusIslands.push(isl);
        log(g, `🏝️ ${pl.name} besiedelt eine neue Insel: +${ISLAND_BONUS} Siegpunkte!`);
      }
    } else {
      g.pieces.v[a.at].type = 'city';
      pl.left.city--; pl.left.settlement++;
      mark(g, 'v', a.at);
      log(g, `🏰 ${pl.name} baut eine Stadt.`);
    }
    updateLongestRoad(g);
  }

  function moveShip(g, p, a) {
    if (g.shipMoved) fail('Du hast in diesem Zug schon ein Schiff versetzt.');
    if (!movableShips(g, p).includes(a.from)) fail('Dieses Schiff kann nicht versetzt werden.');
    const s = g.pieces.e[a.from];
    delete g.pieces.e[a.from];
    if (a.to === a.from || !legalShip(g, p, a.to)) { g.pieces.e[a.from] = s; fail('Dorthin kann das Schiff nicht fahren.'); }
    g.pieces.e[a.to] = { owner: p, type: 'ship', turn: g.turn };
    g.shipMoved = true;
    mark(g, 'e', a.to);
    log(g, `⛵ ${name(g, p)} versetzt ein Schiff.`);
    updateLongestRoad(g);
  }

  function buyDev(g, p) {
    const pl = g.players[p];
    if (!g.devDeck.length) fail('Es gibt keine Entwicklungskarten mehr.');
    if (!hasRes(pl.res, COSTS.dev)) fail('Nicht genug Rohstoffe.');
    transfer(pl.res, g.bank, COSTS.dev);
    pl.dev.push({ type: g.devDeck.pop(), turn: g.turn });
    log(g, `📜 ${pl.name} kauft eine Entwicklungskarte.`);
  }

  function playDev(g, p, a) {
    const pl = g.players[p], type = a.card;
    if (type === 'knight') { if (g.phase !== 'main' && g.phase !== 'roll') fail('Jetzt kannst du keinen Ritter spielen.'); }
    else needPhase(g, 'main');
    if (g.devPlayed) fail('Du hast in diesem Zug schon eine Entwicklungskarte gespielt.');
    const idx = pl.dev.findIndex(d => d.type === type && d.turn !== g.turn);
    if (type === 'vp' || idx < 0) fail('Diese Karte kannst du gerade nicht spielen (neu gekaufte Karten erst nächste Runde).');
    switch (type) {
      case 'knight':
        pl.knights++;
        log(g, `⚔️ ${pl.name} spielt einen Ritter.`);
        updateLargestArmy(g, p);
        g.returnPhase = g.phase; g.phase = 'robber';
        break;
      case 'roadBuilding':
        g.freeRoads = 2;
        log(g, `🛤️ ${pl.name} spielt Straßenbau: 2 Straßen/Schiffe gratis.`);
        break;
      case 'yearOfPlenty': {
        const pickRes = [a.res1, a.res2];
        if (!pickRes.every(x => RES.includes(x))) fail('Wähle zwei Rohstoffe.');
        const need = emptyRes();
        pickRes.forEach(x => { need[x]++; });
        if (!hasRes(g.bank, need)) fail('Die Bank hat nicht genug davon.');
        transfer(g.bank, pl.res, need);
        log(g, `🎁 ${pl.name} spielt Erfindung und nimmt ${fmtRes(need)}.`);
        break;
      }
      case 'monopoly': {
        const r = a.res;
        if (!RES.includes(r)) fail('Wähle einen Rohstoff.');
        let total = 0;
        g.players.forEach((o, i) => { if (i !== p) { total += o.res[r]; pl.res[r] += o.res[r]; o.res[r] = 0; } });
        log(g, `💎 ${pl.name} spielt Monopol auf ${RES_DE[r]} und erhält ${total} Karten.`);
        break;
      }
      default: fail('Unbekannte Karte.');
    }
    pl.dev.splice(idx, 1);
    g.devPlayed = true;
  }

  function bankTrade(g, p, a) {
    const give = a.give, get = a.get;
    if (!RES.includes(give) || !RES.includes(get) || give === get) fail('Ungültiger Tausch.');
    const rate = tradeRate(g, p, give), pl = g.players[p];
    if (pl.res[give] < rate) fail(`Du brauchst ${rate} ${RES_DE[give]}.`);
    if (g.bank[get] < 1) fail(`Die Bank hat kein ${RES_DE[get]} mehr.`);
    pl.res[give] -= rate; g.bank[give] += rate;
    g.bank[get]--; pl.res[get]++;
    log(g, `🏦 ${pl.name} tauscht ${rate} ${RES_DE[give]} gegen 1 ${RES_DE[get]} mit der Bank.`);
  }

  function tradePropose(g, p, a) {
    const give = cleanRes(a.give), get = cleanRes(a.get);
    if (!sumRes(give) || !sumRes(get)) fail('Beim Tausch müssen beide Seiten etwas geben.');
    if (!hasRes(g.players[p].res, give)) fail('Du hast nicht genug Karten für dieses Angebot.');
    let to = null;
    if (a.to !== null && a.to !== undefined && a.to !== 'all') {
      to = Number(a.to);
      if (!(to >= 0 && to < g.players.length) || to === p) fail('Ungültiger Mitspieler.');
    }
    g.trade = { from: p, to, give, get, declined: [] };
  }

  function tradeAccept(g, p) {
    const t = g.trade;
    if (!t) fail('Es gibt kein offenes Angebot.');
    if (t.from === p) fail('Das ist dein eigenes Angebot.');
    if (t.to !== null && t.to !== p) fail('Das Angebot gilt nicht für dich.');
    needPhase(g, 'main');
    const A = g.players[t.from], P = g.players[p];
    if (!hasRes(A.res, t.give)) fail(`${A.name} hat die angebotenen Karten nicht mehr.`);
    if (!hasRes(P.res, t.get)) fail('Du hast nicht genug Karten für diesen Tausch.');
    transfer(A.res, P.res, t.give);
    transfer(P.res, A.res, t.get);
    g.trade = null;
    log(g, `🤝 Tausch: ${A.name} gibt ${fmtRes(t.give)} an ${P.name} und bekommt ${fmtRes(t.get)}.`);
  }

  function tradeDecline(g, p) {
    const t = g.trade;
    if (!t || t.from === p || (t.to !== null && t.to !== p)) return;
    if (!t.declined.includes(p)) t.declined.push(p);
    const eligible = g.players.map((_, i) => i).filter(i => i !== t.from && (t.to === null || t.to === i));
    if (eligible.every(i => t.declined.includes(i))) g.trade = null;
  }

  function endTurn(g, p) {
    g.trade = null; g.freeRoads = 0; g.devPlayed = false; g.shipMoved = false;
    g.current = (p + 1) % g.players.length;
    g.turn++;
    g.phase = 'roll';
    log(g, `➡️ ${name(g, g.current)} ist am Zug.`);
  }

  function checkWin(g) {
    const p = g.current;
    if (vp(g, p, true) >= g.settings.vpTarget) {
      g.status = 'finished'; g.phase = 'finished'; g.winner = p;
      log(g, `🏆 ${name(g, p)} gewinnt mit ${vp(g, p, true)} Siegpunkten!`);
    }
  }

  function applyAction(g, userId, a) {
    if (!a || typeof a.type !== 'string') fail('Ungültige Aktion.');
    const p = g.players.findIndex(pl => pl.userId === userId);
    if (g.status === 'lobby') return lobbyAction(g, userId, p, a);
    if (g.status === 'finished') fail('Das Spiel ist beendet.');
    if (p < 0) fail('Du spielst in diesem Spiel nicht mit.');
    switch (a.type) { // Aktionen, die auch Nicht-aktive Spieler machen
      case 'discard': return doDiscard(g, p, a);
      case 'gold': return doGold(g, p, a);
      case 'tradeAccept': return tradeAccept(g, p);
      case 'tradeDecline': return tradeDecline(g, p);
    }
    if (p !== g.current) fail('Du bist nicht am Zug.');
    switch (a.type) {
      case 'roll': doRoll(g, p); break;
      case 'build':
        if (g.phase === 'setup') setupBuild(g, p, a);
        else { needPhase(g, 'main'); mainBuild(g, p, a); }
        break;
      case 'moveShip': needPhase(g, 'main'); moveShip(g, p, a); break;
      case 'buyDev': needPhase(g, 'main'); buyDev(g, p); break;
      case 'playDev': playDev(g, p, a); break;
      case 'moveRobber': needPhase(g, 'robber'); moveRobber(g, p, a); break;
      case 'steal': {
        needPhase(g, 'steal');
        const t = Number(a.target);
        if (!g.stealFrom.includes(t)) fail('Von diesem Spieler kannst du nicht stehlen.');
        stealFrom(g, p, t);
        g.stealFrom = [];
        g.phase = g.returnPhase || 'main';
        break;
      }
      case 'bankTrade': needPhase(g, 'main'); bankTrade(g, p, a); break;
      case 'tradePropose': needPhase(g, 'main'); tradePropose(g, p, a); break;
      case 'tradeCancel': if (g.trade && g.trade.from === p) g.trade = null; break;
      case 'endTurn': needPhase(g, 'main'); endTurn(g, p); break;
      default: fail('Unbekannte Aktion.');
    }
    if (g.status === 'playing' && g.phase !== 'setup') checkWin(g);
  }

  // Ansicht für einen Spieler: fremde Handkarten nur als Anzahl.
  function viewFor(g, userId) {
    const v = JSON.parse(JSON.stringify(g));
    const me = v.players.findIndex(p => p.userId === userId);
    v.me = me;
    if (v.status !== 'lobby') {
      v.players.forEach((p, i) => {
        p.resCount = sumRes(p.res);
        p.devCount = (p.dev || []).length;
        p.vpPublic = vp(g, i, false);
        if (i === me || v.status === 'finished') p.vpTotal = vp(g, i, true);
        if (i !== me && v.status !== 'finished') { p.res = null; p.dev = null; }
      });
      v.devDeckCount = (v.devDeck || []).length;
      delete v.devDeck;
    }
    return v;
  }

  return {
    RES, RES_DE, COSTS, DEV_DE, PIECE_DE, COLORS, ISLAND_BONUS, GameError,
    emptyRes, sumRes, hasRes, fmtRes,
    createGame, addPlayer, applyAction, viewFor,
    legalSpots, legalRoad, legalShip, legalSettlement, legalCity, movableShips, shipMoveTargets,
    tradeRate, vp, longestRoute,
  };
});
