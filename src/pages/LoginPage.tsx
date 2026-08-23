import { KeyRound } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export function LoginPage() {
  const { user, loading } = useAuth()
  const [params] = useSearchParams()
  const error = params.get('error')

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 bg-tri-grid">
        <p className="font-mono text-sm text-ink-500">Проверка сессии…</p>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/connect" replace />
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-50 bg-tri-grid">
      <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-leaf-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-ember-400/15 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <p className="font-display text-5xl font-extrabold tracking-tight text-ink-900">KEKS</p>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink-800">Вход в панель</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-600">
          Авторизация через Dex, как в OpenShift: панель не хранит пароль, вход на стороне identity
          provider.
        </p>

        <div className="surface mt-8 p-6">
          {error && (
            <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
              Не удалось войти: {error}
            </p>
          )}
          <a href="/api/auth/login" className="btn-primary w-full">
            <KeyRound className="h-4 w-4" />
            Войти через Dex
          </a>
          <p className="mt-4 font-mono text-[11px] leading-relaxed text-ink-400">
            Локально: admin@keks.local / password
            <br />
            Dex: http://127.0.0.1:5556 (npm run dev:dex)
          </p>
        </div>
      </div>
    </div>
  )
}
