/* Authoritative leaderboard API; Node builtins only.
   The client submits {seed, moves[]}; the server replays via engine.js and ranks
   the computed score. Storage is one JSON file in DATA_DIR, written atomically by
   a single writer. */
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Engine = require('./engine.js');

// config (env-overridable)
const PORT = parseInt(process.env.PORT || '8080', 10);
const DATA_DIR = process.env.DATA_DIR || '/data';
const SECRET = process.env.PUZZU_HMAC_SECRET || '';
const MAX_BOARD = parseInt(process.env.MAX_BOARD || '100', 10);
const MAX_MOVES = parseInt(process.env.MAX_MOVES || '5000', 10);
const TOKEN_TTL_MS = parseInt(process.env.TOKEN_TTL_MS || String(2 * 60 * 60 * 1000), 10);
const MAX_BODY = 256 * 1024; // 256 KB cap on request bodies

if (!SECRET) {
  console.error('FATAL: PUZZU_HMAC_SECRET is not set. Refusing to start with an empty signing key.');
  process.exit(1);
}

const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const USED_FILE = path.join(DATA_DIR, 'used-sids.json');

// atomic JSON persistence
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return fallback; }
}
function writeJSONAtomic(file, obj) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file); // atomic on POSIX same-filesystem
}

fs.mkdirSync(DATA_DIR, { recursive: true });
let board = readJSON(SCORES_FILE, []);          // [{initials, score, shots, won, ts}]
let usedSids = new Map(Object.entries(readJSON(USED_FILE, {}))); // sid -> ts (one submit per game)

function pruneUsed() {
  const cutoff = Date.now() - TOKEN_TTL_MS;
  for (const [sid, ts] of usedSids) if (ts < cutoff) usedSids.delete(sid);
}

// stateless signed seed
function sign(sid, seed, iat) {
  return crypto.createHmac('sha256', SECRET).update(`${sid}.${seed}.${iat}`).digest('hex');
}
function timingSafeEq(a, b) {
  const ab = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// input hygiene
function sanitizeInitials(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, '_');
}
function validMoves(moves) {
  if (!Array.isArray(moves) || moves.length === 0 || moves.length > MAX_MOVES) return false;
  const { BOARD_W, BOARD_H } = Engine.CONST;
  for (const m of moves) {
    if (!m || typeof m.mx !== 'number' || typeof m.my !== 'number') return false;
    if (!Number.isFinite(m.mx) || !Number.isFinite(m.my)) return false;
    if (m.mx < -BOARD_W || m.mx > 2 * BOARD_W || m.my < -BOARD_H || m.my > 2 * BOARD_H) return false;
  }
  return true;
}

// per-IP token-bucket rate limit
const buckets = new Map();
function rateLimited(ip, cost = 1, capacity = 30, refillPerSec = 0.5) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b) { b = { tokens: capacity, last: now }; buckets.set(ip, b); }
  b.tokens = Math.min(capacity, b.tokens + ((now - b.last) / 1000) * refillPerSec);
  b.last = now;
  if (b.tokens < cost) return true;
  b.tokens -= cost;
  return false;
}

// http helpers
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '', size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return (xff ? String(xff).split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';
}

function publicBoard() {
  return board.slice(0, MAX_BOARD).map((e, i) => ({
    rank: i + 1, initials: e.initials, score: e.score, won: !!e.won, ts: e.ts,
  }));
}

// routes
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const ip = clientIp(req);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, { ok: true, board: board.length });
  }

  if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
    return send(res, 200, { leaderboard: publicBoard() });
  }

  if (req.method === 'POST' && url.pathname === '/api/session') {
    if (rateLimited(ip, 1)) return send(res, 429, { error: 'slow down' });
    const sid = crypto.randomBytes(12).toString('hex');
    const seed = crypto.randomBytes(4).readUInt32BE(0);
    const iat = Date.now();
    return send(res, 200, { sid, seed, iat, sig: sign(sid, seed, iat) });
  }

  if (req.method === 'POST' && url.pathname === '/api/score') {
    if (rateLimited(ip, 3)) return send(res, 429, { error: 'slow down' });
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch (_) { return send(res, 400, { error: 'bad json' }); }

    const { sid, seed, iat, sig, moves, initials } = body || {};

    // 1. the seed must be one WE issued (signature) — no self-chosen seeds
    if (typeof sid !== 'string' || typeof seed !== 'number' || typeof iat !== 'number' || typeof sig !== 'string') {
      return send(res, 400, { error: 'missing fields' });
    }
    if (!timingSafeEq(sig, sign(sid, seed >>> 0, iat))) {
      return send(res, 403, { error: 'bad signature' });
    }
    // 2. token freshness
    const age = Date.now() - iat;
    if (age < 0 || age > TOKEN_TTL_MS) return send(res, 403, { error: 'token expired' });
    // 3. one submission per issued game
    pruneUsed();
    if (usedSids.has(sid)) return send(res, 409, { error: 'already submitted' });
    // 4. move sanity
    if (!validMoves(moves)) return send(res, 400, { error: 'bad moves' });

    // 5. THE authoritative computation — replay it ourselves
    const result = Engine.replay(seed >>> 0, moves);
    if (!result.over) return send(res, 422, { error: 'game did not finish' });

    // commit
    usedSids.set(sid, Date.now());
    const entry = {
      initials: sanitizeInitials(initials),
      score: result.score,
      shots: result.shots,
      won: result.won,
      ts: Date.now(),
    };
    board.push(entry);
    board.sort((a, b) => b.score - a.score || a.ts - b.ts); // higher score, earlier wins ties
    board = board.slice(0, Math.max(MAX_BOARD, 500));        // keep a little history beyond the shown board
    writeJSONAtomic(SCORES_FILE, board);
    writeJSONAtomic(USED_FILE, Object.fromEntries(usedSids));

    const rank = board.findIndex((e) => e === entry) + 1;
    return send(res, 200, {
      accepted: true,
      score: result.score,
      won: result.won,
      rank: rank <= MAX_BOARD ? rank : null,
      leaderboard: publicBoard(),
    });
  }

  return send(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('handler error:', err && err.message);
    if (!res.headersSent) send(res, 500, { error: 'internal' });
  });
});

server.listen(PORT, () => console.log(`puzzu-api listening on :${PORT}, data=${DATA_DIR}, board=${board.length}`));
