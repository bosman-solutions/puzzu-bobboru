# Changelog

Notable changes to this project. Format follows Keep a Changelog; versions
follow Semantic Versioning.

## [Unreleased]

### Planned
- Full arcade leaderboard ranked 1st-20th with classic styling
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
