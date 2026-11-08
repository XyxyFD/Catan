// Hex-Geometrie und Kartengenerator. Läuft im Browser (window.ArchipelBoard) und in Node (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ArchipelBoard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Axiale Koordinaten (q, r), "pointy-top" Hexfelder.
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  // Ecken als ganzzahlige Offsets: X = 2q + r + dx, Y = 3r + dy
  const CORNERS = [[0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1]];
  const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const RESOURCE_OF = { forest: 'wood', hills: 'brick', pasture: 'sheep', fields: 'wheat', mountains: 'ore' };
  const LAND_TERRAINS = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'gold', 'desert'];
  const ALL_TERRAINS = ['sea'].concat(LAND_TERRAINS);
  const NUMBERS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
  const NUMBER_SET = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
  const TERRAIN_CYCLE = ['forest', 'pasture', 'fields', 'hills', 'mountains',
    'forest', 'pasture', 'fields', 'hills', 'mountains',
    'forest', 'pasture', 'fields', 'hills', 'mountains',
    'forest', 'pasture', 'fields'];

  // Spielfeld-Formen (Zeilenbreiten). Das Meer-Rahmenteil liegt außen herum und ist kein Hexfeld.
  const SHAPES = {
    3: { rows: [4, 5, 6, 7, 6, 5, 4], deserts: 1, gold: 1, harbors: { any: 3, specific: 5 } },
    4: { rows: [6, 7, 8, 9, 8, 7, 6], deserts: 2, gold: 2, harbors: { any: 5, specific: 5 } },
  };

  const hk = (q, r) => q + ',' + r;
  const parseHex = k => { const p = k.split(','); return { q: +p[0], r: +p[1] }; };
  const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  const neighbors = h => DIRS.map(d => ({ q: h.q + d[0], r: h.r + d[1] }));
  const neighborKeys = k => neighbors(parseHex(k)).map(n => hk(n.q, n.r));
  const isLand = t => !!t && t !== 'sea';
  const isProducing = t => isLand(t) && t !== 'desert';

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function weightedPick(items, weights) {
    const total = weights.reduce((s, w) => s + w, 0);
    let x = Math.random() * total;
    for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x <= 0) return items[i]; }
    return items[items.length - 1];
  }

  function shapeCoords(size) {
    const rows = SHAPES[size].rows, h = (rows.length - 1) / 2, out = [];
    rows.forEach((w, i) => {
      const r = i - h, start = -(w - 1 + r) / 2;
      for (let j = 0; j < w; j++) out.push({ q: start + j, r });
    });
    return out;
  }

  // Graph aus Ecken und Kanten – hängt nur von der Feldform ab.
  const graphCache = {};
  function buildGraph(size) {
    size = size === 3 ? 3 : 4;
    if (graphCache[size]) return graphCache[size];
    const vertices = {}, edges = {}, hexVerts = {}, hexEdges = {};
    for (const { q, r } of shapeCoords(size)) {
      const key = hk(q, r), vs = [];
      for (const [dx, dy] of CORNERS) {
        const X = 2 * q + r + dx, Y = 3 * r + dy, vk = X + ',' + Y;
        vs.push(vk);
        if (!vertices[vk]) vertices[vk] = { key: vk, X, Y, hexes: [], edges: [], adj: [] };
        vertices[vk].hexes.push(key);
      }
      hexVerts[key] = vs;
      const es = [];
      for (let i = 0; i < 6; i++) {
        const a = vs[i], b = vs[(i + 1) % 6];
        const ek = a < b ? a + '|' + b : b + '|' + a;
        es.push(ek);
        if (!edges[ek]) {
          edges[ek] = { key: ek, a, b, hexes: [] };
          vertices[a].edges.push(ek); vertices[b].edges.push(ek);
          vertices[a].adj.push(b); vertices[b].adj.push(a);
        }
        edges[ek].hexes.push(key);
      }
      hexEdges[key] = es;
    }
    graphCache[size] = { size, vertices, edges, hexVerts, hexEdges };
    return graphCache[size];
  }

  const SQ3 = Math.sqrt(3);
  const hexCenter = (q, r) => ({ x: SQ3 * (q + r / 2), y: 1.5 * r });
  function vertexPos(vk) { const p = vk.split(','); return { x: (+p[0]) * SQ3 / 2, y: (+p[1]) / 2 }; }

  // ---------- Inselgenerator ----------
  // 1) Feld in N zusammenhängende Regionen aufteilen  2) zwischen Regionen genau einen Wasserstreifen
  // 3) optional ein See im Inselinneren.
  function components(keys, t) {
    const set = new Set(keys), comp = {}, sizes = [];
    for (const k of keys) {
      if (t[k] === 'sea' || comp[k] !== undefined) continue;
      const id = sizes.length, stack = [k];
      let n = 0;
      comp[k] = id;
      while (stack.length) {
        const c = stack.pop(); n++;
        for (const nk of neighborKeys(c)) {
          if (set.has(nk) && t[nk] !== 'sea' && comp[nk] === undefined) { comp[nk] = id; stack.push(nk); }
        }
      }
      sizes.push(n);
    }
    return { comp, sizes };
  }

  function tryLayout(size, count) {
    const coords = shapeCoords(size), keys = coords.map(c => hk(c.q, c.r)), set = new Set(keys);
    let seeds = null, best = -1;
    for (let i = 0; i < 80; i++) {
      const cand = shuffle(coords.slice()).slice(0, count);
      let minD = Infinity;
      for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) minD = Math.min(minD, hexDist(cand[a], cand[b]));
      const score = minD + Math.random();
      if (score > best) { best = score; seeds = cand; }
    }
    const region = {}, weight = [];
    seeds.forEach((s, i) => { region[hk(s.q, s.r)] = i; weight.push((i === 0 ? 1.35 : 1) * (0.8 + Math.random() * 0.4)); });
    let left = keys.length - count;
    while (left > 0) {
      const fronts = [];
      for (let i = 0; i < count; i++) {
        const f = new Map();
        for (const k in region) {
          if (region[k] !== i) continue;
          for (const nk of neighborKeys(k)) if (set.has(nk) && region[nk] === undefined) f.set(nk, (f.get(nk) || 0) + 1);
        }
        fronts.push(f);
      }
      const able = [];
      for (let i = 0; i < count; i++) if (fronts[i].size) able.push(i);
      if (!able.length) return null;
      const i = weightedPick(able, able.map(x => weight[x]));
      const fk = [...fronts[i].keys()];
      region[weightedPick(fk, fk.map(k => Math.pow(fronts[i].get(k), 2)))] = i;
      left--;
    }
    const t = {};
    keys.forEach(k => { t[k] = 'land'; });
    // Schmalster Kanal: immer das Feld mit den meisten "fremden" Land-Nachbarn zu Wasser machen
    const conflicts = k => neighborKeys(k).filter(nk => set.has(nk) && t[nk] === 'land' && region[nk] !== region[k]).length;
    for (;;) {
      let bestK = null, bestC = 0;
      for (const k of shuffle(keys.slice())) {
        if (t[k] !== 'land') continue;
        const c = conflicts(k);
        if (c > bestC) { bestC = c; bestK = k; }
      }
      if (!bestK) break;
      t[bestK] = 'sea';
    }
    // Seen: innere Felder (alle 6 Nachbarn Land) können zu Wasser werden
    const lakes = Math.random() < 0.55 ? (size === 4 && Math.random() < 0.3 ? 2 : 1) : 0;
    for (let l = 0; l < lakes; l++) {
      const inner = keys.filter(k => t[k] === 'land' && neighborKeys(k).every(nk => set.has(nk) && t[nk] === 'land'));
      if (inner.length) t[pick(inner)] = 'sea';
    }
    const { sizes } = components(keys, t);
    if (sizes.length !== count || Math.min(...sizes) < 5) return null;
    const water = keys.filter(k => t[k] === 'sea').length / keys.length;
    if (water < 0.1 || water > (count === 3 ? 0.32 : 0.26)) return null;
    return t;
  }

  function countRedAdjacent(assign) {
    let bad = 0;
    for (const k in assign) {
      if (assign[k] !== 6 && assign[k] !== 8) continue;
      for (const nk of neighborKeys(k)) { const v = assign[nk]; if (v === 6 || v === 8) bad++; }
    }
    return bad;
  }

  function assignNumbers(map) {
    const keys = Object.keys(map.hexes).filter(k => isProducing(map.hexes[k].t));
    const pool = [];
    while (pool.length < keys.length) pool.push(...shuffle(NUMBER_SET.slice()));
    pool.length = keys.length;
    let best = {}, bestBad = Infinity;
    for (let t = 0; t < 2000 && bestBad > 0; t++) {
      shuffle(pool);
      const assign = {};
      keys.forEach((k, i) => { assign[k] = pool[i]; });
      const bad = countRedAdjacent(assign);
      if (bad < bestBad) { bestBad = bad; best = assign; }
    }
    for (const k in map.hexes) map.hexes[k].n = null;
    for (const k in best) map.hexes[k].n = best[k];
  }

  // Hafen-Kanten: Land neben Meerfeld oder Land am Spielfeldrand (dort liegt das Meer-Rahmenteil)
  function harborEdgeValid(map, ek) {
    const e = buildGraph(map.size).edges[ek];
    if (!e) return false;
    const ts = e.hexes.map(h => map.hexes[h].t);
    if (ts.length === 1) return isLand(ts[0]);
    return isLand(ts[0]) !== isLand(ts[1]);
  }
  function coastalEdges(map) {
    return Object.keys(buildGraph(map.size).edges).filter(ek => harborEdgeValid(map, ek));
  }
  // Richtung "aufs Meer hinaus" für eine Hafenkante (Einheits-Koordinaten)
  function harborGeometry(map, ek) {
    const g = buildGraph(map.size), e = g.edges[ek];
    const a = vertexPos(e.a), b = vertexPos(e.b), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const landHex = e.hexes.find(h => isLand(map.hexes[h].t)) || e.hexes[0];
    const lh = map.hexes[landHex], lc = hexCenter(lh.q, lh.r);
    let dx = mid.x - lc.x, dy = mid.y - lc.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    return { a, b, mid, dir: { x: dx, y: dy } };
  }

  function placeHarbors(map) {
    const g = buildGraph(map.size), cfg = SHAPES[map.size];
    const types = [];
    for (let i = 0; i < cfg.harbors.any; i++) types.push('any');
    types.push(...shuffle(RESOURCES.slice()).slice(0, cfg.harbors.specific));
    shuffle(types);
    const blocked = new Set(), harbors = [];
    for (const ek of shuffle(coastalEdges(map))) {
      if (harbors.length >= types.length) break;
      const e = g.edges[ek];
      if (blocked.has(e.a) || blocked.has(e.b)) continue;
      harbors.push({ edge: ek, type: types[harbors.length] });
      for (const v of [e.a, e.b]) {
        blocked.add(v);
        g.vertices[v].adj.forEach(x => { blocked.add(x); g.vertices[x].adj.forEach(y => blocked.add(y)); });
      }
    }
    map.harbors = harbors;
  }

  // Nach Änderungen im Editor: Zahlen, Räuber, Pirat und Häfen konsistent halten.
  function fixTokens(map) {
    for (const k in map.hexes) { const h = map.hexes[k]; if (!isProducing(h.t)) h.n = null; }
    const keys = Object.keys(map.hexes);
    if (!map.robber || !map.hexes[map.robber] || map.hexes[map.robber].t !== 'desert') {
      map.robber = keys.find(k => map.hexes[k].t === 'desert') || null;
    }
    if (!map.pirate || !map.hexes[map.pirate] || isLand(map.hexes[map.pirate].t)) {
      const seas = keys.filter(k => map.hexes[k].t === 'sea');
      map.pirate = seas.length ? pick(seas) : null;
    }
    map.harbors = (map.harbors || []).filter(h => harborEdgeValid(map, h.edge));
  }

  function generateMap(size, islands) {
    size = size === 3 ? 3 : 4;
    islands = islands === 3 ? 3 : 2;
    const cfg = SHAPES[size];
    let layout = null;
    for (let a = 0; a < 2000 && !layout; a++) layout = tryLayout(size, islands);
    if (!layout) throw new Error('Konnte keine Karte erzeugen');
    const hexes = {};
    for (const c of shapeCoords(size)) { const k = hk(c.q, c.r); hexes[k] = { q: c.q, r: c.r, t: layout[k] === 'sea' ? 'sea' : null, n: null }; }
    const landKeys = Object.keys(hexes).filter(k => hexes[k].t === null);
    const { comp, sizes } = components(Object.keys(hexes), Object.fromEntries(Object.keys(hexes).map(k => [k, hexes[k].t === 'sea' ? 'sea' : 'land'])));
    // Gold bevorzugt auf kleineren Inseln
    const order = sizes.map((s, i) => i).sort((a, b) => sizes[a] - sizes[b]);
    const free = shuffle(landKeys.slice());
    const take = pred => { const i = free.findIndex(pred); return i >= 0 ? free.splice(i, 1)[0] : free.shift(); };
    for (let i = 0; i < cfg.gold; i++) { const isl = order[i % order.length]; hexes[take(k => comp[k] === isl)].t = 'gold'; }
    for (let i = 0; i < cfg.deserts; i++) hexes[take(() => true)].t = 'desert';
    const pool = [];
    while (pool.length < free.length) pool.push(...shuffle(TERRAIN_CYCLE.slice()));
    pool.length = free.length;
    shuffle(pool);
    free.forEach((k, i) => { hexes[k].t = pool[i]; });
    const map = { size, islands, hexes, harbors: [], robber: null, pirate: null };
    assignNumbers(map);
    placeHarbors(map);
    fixTokens(map);
    return map;
  }

  function computeIslands(map) {
    const keys = Object.keys(map.hexes);
    const t = {};
    keys.forEach(k => { t[k] = isLand(map.hexes[k].t) ? 'land' : 'sea'; });
    const { comp, sizes } = components(keys, t);
    return { islandOf: comp, sizes };
  }

  return {
    DIRS, RESOURCES, RESOURCE_OF, LAND_TERRAINS, ALL_TERRAINS, NUMBERS, SHAPES,
    hk, parseHex, hexDist, neighbors, isLand, isProducing, shuffle, pick,
    shapeCoords, buildGraph, hexCenter, vertexPos,
    generateMap, assignNumbers, placeHarbors, fixTokens, coastalEdges, harborEdgeValid, harborGeometry, computeIslands,
  };
});
