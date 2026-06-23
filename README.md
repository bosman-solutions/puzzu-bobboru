# 🫧 Puzzu-Bobboru

A bubble shooter with a server-verified arcade leaderboard.

## Play

The leaderboard is server-authoritative: each game is seeded and signed by the
server, and scores come only from replayed moves. Opening `index.html` directly
runs a solo game without the leaderboard.

## How to play

- Aim with the mouse, or drag on touch
- Click or lift to shoot
- Match 3+ like colors to pop; bubbles cut off from the top fall for bonus
- Clear the board to win, then enter 3-letter initials

## Scoring

- 3+ match: 10 per bubble
- Orphan drop: 20 per bubble

## Anti-cheat

The game core (`engine.js`) is shared by the browser and the server. The server
issues a seeded game and signs the seed; the client submits its moves, and the
server replays them through the same engine to compute the score. The submitted
score is advisory only.

## Layout

```
engine.js                    shared deterministic core
index.html                   render, input, networking, leaderboard
server/server.js             leaderboard API
test-engine.js               determinism + forged-score checks
server/integration-test.js   HTTP round-trip checks
k8s/                         deployment manifests
ci/                          self-hosted runner + deploy
```

## API

- `POST /api/session` -> `{ sid, seed, iat, sig }`
- `POST /api/score` -> `{ sid, seed, iat, sig, moves[], initials }`
- `GET /api/leaderboard`

## Tests

```
node test-engine.js
cd server && node integration-test.js
```

## Deploy

Pushing to `main` triggers a self-hosted runner that deploys to a Kubernetes
namespace through a scoped service account. The runner, one-time bootstrap, and
Ansible playbook live in `ci/`; copy `ci/deploy.env.example` to `ci/deploy.env`
and fill it in.

## Roadmap

- Full arcade leaderboard: ranked 1st-20th with classic styling
- Request / observability logging in the API
- Difficulty levels
- Special bubbles (bomb, wildcard)

## License

MIT
