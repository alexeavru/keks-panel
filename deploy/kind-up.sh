#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

./deploy/gen-oidc-certs.sh

kind delete cluster --name keks || true
kind create cluster --config deploy/kind.yaml

kubectl create namespace dex --dry-run=client -o yaml | kubectl apply -f -
kubectl -n dex create secret tls dex-tls \
  --cert=deploy/tls/tls.crt --key=deploy/tls/tls.key \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f deploy/dex.yaml
kubectl apply -f deploy/rbac-oidc.yaml

echo
echo "Dex: https://host.docker.internal:5556/dex"
echo "admin@keks.local / password"
echo "Браузер спросит про самоподписанный сертификат — нужно принять."
