#!/usr/bin/env bash
# Build and (re)start the runner container on the deploy host.
# Reads ci/deploy.env (or env): GITHUB_PAT, INGRESS_HOST.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
[ -f "$ROOT/ci/deploy.env" ] && { set -a; . "$ROOT/ci/deploy.env"; set +a; }
: "${GITHUB_PAT:?set in ci/deploy.env}"
: "${INGRESS_HOST:?set in ci/deploy.env}"

REMOTE="$(git -C "$ROOT" config --get remote.origin.url)" \
  || { echo "not a git clone — clone the repo (don't use a tarball)"; exit 1; }
slug="$(printf '%s' "$REMOTE" | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
GH_OWNER="${slug%%/*}"
GH_REPO="${slug##*/}"
echo "runner -> ${GH_OWNER}/${GH_REPO}, ingress ${INGRESS_HOST}"

docker build -t puzzu-runner:latest "$HERE"
docker rm -f puzzu-runner 2>/dev/null || true
docker run -d \
  --name puzzu-runner \
  --restart=unless-stopped \
  -e GH_OWNER="$GH_OWNER" -e GH_REPO="$GH_REPO" -e GITHUB_PAT -e INGRESS_HOST \
  -v puzzu-runner-cfg:/home/runner \
  -v /opt/puzzu/kubeconfig:/home/runner/.kube/config:ro \
  puzzu-runner:latest
echo "runner started; follow with: docker logs -f puzzu-runner"
