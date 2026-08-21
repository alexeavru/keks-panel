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

- **Kubeconfig** — список contexts из `~/.kube/config`, подключение к выбранному кластеру
- **Demo** — локальный снимок без реального API

## Переменные

| Переменная | Описание |
|---|---|
| `KUBECONFIG` | Путь к kubeconfig (по умолчанию `~/.kube/config`) |
| `KEKS_API_PORT` | Порт API (по умолчанию `8787`) |
