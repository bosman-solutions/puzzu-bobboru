#!/usr/bin/env bash
# One-time admin bootstrap. Run on the control-plane node with privileges.
# Reads ci/deploy.env (or env): NFS_SERVER, NFS_PATH, API_SERVER.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/ci/deploy.env" ] && { set -a; . "$ROOT/ci/deploy.env"; set +a; }
: "${NFS_SERVER:?}"; : "${NFS_PATH:?}"; : "${API_SERVER:?}"
KUBECTL="${KUBECTL:-kubectl}"
NS=arcade
OUT="${KUBECONFIG_OUT:-/opt/puzzu/kubeconfig}"

# scores directory on the export
mkdir -p "$NFS_PATH"
chown 65534:65534 "$NFS_PATH"
chmod 0775 "$NFS_PATH"

# scores volume
$KUBECTL apply -f - <<YAML
apiVersion: v1
kind: PersistentVolume
metadata:
  name: puzzu-scores
  labels: { app: puzzu-api }
spec:
  capacity: { storage: 1Gi }
  accessModes: [ReadWriteMany]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: nfs-static
  mountOptions: [nfsvers=4.1, hard, noatime]
  nfs: { server: ${NFS_SERVER}, path: ${NFS_PATH} }
YAML

# scoped deploy identity
$KUBECTL apply -f "$ROOT/ci/rbac/puzzu-deployer.yaml"

# signing key (once)
$KUBECTL -n $NS get secret puzzu-api >/dev/null 2>&1 || \
  $KUBECTL -n $NS create secret generic puzzu-api \
    --from-literal=PUZZU_HMAC_SECRET="$(openssl rand -hex 32)"

# scoped kubeconfig for the runner
sleep 2
TOKEN=$($KUBECTL -n $NS get secret puzzu-deployer-token -o jsonpath='{.data.token}' | base64 -d)
CA=$($KUBECTL -n $NS get secret puzzu-deployer-token -o jsonpath='{.data.ca\.crt}')
mkdir -p "$(dirname "$OUT")"
cat > "$OUT" <<YAML
apiVersion: v1
kind: Config
clusters: [{ name: c, cluster: { server: ${API_SERVER}, certificate-authority-data: ${CA} } }]
users: [{ name: u, user: { token: ${TOKEN} } }]
contexts: [{ name: x, context: { cluster: c, namespace: ${NS}, user: u } }]
current-context: x
YAML
chmod 0644 "$OUT"
echo "bootstrap complete."
