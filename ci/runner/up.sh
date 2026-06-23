#!/usr/bin/env bash
# Build and (re)start the runner container on the deploy host.
set -euo pipefail
: "${GITHUB_PAT:?}"; : "${GH_OWNER:?}"; : "${GH_REPO:?}"; : "${INGRESS_HOST:?}"

HERE="$(cd "$(dirname "$0")" && pwd)"
docker build -t puzzu-runner:latest "$HERE"
docker rm -f puzzu-runner 2>/dev/null || true
docker run -d \
  --name puzzu-runner \
  --restart=unless-stopped \
  -e GH_OWNER -e GH_REPO -e GITHUB_PAT -e INGRESS_HOST \
  -v puzzu-runner-cfg:/home/runner \
  -v /opt/puzzu/kubeconfig:/home/runner/.kube/config:ro \
  puzzu-runner:latest
