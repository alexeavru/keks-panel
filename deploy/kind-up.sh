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
kubectl -n dex rollout status deploy/dex --timeout=120s

# Дождаться JWKS, иначе apiserver закэширует пустые/старые ключи.
for _ in $(seq 1 30); do
  if docker exec keks-control-plane curl -skf --cacert /etc/keks-oidc/ca.crt \
    https://host.docker.internal:5556/dex/keys >/dev/null; then
    break
  fi
  sleep 2
done

# Первый JWKS kube-apiserver должен увидеть уже живой Dex.
# Static pod: kubectl delete не перезапускает контейнер.
cid="$(docker exec keks-control-plane crictl ps --name kube-apiserver -q | head -1)"
docker exec keks-control-plane crictl stop "$cid" >/dev/null
kubectl wait --for=condition=Ready pod -n kube-system -l component=kube-apiserver --timeout=180s

echo
echo "Dex: https://host.docker.internal:5556/dex"
echo "admin@keks.local / password"
echo "Браузер спросит про самоподписанный сертификат — нужно принять."
