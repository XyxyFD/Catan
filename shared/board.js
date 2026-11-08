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
  const SQ3 = Math.sqrt(3);

  // Kartengröße: 3-Spieler-Feld und 4-Spieler-Feld
  const SIZE_CONFIG = {
    3: { radius: 4, land: 21, harbors: { any: 3, specific: 4 } },
    4: { radius: 5, land: 31, harbors: { any: 4, specific: 5 } },
  };

  const hk = (q, r) => q + ',' + r;
  const parseHex = k => { const p = k.split(','); return { q: +p[0], r: +p[1] }; };
  const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  const neighbors = h => DIRS.map(d => ({ q: h.q + d[0], r: h.r + d[1] }));
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

  function gridCoords(R) {
    const out = [];
    for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) if (Math.abs(q + r) <= R) out.push({ q, r });
    return out;
  }

  // Graph aus Ecken (vertices) und Kanten (edges) – hängt nur vom Radius ab.
  const graphCache = {};
  function buildGraph(R) {
    if (graphCache[R]) return graphCache[R];
    const vertices = {}, edges = {}, hexVerts = {}, hexEdges = {};
    for (const { q, r } of gridCoords(R)) {
      const key = hk(q, r);
      const vs = [];
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
    graphCache[R] = { R, vertices, edges, hexVerts, hexEdges };
    return graphCache[R];
  }

  // Pixelpositionen bei Hex-Radius 1
  const hexCenter = (q, r) => ({ x: SQ3 * (q + r / 2), y: 1.5 * r });
  function vertexPos(vk) { const p = vk.split(','); return { x: (+p[0]) * SQ3 / 2, y: (+p[1]) / 2 }; }

  // ---------- Inselgenerator ----------
  function islandSizes(total, count) {
    const s = count === 2 ? [Math.round(total * 0.62)] : [Math.round(total * 0.5), Math.round(total * 0.27)];
    s.push(total - s.reduce((a, b) => a + b, 0));
    return s;
  }

  function tryIslands(R, total, count) {
    const inner = gridCoords(R).filter(h => hexDist(h, { q: 0, r: 0 }) < R); // äußerster Ring bleibt Meer
    const innerSet = new Set(inner.map(h => hk(h.q, h.r)));
    const sizes = islandSizes(total, count);
    let seeds = null, best = -1;
    for (let t = 0; t < 80; t++) {
      const cand = shuffle(inner.slice()).slice(0, count);
      let minD = Infinity;
      for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) minD = Math.min(minD, hexDist(cand[i], cand[j]));
      const score = minD + Math.random();
      if (score > best) { best = score; seeds = cand; }
    }
    const owner = {}, counts = new Array(count).fill(0);
    seeds.forEach((s, i) => { owner[hk(s.q, s.r)] = i; counts[i] = 1; });
    const canJoin = (h, i) => {
      const k = hk(h.q, h.r);
      if (!innerSet.has(k) || owner[k] !== undefined) return false;
      // Inseln dürfen sich nicht berühren -> immer mindestens ein Meerfeld dazwischen
      return neighbors(h).every(n => { const o = owner[hk(n.q, n.r)]; return o === undefined || o === i; });
    };
    for (;;) {
      const pending = [];
      for (let i = 0; i < count; i++) if (counts[i] < sizes[i]) pending.push(i);
      if (!pending.length) return owner;
      pending.sort((a, b) => counts[a] / sizes[a] - counts[b] / sizes[b]);
      const i = pending[0];
      const front = new Map();
      for (const k in owner) {
        if (owner[k] !== i) continue;
        for (const n of neighbors(parseHex(k))) {
          if (canJoin(n, i)) { const nk = hk(n.q, n.r); front.set(nk, (front.get(nk) || 0) + 1); }
        }
      }
      if (!front.size) return null;
      const keys = [...front.keys()];
      owner[weightedPick(keys, keys.map(k => Math.pow(front.get(k), 2.2)))] = i;
      counts[i]++;
    }
  }

  function countRedAdjacent(assign) {
    let bad = 0;
    for (const k in assign) {
      if (assign[k] !== 6 && assign[k] !== 8) continue;
      for (const n of neighbors(parseHex(k))) { const v = assign[hk(n.q, n.r)]; if (v === 6 || v === 8) bad++; }
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

  function coastalEdges(map) {
    const g = buildGraph(map.radius), out = [];
    for (const ek in g.edges) {
      const e = g.edges[ek];
      if (e.hexes.length !== 2) continue;
      const a = map.hexes[e.hexes[0]], b = map.hexes[e.hexes[1]];
      if (isLand(a.t) !== isLand(b.t)) out.push(ek);
    }
    return out;
  }

  function placeHarbors(map) {
    const g = buildGraph(map.radius);
    const cfg = SIZE_CONFIG[map.size] || SIZE_CONFIG[4];
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
      for (const v of [e.a, e.b]) { blocked.add(v); g.vertices[v].adj.forEach(x => blocked.add(x)); }
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
      const far = seas.filter(k => neighbors(parseHex(k)).every(n => { const h = map.hexes[hk(n.q, n.r)]; return !h || !isLand(h.t); }));
      map.pirate = (far.length ? pick(far) : pick(seas)) || null;
    }
    const coast = new Set(coastalEdges(map));
    map.harbors = (map.harbors || []).filter(h => coast.has(h.edge));
  }

  function generateMap(size, islands) {
    size = size === 3 ? 3 : 4;
    islands = islands === 3 ? 3 : 2;
    const cfg = SIZE_CONFIG[size], R = cfg.radius;
    let owner = null, total = cfg.land;
    while (!owner) {
      for (let a = 0; a < 200 && !owner; a++) owner = tryIslands(R, total, islands);
      if (!owner) total--;
    }
    const hexes = {};
    for (const h of gridCoords(R)) hexes[hk(h.q, h.r)] = { q: h.q, r: h.r, t: 'sea', n: null };
    const byIsland = [];
    for (let i = 0; i < islands; i++) byIsland.push([]);
    for (const k in owner) byIsland[owner[k]].push(k);
    const special = {};
    special[pick(byIsland[0])] = 'desert';
    for (let i = 1; i < islands; i++) special[pick(byIsland[i])] = 'gold';
    const rest = Object.keys(owner).filter(k => !special[k]);
    const pool = [];
    while (pool.length < rest.length) pool.push(...shuffle(TERRAIN_CYCLE.slice()));
    pool.length = rest.length;
    shuffle(pool);
    rest.forEach((k, i) => { hexes[k].t = pool[i]; });
    for (const k in special) hexes[k].t = special[k];
    const map = { size, islands, radius: R, hexes, harbors: [], robber: null, pirate: null };
    assignNumbers(map);
    placeHarbors(map);
    fixTokens(map);
    return map;
  }

  // Zusammenhängende Landmassen bestimmen
  function computeIslands(map) {
    const islandOf = {}, sizes = [];
    for (const k in map.hexes) {
      if (!isLand(map.hexes[k].t) || islandOf[k] !== undefined) continue;
      const id = sizes.length;
      let n = 0;
      const stack = [k];
      islandOf[k] = id;
      while (stack.length) {
        const c = stack.pop(); n++;
        for (const nb of neighbors(parseHex(c))) {
          const nk = hk(nb.q, nb.r), h = map.hexes[nk];
          if (h && isLand(h.t) && islandOf[nk] === undefined) { islandOf[nk] = id; stack.push(nk); }
        }
      }
      sizes.push(n);
    }
    return { islandOf, sizes };
  }

  return {
    DIRS, RESOURCES, RESOURCE_OF, LAND_TERRAINS, ALL_TERRAINS, NUMBERS, SIZE_CONFIG,
    hk, parseHex, hexDist, neighbors, isLand, isProducing, shuffle, pick,
    gridCoords, buildGraph, hexCenter, vertexPos,
    generateMap, assignNumbers, placeHarbors, fixTokens, coastalEdges, computeIslands,
  };
});
