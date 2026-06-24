/* Deterministic game core, shared by client and server.
   Same (seed, moves) gives the same score; the server verifies by replay.
   A move is an aim point {mx, my}; the engine integrates the shot itself. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PuzzuEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // geometry / rules; the render layer mirrors these
  const COLS_EVEN = 10, COLS_ODD = 9, ROWS = 12;
  const R = 16, DIAM = R * 2;
  const BOARD_W = 320, BOARD_H = 480;
  const SHOOTER_X = 160, SHOOTER_Y = 450;
  const COLORS = ['#ff6bcb', '#1a7fff', '#ffe66b', '#6bffb0', '#ff8c6b', '#b06bff'];
  const SNAP_DIST = R * 2.6;
  const DROP_EVERY = 10;
  const SHOT_SPEED = 8;
  const INITIAL_ROWS = 5;
  const DROP_FILL_CHANCE = 0.7;
  const FLIGHT_GUARD = 100000; // cap on integration steps

  // hand-rolled distance: identical rounding across JS engines
  function hyp(dx, dy) { return Math.sqrt(dx * dx + dy * dy); }

  // seedable PRNG; same seed gives the same stream
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Engine {
    constructor(seed) {
      this.seed = seed >>> 0;
      this.rng = mulberry32(this.seed);
      this.rowOffset = 0;
      this.score = 0;
      this.shots = 0;
      this.combo = 0;           // consecutive scoring shots
      this.maxCombo = 0;
      this.held = null;         // stashed color index (Tetris-style hold)
      this.holdLock = false;    // one hold per loaded bubble
      this.over = false;
      this.won = false;
      this.grid = [];
      this.moves = [];          // recorded for replay / submission
      this._buildGrid();
      this.current = this._color(); // color INDEX of the loaded bubble
      this.next = this._color();    // color INDEX of the on-deck bubble
    }

    _color() { return Math.floor(this.rng() * COLORS.length); }
    rowCols(r) { return ((r + this.rowOffset) % 2 === 0) ? COLS_EVEN : COLS_ODD; }

    _buildGrid() {
      this.grid = [];
      for (let r = 0; r < ROWS; r++) {
        const cols = this.rowCols(r);
        this.grid[r] = [];
        for (let c = 0; c < cols; c++) {
          this.grid[r][c] = (r < INITIAL_ROWS) ? this._color() : null;
        }
      }
    }

    colRow(c, r) {
      const off = ((r + this.rowOffset) % 2 === 0) ? 0 : R;
      return { x: R + c * DIAM + off, y: R + r * DIAM };
    }

    neighbors(r, c) {
      const even = (r + this.rowOffset) % 2 === 0;
      return [
        [r - 1, even ? c - 1 : c], [r - 1, even ? c : c + 1],
        [r, c - 1], [r, c + 1],
        [r + 1, even ? c - 1 : c], [r + 1, even ? c : c + 1],
      ].filter(([nr, nc]) => nr >= 0 && nr < ROWS && nc >= 0 && nc < this.rowCols(nr));
    }

    _validSnap(r, c) {
      if (r === 0) return true;
      for (const [nr, nc] of this.neighbors(r, c)) {
        if (this.grid[nr] && this.grid[nr][nc] != null) return true;
      }
      return false;
    }

    _nearestEmpty(px, py) {
      let best = null, bestD = Infinity;
      for (let r = 0; r < ROWS; r++) {
        const cols = this.rowCols(r);
        for (let c = 0; c < cols; c++) {
          if (this.grid[r] && this.grid[r][c] != null) continue;
          if (!this._validSnap(r, c)) continue;
          const { x, y } = this.colRow(c, r);
          const d = hyp(px - x, py - y);
          if (d < bestD) { bestD = d; best = { r, c }; }
        }
      }
      return bestD < SNAP_DIST ? best : null;
    }

    _floodColor(r, c, color, visited) {
      const key = r + ',' + c;
      if (visited.has(key)) return [];
      if (!this.grid[r] || c >= this.rowCols(r) || this.grid[r][c] !== color) return [];
      visited.add(key);
      let g = [[r, c]];
      for (const [nr, nc] of this.neighbors(r, c)) g = g.concat(this._floodColor(nr, nc, color, visited));
      return g;
    }

    _floodConnected(r, c, visited) {
      const key = r + ',' + c;
      if (visited.has(key)) return;
      if (!this.grid[r] || c >= this.rowCols(r) || this.grid[r][c] == null) return;
      visited.add(key);
      for (const [nr, nc] of this.neighbors(r, c)) this._floodConnected(nr, nc, visited);
    }

    _popGroup(r, c) {
      const color = this.grid[r][c];
      const group = this._floodColor(r, c, color, new Set());
      if (group.length < 3) return { score: 0, pops: [], drops: [] };
      const pops = group.map(([gr, gc]) => {
        const p = this.colRow(gc, gr);
        return { x: p.x, y: p.y, color: COLORS[this.grid[gr][gc]] };
      });
      group.forEach(([gr, gc]) => { this.grid[gr][gc] = null; });
      // orphan sweep: anything no longer anchored to row 0 falls
      const anchored = new Set();
      for (let c2 = 0; c2 < this.rowCols(0); c2++) {
        if (this.grid[0] && this.grid[0][c2] != null) this._floodConnected(0, c2, anchored);
      }
      const drops = [];
      for (let row = 0; row < ROWS; row++) {
        const cols = this.rowCols(row);
        for (let col = 0; col < cols; col++) {
          if (this.grid[row] && this.grid[row][col] != null && !anchored.has(row + ',' + col)) {
            const p = this.colRow(col, row);
            drops.push({ x: p.x, y: p.y, color: COLORS[this.grid[row][col]] });
            this.grid[row][col] = null;
          }
        }
      }
      return { score: group.length * 10 + drops.length * 20, pops, drops };
    }

    _dropGrid() {
      this.rowOffset++;
      for (let r = ROWS - 1; r > 0; r--) this.grid[r] = [...(this.grid[r - 1] || [])];
      const cols = this.rowCols(0);
      this.grid[0] = Array.from({ length: cols }, () => this.rng() < DROP_FILL_CHANCE ? this._color() : null);
    }

    _checkWin() { return this.grid.every(row => row.every(cell => cell == null)); }
    _checkLose() {
      const cols = this.rowCols(ROWS - 1);
      for (let c = 0; c < cols; c++) if (this.grid[ROWS - 1] && this.grid[ROWS - 1][c] != null) return true;
      return false;
    }

    _advance() { this.current = this.next; this.next = this._color(); }

    // Tetris-style hold: stash the loaded bubble, swap it back later.
    // One hold per loaded bubble (cleared on the next shot). Recorded for replay.
    hold(record = true) {
      if (this.over || this.holdLock) return { rejected: true };
      if (record) this.moves.push({ hold: true });
      this.holdLock = true;
      if (this.held === null) {       // first stash: pull the on-deck bubble in
        this.held = this.current;
        this.current = this.next;
        this.next = this._color();
      } else {                        // swap loaded <-> held
        const t = this.current; this.current = this.held; this.held = t;
      }
      return { held: this.held, current: this.current };
    }

    // flight path + resting point for (mx, my), without mutating state
    trace(mx, my) {
      const dx0 = mx - SHOOTER_X, dy0 = my - SHOOTER_Y;
      if (dy0 >= 0) return null;
      const len = hyp(dx0, dy0);
      let vx = (dx0 / len) * SHOT_SPEED, vy = (dy0 / len) * SHOT_SPEED;
      let x = SHOOTER_X, y = SHOOTER_Y;
      const points = [{ x, y }];
      for (let step = 0; step < FLIGHT_GUARD; step++) {
        x += vx; y += vy;
        if (x - R < 0) { x = R; vx *= -1; }
        if (x + R > BOARD_W) { x = BOARD_W - R; vx *= -1; }
        points.push({ x, y });
        if (y - R <= 0) return { points, final: { x, y: R } };
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < this.rowCols(r); c++) {
            if (!this.grid[r] || this.grid[r][c] == null) continue;
            const p = this.colRow(c, r);
            if (hyp(x - p.x, y - p.y) < DIAM - 2) return { points, final: { x, y } };
          }
        }
      }
      return { points, final: { x, y } };
    }

    // fire toward (mx, my): integrate, snap, pop, maybe drop; returns an event
    shoot(mx, my, record = true) {
      if (this.over) return { rejected: true };
      const dx0 = mx - SHOOTER_X, dy0 = my - SHOOTER_Y;
      if (dy0 >= 0) return { rejected: true }; // must aim upward
      if (record) this.moves.push({ mx, my });

      const len = hyp(dx0, dy0);
      let vx = (dx0 / len) * SHOT_SPEED, vy = (dy0 / len) * SHOT_SPEED;
      let x = SHOOTER_X, y = SHOOTER_Y;
      const color = this.current;
      this.shots++;
      this.holdLock = false;    // firing frees the hold for the new loaded bubble

      let pos = null;
      for (let step = 0; step < FLIGHT_GUARD; step++) {
        x += vx; y += vy;
        if (x - R < 0) { x = R; vx *= -1; }
        if (x + R > BOARD_W) { x = BOARD_W - R; vx *= -1; }
        if (y - R <= 0) { y = R; pos = this._nearestEmpty(x, y); break; }
        let hit = false;
        for (let r = 0; r < ROWS && !hit; r++) {
          for (let c = 0; c < this.rowCols(r); c++) {
            if (!this.grid[r] || this.grid[r][c] == null) continue;
            const p = this.colRow(c, r);
            if (hyp(x - p.x, y - p.y) < DIAM - 2) { hit = true; break; }
          }
        }
        if (hit) { pos = this._nearestEmpty(x, y); break; }
      }

      const ev = { color, gained: 0, base: 0, mult: 1, combo: this.combo, popped: false, lost: false, dropped: false, win: false, lose: false, landed: null, pops: [], drops: [] };

      if (!pos) {                 // failed snap loses the bubble; breaks the chain
        ev.lost = true;
        this.combo = 0; ev.combo = 0;
        this._advance();
        return ev;
      }

      const { r, c } = pos;
      this.grid[r][c] = color;
      ev.landed = { r, c };
      const res = this._popGroup(r, c);
      // combo: a scoring shot extends the chain; a dud breaks it. multiplier = chain length.
      if (res.score > 0) { this.combo++; if (this.combo > this.maxCombo) this.maxCombo = this.combo; }
      else this.combo = 0;
      const mult = this.combo > 0 ? this.combo : 1;
      const award = res.score * mult;
      ev.gained = award; ev.base = res.score; ev.mult = mult; ev.combo = this.combo;
      ev.popped = res.score > 0; ev.pops = res.pops; ev.drops = res.drops;
      this.score += award;

      if (this._checkWin()) { this.over = true; this.won = true; ev.win = true; return ev; }
      if (this._checkLose()) { this.over = true; ev.lose = true; return ev; }
      if (this.shots % DROP_EVERY === 0) {
        this._dropGrid(); ev.dropped = true;
        if (this._checkLose()) { this.over = true; ev.lose = true; return ev; }
      }
      this._advance();
      return ev;
    }

    // replay seed + moves to the authoritative result
    static replay(seed, moves) {
      const e = new Engine(seed);
      for (const m of moves) {
        if (e.over) break;
        if (m && m.hold === true) e.hold(false);
        else e.shoot(m.mx, m.my, false);
      }
      return { score: e.score, maxCombo: e.maxCombo, shots: e.shots, won: e.won, over: e.over, moves: moves.length };
    }

    static colorHex(i) { return COLORS[i]; }
  }

  Engine.CONST = {
    COLS_EVEN, COLS_ODD, ROWS, R, DIAM, BOARD_W, BOARD_H, SHOOTER_X, SHOOTER_Y,
    COLORS, SNAP_DIST, DROP_EVERY, SHOT_SPEED, INITIAL_ROWS,
  };
  Engine.mulberry32 = mulberry32;
  return Engine;
});
