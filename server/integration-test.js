// integration-test.js — drive the REAL http server end to end.
// Spawns server.js with a throwaway secret + temp data dir, then plays a real
// game and tries to cheat it over the wire. Run: node integration-test.js
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const Engine = require('../engine.js');

// the server requires ./engine.js next to itself (as it is in the container,
// where both land in /app). Mirror that for local runs without committing a dup.
fs.copyFileSync(path.join(__dirname, '..', 'engine.js'), path.join(__dirname, 'engine.js'));

const PORT = 8137;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'puzzu-'));
let pass = true;
const ok = (c, l) => { console.log((c ? '  ✓ ' : '  ✗ ') + l); if (!c) pass = false; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const srv = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, PUZZU_HMAC_SECRET: 'test-secret-not-prod' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', (d) => process.stderr.write('[srv] ' + d));

  try {
    // wait for listen
    for (let i = 0; i < 50; i++) {
      try { const h = await fetch(BASE + '/api/health'); if (h.ok) break; } catch (_) {}
      await sleep(100);
    }

    console.log('\n== session: server issues a signed seed ==');
    const sess = await (await fetch(BASE + '/api/session', { method: 'POST' })).json();
    ok(typeof sess.seed === 'number' && sess.sig, `got seed=${sess.seed} sid=${sess.sid.slice(0, 8)}…`);

    // play a real, finished game on the issued seed
    const e = new Engine(sess.seed);
    const aims = [[60, 40], [160, 30], [260, 40], [110, 50], [210, 50], [40, 60], [290, 60], [160, 25]];
    let i = 0;
    while (!e.over && i < 4000) { const [mx, my] = aims[i % aims.length]; e.shoot(mx, my); i++; }
    console.log(`  played a real game: score=${e.score}, shots=${e.shots}, over=${e.over}`);

    console.log('\n== THE ATTACK over HTTP: submit real moves, claim a fake score ==');
    const submit = await fetch(BASE + '/api/score', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sid: sess.sid, seed: sess.seed, iat: sess.iat, sig: sess.sig,
        moves: e.moves, initials: 'di$', claimedScore: 9999999, // <- the lie
      }),
    });
    const sb = await submit.json();
    ok(submit.status === 200 && sb.accepted, 'submission accepted');
    ok(sb.score === e.score, `server-authored score (${sb.score}) == real (${e.score}), NOT 9999999`);
    ok(sb.leaderboard[0].initials === 'DI_', 'initials sanitized di$ -> DI_');

    console.log('\n== forgery 1: self-chosen seed with no valid signature ==');
    const forge = await fetch(BASE + '/api/score', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid: 'deadbeef', seed: 123, iat: Date.now(), sig: 'x'.repeat(64), moves: [{ mx: 160, my: 10 }], initials: 'HAX' }),
    });
    ok(forge.status === 403, `unsigned seed rejected (${forge.status})`);

    console.log('\n== forgery 2: replay the same winning token twice ==');
    const dupe = await fetch(BASE + '/api/score', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid: sess.sid, seed: sess.seed, iat: sess.iat, sig: sess.sig, moves: e.moves, initials: 'AAA' }),
    });
    ok(dupe.status === 409, `double-submit of one game rejected (${dupe.status})`);

    console.log('\n== leaderboard reflects exactly one honest entry ==');
    const lb = await (await fetch(BASE + '/api/leaderboard')).json();
    ok(lb.leaderboard.length === 1 && lb.leaderboard[0].score === e.score, 'board has the one real score');
  } finally {
    srv.kill('SIGKILL');
    fs.rmSync(DATA, { recursive: true, force: true });
  }
  console.log('\n' + (pass ? 'ALL GREEN — the server only believes what it can replay.' : 'FAILURES ABOVE') + '\n');
  process.exit(pass ? 0 : 1);
}
main();
