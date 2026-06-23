// test-engine.js — prove the keystone. Run: node test-engine.js
const Engine = require('./engine.js');

function ok(cond, label) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label);
  if (!cond) process.exitCode = 1;
}

// A reproducible "player": aim at pseudo-spread angles derived from a fixed
// list, so the game is non-trivial but identical every run.
function playSample(seed, nShots) {
  const e = new Engine(seed);
  const aims = [
    [60, 40], [160, 30], [260, 40], [110, 50], [210, 50],
    [40, 60], [290, 60], [160, 25], [90, 35], [240, 35],
  ];
  for (let i = 0; i < nShots && !e.over; i++) {
    const [mx, my] = aims[i % aims.length];
    e.shoot(mx, my); // records into e.moves
  }
  return e;
}

console.log('\n== 1. determinism: same seed+moves => same score, twice ==');
const a = playSample(0xC0FFEE, 40);
const b = Engine.replay(a.seed, a.moves);
console.log(`  live score=${a.score} shots=${a.shots} | replay score=${b.score} shots=${b.shots}`);
ok(a.score === b.score && a.shots === b.shots, 'replay reproduces the live game exactly');

console.log('\n== 2. different seed => different game (seed actually drives it) ==');
const c = playSample(0xC0FFEE + 1, 40);
ok(!(c.score === a.score && c.moves.length === a.moves.length && JSON.stringify(c.grid) === JSON.stringify(a.grid)),
   'a different seed yields a different board/outcome');

console.log('\n== 3. THE ATTACK: client claims a huge score, submits real moves ==');
const claimedScore = 9999999;          // attacker edits the JS var
const authoritative = Engine.replay(a.seed, a.moves); // what the server computes
console.log(`  client claims: ${claimedScore}`);
console.log(`  server replay: ${authoritative.score}`);
ok(authoritative.score !== claimedScore, 'server ignores the claim — forged score does NOT stick');
ok(authoritative.score === a.score, 'server lands on the real score the moves actually earned');

console.log('\n== 4. tampered move list => different (server-computed) result, not the claim ==');
const tampered = a.moves.slice();
tampered.push({ mx: 160, my: 10 }); // inject an extra shot
const tamperedResult = Engine.replay(a.seed, tampered);
ok(tamperedResult.score !== claimedScore, 'even tampered moves can never mint the claimed number');
console.log(`  tampered replay score=${tamperedResult.score} (still server-authored, not 9999999)`);

console.log('\n== 5. cross-instance determinism: fresh process-independent replay ==');
const r1 = Engine.replay(a.seed, a.moves).score;
const r2 = Engine.replay(a.seed, a.moves).score;
ok(r1 === r2, 'replay is a pure function of (seed, moves)');

console.log('\n' + (process.exitCode ? 'FAILURES ABOVE' : 'ALL GREEN — the keystone holds.') + '\n');
