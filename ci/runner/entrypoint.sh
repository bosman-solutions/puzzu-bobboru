#!/usr/bin/env bash
# Register (if needed) and run the runner. The PAT mints a registration token.
set -euo pipefail
: "${GH_OWNER:?}"; : "${GH_REPO:?}"; : "${GITHUB_PAT:?}"
RUNNER_NAME="${RUNNER_NAME:-puzzu-deploy}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,puzzu}"

token() {
  curl -fsSL -X POST \
    -H "Authorization: Bearer ${GITHUB_PAT}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/runners/registration-token" | jq -r .token
}

cd /home/runner
if [ ! -f .runner ]; then
  ./config.sh --unattended --replace \
    --url "https://github.com/${GH_OWNER}/${GH_REPO}" \
    --token "$(token)" --name "${RUNNER_NAME}" --labels "${RUNNER_LABELS}" --work _work
fi
exec ./run.sh
