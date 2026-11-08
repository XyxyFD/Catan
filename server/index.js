'use strict';
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const E = require('../shared/engine');

const PORT = Number(process.env.PORT) || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const games = new Map();      // id -> Spielzustand (im Speicher, in Postgres gesichert)
const sessions = new Map();   // token -> { id, name }
const saveChains = new Map(); // id -> Promise (Speichern nacheinander)

// ---------- Datenbank ----------
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');

async function initDb() {
  for (let i = 0; ; i++) {
    try { await pool.query('SELECT 1'); break; } catch (e) {
      if (i > 60) throw e;
      console.log('Warte auf Datenbank ...');
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY, state JSONB NOT NULL, updated TIMESTAMPTZ NOT NULL DEFAULT now())`);

  // Accounts aus APP_USERS ("Name:Passwort,Name:Passwort") anlegen bzw. Passwort aktualisieren
  const spec = process.env.APP_USERS || 'Spieler1:test,Spieler2:test,Spieler3:test,Spieler4:test';
  for (const entry of spec.split(',').map(s => s.trim()).filter(Boolean)) {
    const i = entry.indexOf(':');
    if (i < 1) continue;
    const name = entry.slice(0, i).trim(), pw = entry.slice(i + 1);
    const salt = crypto.randomBytes(16).toString('hex');
    await pool.query(
      `INSERT INTO users (name, salt, hash) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET salt = EXCLUDED.salt, hash = EXCLUDED.hash`,
      [name, salt, hashPw(pw, salt)]);
    console.log(`Account bereit: ${name}`);
  }

  const r = await pool.query('SELECT id, state FROM games');
  for (const row of r.rows) if (row.state && row.state.id) games.set(row.id, row.state);
  console.log(`${games.size} Spiel(e) geladen.`);
}

function save(g) {
  const prev = saveChains.get(g.id) || Promise.resolve();
  const next = prev.then(() => pool.query('UPDATE games SET state = $2, updated = now() WHERE id = $1', [g.id, g]))
    .catch(e => console.error('Speichern fehlgeschlagen', e));
  saveChains.set(g.id, next);
  return next;
}

// ---------- Auth ----------
function parseCookies(h) {
  const out = {};
  (h || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
async function userFromCookie(header) {
  const token = parseCookies(header).sid;
  if (!token) return null;
  if (sessions.has(token)) return sessions.get(token);
  const r = await pool.query('SELECT u.id, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1', [token]);
  if (!r.rows[0]) return null;
  sessions.set(token, r.rows[0]);
  return r.rows[0];
}

const app = express();
app.use(express.json());

app.post('/api/login', async (req, res) => {
  try {
    const { name, password } = req.body || {};
    const r = await pool.query('SELECT id, name, salt, hash FROM users WHERE lower(name) = lower($1)', [String(name || '').trim()]);
    const u = r.rows[0];
    if (!u || hashPw(password || '', u.salt) !== u.hash) return res.status(401).json({ error: 'Name oder Passwort falsch.' });
    const token = crypto.randomBytes(24).toString('hex');
    await pool.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, u.id]);
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 60}`);
    res.json({ user: { id: u.id, name: u.name } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Serverfehler' }); }
});

app.post('/api/logout', async (req, res) => {
  const token = parseCookies(req.headers.cookie).sid;
  if (token) { sessions.delete(token); await pool.query('DELETE FROM sessions WHERE token = $1', [token]).catch(() => {}); }
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', async (req, res) => {
  const u = await userFromCookie(req.headers.cookie).catch(() => null);
  if (!u) return res.status(401).json({ error: 'Nicht eingeloggt' });
  res.json({ user: u });
});

app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- Echtzeit (Socket.io) ----------
const server = http.createServer(app);
const io = new Server(server);

io.use(async (socket, next) => {
  try {
    const u = await userFromCookie(socket.handshake.headers.cookie);
    if (!u) return next(new Error('unauthorized'));
    socket.data.user = u;
    next();
  } catch (e) { next(new Error('unauthorized')); }
});

function gameList() {
  return [...games.values()].sort((a, b) => b.id - a.id).map(g => ({
    id: g.id, name: g.name, status: g.status, hostId: g.hostId,
    players: g.players.map(p => ({ id: p.userId, name: p.name })),
    size: g.settings.size, islands: g.settings.islands,
    current: g.status === 'playing' ? g.players[g.current].name : null,
    winner: g.winner !== null && g.winner !== undefined && g.players[g.winner] ? g.players[g.winner].name : null,
  }));
}

async function broadcast(g) {
  const sockets = await io.in('g' + g.id).fetchSockets();
  for (const s of sockets) s.emit('state', E.viewFor(g, s.data.user.id));
}

io.on('connection', socket => {
  const user = socket.data.user;
  const reply = (ack, data) => { if (typeof ack === 'function') ack(data); };

  socket.on('lobby:list', () => socket.emit('games', gameList()));

  socket.on('game:create', async (d, ack) => {
    try {
      d = d || {};
      const r = await pool.query("INSERT INTO games (state) VALUES ('{}') RETURNING id");
      const g = E.createGame({
        id: r.rows[0].id, name: String(d.name || '').trim().slice(0, 40) || 'Neue Runde',
        host: user, size: Number(d.size), islands: Number(d.islands),
      });
      games.set(g.id, g);
      await save(g);
      io.emit('games', gameList());
      reply(ack, { id: g.id });
    } catch (e) { console.error(e); reply(ack, { error: e.message }); }
  });

  socket.on('game:join', async (d, ack) => {
    const g = games.get(Number(d && d.id));
    if (!g) return reply(ack, { error: 'Spiel nicht gefunden.' });
    try { E.addPlayer(g, user); } catch (e) { return reply(ack, { error: e.message }); }
    save(g);
    reply(ack, { ok: true });
    io.emit('games', gameList());
    broadcast(g);
  });

  socket.on('game:open', d => {
    const g = games.get(Number(d && d.id));
    for (const room of socket.rooms) if (room.startsWith('g')) socket.leave(room);
    if (!g) return socket.emit('gameMissing', Number(d && d.id));
    socket.join('g' + g.id);
    socket.emit('state', E.viewFor(g, user.id));
  });

  socket.on('game:close', () => {
    for (const room of socket.rooms) if (room.startsWith('g')) socket.leave(room);
  });

  socket.on('game:delete', async (d, ack) => {
    const g = games.get(Number(d && d.id));
    if (!g) return reply(ack, { error: 'Spiel nicht gefunden.' });
    if (g.hostId !== user.id) return reply(ack, { error: 'Nur der Ersteller kann das Spiel löschen.' });
    games.delete(g.id);
    await pool.query('DELETE FROM games WHERE id = $1', [g.id]);
    io.to('g' + g.id).emit('gameMissing', g.id);
    io.emit('games', gameList());
    reply(ack, { ok: true });
  });

  socket.on('game:action', async (d, ack) => {
    const id = Number(d && d.id);
    const g = games.get(id);
    if (!g) return reply(ack, { error: 'Spiel nicht gefunden.' });
    const backup = JSON.stringify(g);
    const statusBefore = g.status;
    try {
      E.applyAction(g, user.id, (d && d.action) || {});
    } catch (e) {
      games.set(id, JSON.parse(backup)); // bei Fehlern nichts halb übernehmen
      if (!(e instanceof E.GameError)) console.error(e);
      return reply(ack, { error: e instanceof E.GameError ? e.message : 'Interner Fehler: ' + e.message });
    }
    reply(ack, { ok: true });
    await broadcast(g);
    save(g);
    if (g.status !== statusBefore || d.action.type === 'endTurn') io.emit('games', gameList());
  });
});

initDb().then(() => {
  server.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`));
}).catch(e => { console.error('Start fehlgeschlagen', e); process.exit(1); });
