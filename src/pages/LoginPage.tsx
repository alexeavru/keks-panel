import { useEffect, useState, type FormEvent } from 'react'
import { FileKey2, KeyRound, RefreshCw } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useCluster } from '@/context/ClusterContext'
import { SearchSelect } from '@/components/SearchSelect'
import { loadConnection } from '@/lib/connection-storage'
import { fetchKubeContexts, loginWithKubeconfig } from '@/lib/k8s-client'
import type { KubeContextInfo } from '@/types/k8s'

type Method = 'dex' | 'kubeconfig'

export function LoginPage() {
  const { user, loading, applySession, logout } = useAuth()
  const { connect, connecting } = useCluster()
  const [params] = useSearchParams()
  const dexError = params.get('error')

  const [method, setMethod] = useState<Method>(dexError ? 'dex' : 'kubeconfig')
  const [contexts, setContexts] = useState<KubeContextInfo[]>([])
  const [kubePath, setKubePath] = useState('~/.kube/config')
  const [contextsLoading, setContextsLoading] = useState(false)
  const [contextsError, setContextsError] = useState<string | null>(null)
  const [selectedContext, setSelectedContext] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const loadContexts = async () => {
    setContextsLoading(true)
    setContextsError(null)
    try {
      const data = await fetchKubeContexts()
      setContexts(data.contexts)
      setKubePath(data.path)
      const current = data.contexts.find((c) => c.current) ?? data.contexts[0]
      setSelectedContext((prev) => prev || current?.name || '')
    } catch (err) {
      setContexts([])
      setContextsError(err instanceof Error ? err.message : 'Не удалось прочитать kubeconfig')
    } finally {
      setContextsLoading(false)
    }
  }

  useEffect(() => {
    if (method !== 'kubeconfig') return
    void loadContexts()
  }, [method])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 bg-tri-grid">
        <p className="font-mono text-sm text-ink-500">Проверка сессии…</p>
      </div>
    )
  }

  if (user) {
    if (user.provider === 'dex') {
      return <Navigate to="/cluster" replace />
    }
    return <Navigate to={loadConnection() ? '/cluster' : '/connect'} replace />
  }

  const onKubeconfigSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    try {
      const result = await loginWithKubeconfig(selectedContext)
      await connect({
        name: result.context,
        host: result.server,
        token: '',
        skipTlsVerify: true,
        mode: 'kubeconfig',
        context: result.context,
      })
      applySession(result.user)
    } catch (err) {
      await logout()
      setLocalError(err instanceof Error ? err.message : 'Не удалось войти через kubeconfig')
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-50 bg-tri-grid">
      <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-leaf-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-ember-400/15 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <p className="font-display text-5xl font-extrabold tracking-tight text-ink-900">KEKS</p>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink-800">Вход в панель</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-600">
          Войдите через Dex или подключитесь локальным kubeconfig.
        </p>

        <div className="surface mt-8 p-6">
          <div className="mb-5 flex gap-1 border-b border-ink-200">
            {(
              [
                { id: 'kubeconfig' as const, label: 'Kubeconfig' },
                { id: 'dex' as const, label: 'Dex' },
              ]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                  method === item.id
                    ? 'border-leaf-600 text-ink-900'
                    : 'border-transparent text-ink-500 hover:text-ink-800'
                }`}
                onClick={() => {
                  setMethod(item.id)
                  setLocalError(null)
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {method === 'dex' && (
            <div>
              {dexError && (
                <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
                  Не удалось войти: {dexError}
                </p>
              )}
              <p className="mb-4 text-sm leading-relaxed text-ink-600">
                Авторизация через Dex: Kubernetes проверяет id_token и применяет RBAC пользователя.
              </p>
              <a href="/api/auth/login" className="btn-primary w-full">
                <KeyRound className="h-4 w-4" />
                Войти через Dex
              </a>
              <p className="mt-4 font-mono text-[11px] leading-relaxed text-ink-400">
                Локально: admin@keks.local / password
                <br />
                Dex: https://localhost:5556 (самоподписанный сертификат)
              </p>
            </div>
          )}

          {method === 'kubeconfig' && (
            <form onSubmit={(e) => void onKubeconfigSubmit(e)}>
              {localError && (
                <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
                  {localError}
                </p>
              )}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="label mb-0">Файл</p>
                    <p className="mt-1 truncate font-mono text-xs text-ink-500" title={kubePath}>
                      {kubePath}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost shrink-0 border border-ink-200 bg-white/70"
                    onClick={() => void loadContexts()}
                    disabled={contextsLoading}
                  >
                    <RefreshCw className={`h-4 w-4 ${contextsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div>
                  <p className="label">Context</p>
                  {contextsLoading && contexts.length === 0 ? (
                    <div className="field animate-pulse bg-ink-100 text-ink-400">Загрузка…</div>
                  ) : (
                    <SearchSelect
                      ariaLabel="Context"
                      value={selectedContext}
                      options={contexts.map((ctx) => ctx.name)}
                      onChange={setSelectedContext}
                      placeholder={contexts.length === 0 ? 'Нет контекстов' : 'Выберите context'}
                      disabled={contexts.length === 0}
                    />
                  )}
                </div>

                {selectedContext && (
                  <div className="rounded border border-ink-200 bg-ink-50/70 px-4 py-3 font-mono text-xs text-ink-600">
                    {(() => {
                      const ctx = contexts.find((c) => c.name === selectedContext)
                      if (!ctx) return null
                      return (
                        <dl className="space-y-1.5">
                          <div className="flex gap-2">
                            <dt className="w-20 shrink-0 text-ink-400">cluster</dt>
                            <dd className="truncate">{ctx.cluster}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="w-20 shrink-0 text-ink-400">user</dt>
                            <dd className="truncate">{ctx.user}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="w-20 shrink-0 text-ink-400">server</dt>
                            <dd className="truncate" title={ctx.server}>
                              {ctx.server ?? '—'}
                            </dd>
                          </div>
                        </dl>
                      )
                    })()}
                  </div>
                )}

                {contextsError && (
                  <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
                    {contextsError}
                    <span className="mt-1 block text-xs opacity-80">
                      Запустите API-сервер: npm run dev
                    </span>
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="btn-primary mt-6 w-full"
                disabled={connecting || !selectedContext || !!contextsError || contextsLoading}
              >
                <FileKey2 className="h-4 w-4" />
                {connecting ? 'Подключение…' : 'Войти через kubeconfig'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
