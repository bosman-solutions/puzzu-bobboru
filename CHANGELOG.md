# Changelog

Notable changes to this project. Format follows Keep a Changelog; versions
follow Semantic Versioning.

## [Unreleased]

### Added
- Full arcade leaderboard: top-20 ranked rows (ordinal + gold/silver/bronze for
  the top three), a RANKS button to view it any time, and a top-20 game-over
  board.
- Visual feedback: particle bursts when bubbles pop and falling-bubble cascades
  when orphans drop. The engine now reports popped/dropped cells (position and
  color) for rendering only.
- Combo system: consecutive scoring shots build a chain whose length is the score
  multiplier (computed in the engine, so it stays replay-verified). A COMBO
  readout, a combo callout on big chains, and rising "+N" point numbers at each
  pop/drop.
- A second leaderboard ranked by best combo (`/api/leaderboard?board=combo`), with
  a SCORE / COMBO toggle in the RANKS view.
- Drop telegraph: the board shakes harder over the few shots before a row drops,
  with a top warning glow — no more surprise drops.
- Hold (Tetris-style): stash the loaded bubble and swap it back later — one hold
  per loaded bubble. The hold slot by the cannon is the control — tap it to
  stash/swap (or press `H`).
- Move stream is now typed (shots + holds) so player actions replay on the
  server — the foundation for future player-activated powers.
- Save / resume a game in progress. A save stores only `{seed, moves}` server-side
  under a random code (kept in localStorage); resume replays it to rebuild the
  exact board and hands back a freshly-signed session. SAVE / RESUME buttons.
- Hold moved to a themed power tile at the top-left (tap the tile or press `H`),
  built as a generic slot for future powers. Less crowding at the cannon.
- Aim spike: a direction indicator on the cannon arc that points where you aim
  (alongside the dotted line for now).

- UI: controls on the left rail, stats on the right — less crowding (no board
  geometry change).

### Planned
- API request / observability logging

### Fixed
- Status line showed "offline" on a healthy game because it was set before the
  session request resolved.

## [2.0.0] - 2026-06-23

### Added
- Server-authoritative leaderboard: seeded, signed games; the server replays
  submitted moves to compute the score, so the client total is never trusted.
- Shared deterministic engine (`engine.js`) run byte-for-byte by browser and
  server.
- Zero-dependency Node API: session, score, leaderboard; atomic JSON storage on
  a network volume with a single writer.
- Arcade 3-letter initials entry and a live high-score panel.
- NEXT bubble shown beside the cannon.
- Kubernetes manifests and a containerized self-hosted CI runner that deploys on
  push via a namespace-scoped identity.
- Determinism and forged-score unit tests; an HTTP round-trip test.

### Changed
- Reworked from a single static file into a client/server architecture.

## [1.0.0] - 2026-06-12

### Added
- Core bubble-shooter gameplay: aiming, popping, orphan drops, win/lose.
- Sound effects, mobile touch controls, and phone scaling.
