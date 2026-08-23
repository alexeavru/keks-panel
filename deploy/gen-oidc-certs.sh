#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TLS="$ROOT/deploy/tls"
mkdir -p "$TLS"

openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout "$TLS/ca.key" -out "$TLS/ca.crt" \
  -subj "/CN=keks-local-ca"

openssl req -newkey rsa:2048 -nodes \
  -keyout "$TLS/tls.key" -out "$TLS/tls.csr" \
  -subj "/CN=host.docker.internal"

cat > "$TLS/san.cnf" <<'EOF'
subjectAltName=DNS:host.docker.internal,DNS:localhost,DNS:dex.dex.svc.cluster.local,IP:127.0.0.1
EOF

openssl x509 -req -in "$TLS/tls.csr" -CA "$TLS/ca.crt" -CAkey "$TLS/ca.key" \
  -CAcreateserial -out "$TLS/tls.crt" -days 3650 -sha256 \
  -extfile "$TLS/san.cnf"

rm -f "$TLS/tls.csr" "$TLS/ca.srl"
echo "certs: $TLS"
