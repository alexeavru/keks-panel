# KEKS Panel

UI для подключения к Kubernetes и просмотра сущностей.

## Требования

- Node.js **≥ 20** (рекомендуется 22+)
- Локальный `~/.kube/config` для режима kubeconfig

## Запуск

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH"   # если node в PATH старый
npm install --registry https://registry.npmjs.org/
npm run dev
```

Откройте http://localhost:5173

- **API** слушает `:8787` и читает `~/.kube/config`
- **Vite** проксирует `/api` → API

## Режимы

- **Kubeconfig** — context из `~/.kube/config`, права пользователя kubeconfig
- **Dex** — вход через OIDC, kube-apiserver проверяет `id_token` и применяет RBAC (`User` = email)

## Dex + RBAC кластера

Kube-apiserver должен доверять Dex (`deploy/kind.yaml`). После логина панель ходит в API с Bearer `id_token`, без credentials из kubeconfig.

kube-apiserver (в том числе 1.30) требует **HTTPS** issuer. Локально Dex поднимается с самоподписанным сертификатом.

```bash
chmod +x deploy/kind-up.sh deploy/gen-oidc-certs.sh
./deploy/kind-up.sh
```

Скрипт сгенерирует `deploy/tls`, создаст kind 1.30, применит Dex и RBAC. Issuer в токенах: `https://host.docker.internal:5556/dex` (для kube-apiserver внутри kind). Браузер и локальный API открывают Dex как `https://localhost:5556/dex` — на macOS `host.docker.internal` обычно не резолвится. Порт `:5556` уже проброшен, `npm run dev:dex` не нужен.

Локально: `admin@keks.local` / `password`. Браузер один раз предупредит про сертификат — нужно принять.

Ключи подписи Dex пишутся в sqlite на ноде kind (`/var/lib/keks-dex`), чтобы после рестарта пода токены не становились `401 Unauthorized`. Если ключи всё же сменились (новый кластер, смена storage) — выйдите и войдите через Dex снова.

## Переменные

| Переменная | Описание |
|---|---|
| `KUBECONFIG` | Путь к kubeconfig (режим kubeconfig и fallback адреса API) |
| `KEKS_API_PORT` | Порт API (по умолчанию `8787`) |
| `DEX_ISSUER` | Issuer в токенах / kube-apiserver (по умолчанию `https://host.docker.internal:5556/dex`) |
| `DEX_PUBLIC_URL` | URL Dex для браузера и локального API (по умолчанию `https://localhost:5556/dex`) |
| `DEX_CA_FILE` | CA Dex для API (по умолчанию `deploy/tls/ca.crt`) |
| `DEX_CLIENT_ID` / `DEX_CLIENT_SECRET` | OAuth-клиент панели |
| `DEX_REDIRECT_URI` | Callback (`http://localhost:5173/api/auth/callback`) |
| `K8S_API_SERVER` | URL kube-apiserver для Dex (иначе берётся `cluster.server` из kubeconfig) |
| `K8S_CA_FILE` / `K8S_CA_DATA` | CA кластера для Dex |
| `K8S_SKIP_TLS_VERIFY` | `true` — не проверять TLS (kind) |
