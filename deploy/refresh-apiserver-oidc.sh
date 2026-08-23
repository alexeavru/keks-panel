#!/usr/bin/env bash
# Перечитывает JWKS Dex в kube-apiserver kind-кластера keks.
# kubectl delete pod для static pod НЕ перезапускает контейнер — нужен crictl stop.
set -euo pipefail

CONTEXT="${KUBECONTEXT:-kind-keks}"
NODE="${KEKS_NODE:-keks-control-plane}"

before="$(kubectl --context "$CONTEXT" -n kube-system get pod -l component=kube-apiserver \
  -o jsonpath='{.items[0].status.containerStatuses[0].state.running.startedAt}' 2>/dev/null || true)"
echo "kube-apiserver startedAt до: ${before:-unknown}"

cid="$(docker exec "$NODE" crictl ps --name kube-apiserver -q | head -1)"
if [[ -z "$cid" ]]; then
  echo "не найден контейнер kube-apiserver в $NODE" >&2
  exit 1
fi
echo "останавливаю $cid"
docker exec "$NODE" crictl stop "$cid" >/dev/null

echo "жду Ready..."
kubectl --context "$CONTEXT" wait --for=condition=Ready pod -n kube-system -l component=kube-apiserver --timeout=180s

after="$(kubectl --context "$CONTEXT" -n kube-system get pod -l component=kube-apiserver \
  -o jsonpath='{.items[0].status.containerStatuses[0].state.running.startedAt}')"
echo "kube-apiserver startedAt после: $after"
if [[ -n "$before" && "$before" == "$after" ]]; then
  echo "контейнер не перезапустился" >&2
  exit 1
fi
echo "JWKS будет запрошен заново. Войдите через Dex ещё раз."
