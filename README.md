# 🫧 Puzzu-Bobboru

A love letter to classic bubble shooters. Built for someone who deserves something made just for them.

## Play

Open `index.html` in any modern browser. No install, no server, no nonsense.

Or run it in Docker:

```bash
# Simple — just a port
docker compose -f docker-compose.simple.yml up -d
# Open http://localhost:8080

# With Traefik reverse proxy + TLS
docker compose up -d
```

## How to play
- Move your mouse to aim
- Click to shoot
- Match 3+ bubbles of the same color to pop them
- Orphaned bubbles (no longer connected to the top) fall for bonus points
- Clear the board to win

## Scoring
- 3+ match: 10pts per bubble
- Orphan drop: 20pts per bubble

## Stack
- Vanilla HTML5 Canvas + JavaScript
- Zero dependencies
- Single file
- 662 lines

## Deployment
- `docker-compose.simple.yml` — port 8080, no proxy, just works
- `docker-compose.yml` — Traefik labels, TLS via Let's Encrypt, production deployment
- GitHub Actions CI/CD to self-hosted runner

## Roadmap
- [ ] Sound effects
- [ ] High score persistence
- [ ] Mobile touch polish
- [ ] Difficulty levels
- [ ] Special bubbles (bomb, wildcard)
- [ ] GitHub Actions → GitHub Pages CI/CD

## License

MIT

## Made with
Claude (Weaver) + di$co + love
