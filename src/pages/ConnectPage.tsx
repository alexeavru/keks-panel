import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Cable, FileKey2, FlaskConical, RefreshCw, Sparkles } from 'lucide-react'
import { useCluster } from '@/context/ClusterContext'
import { fetchKubeContexts } from '@/lib/k8s-client'
import type { ConnectionMode, KubeContextInfo } from '@/types/k8s'

export function ConnectPage() {
  const { connection, connect, connecting, error } = useCluster()
  const navigate = useNavigate()

  const [mode, setMode] = useState<ConnectionMode>('kubeconfig')
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
    if (mode === 'kubeconfig') {
      void loadContexts()
    }
  }, [mode])

  if (connection) {
    return <Navigate to="/cluster" replace />
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    try {
      if (mode === 'demo') {
        await connect({
          name: 'demo',
          host: '',
          token: '',
          skipTlsVerify: true,
          mode: 'demo',
        })
      } else {
        const ctx = contexts.find((c) => c.name === selectedContext)
        await connect({
          name: selectedContext,
          host: ctx?.server ?? '',
          token: '',
          skipTlsVerify: true,
          mode: 'kubeconfig',
          context: selectedContext,
        })
      }
      navigate('/cluster')
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Ошибка подключения')
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-wash bg-grid">
      <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-leaf-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-ember-400/15 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16 lg:flex-row lg:items-center lg:gap-16 lg:px-10">
        <section className="mb-12 max-w-xl lg:mb-0 lg:flex-1">
          <p className="font-display text-5xl font-extrabold tracking-tight text-ink-900 sm:text-6xl">
            KEKS
          </p>
          <h1 className="mt-4 font-display text-2xl font-bold leading-snug text-ink-800 sm:text-3xl">
            Панель для подключения к кластеру и просмотра сущностей Kubernetes
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink-600">
            Подключайтесь через локальный <span className="font-mono text-sm">~/.kube/config</span>{' '}
            — или откройте demo-снимок без реального кластера.
          </p>
          <ul className="mt-8 space-y-3 font-mono text-sm text-ink-600">
            <li className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-leaf-600" />
              Namespaces · Pods · Deployments · Services · Nodes
            </li>
            <li className="flex items-center gap-2">
              <FileKey2 className="h-4 w-4 text-leaf-600" />
              Контексты из kubeconfig
            </li>
          </ul>
        </section>

        <section className="w-full max-w-md lg:flex-1">
          <form onSubmit={onSubmit} className="surface p-6 sm:p-7">
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-ink-100/70 p-1">
              <button
                type="button"
                onClick={() => setMode('kubeconfig')}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  mode === 'kubeconfig'
                    ? 'bg-white text-ink-900 shadow-sm'
                    : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                <Cable className="h-4 w-4" />
                Kubeconfig
              </button>
              <button
                type="button"
                onClick={() => setMode('demo')}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  mode === 'demo'
                    ? 'bg-white text-ink-900 shadow-sm'
                    : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                <FlaskConical className="h-4 w-4" />
                Demo
              </button>
            </div>

            <div className="space-y-4">
              {mode === 'kubeconfig' ? (
                <>
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
                    <label className="label" htmlFor="context">
                      Context
                    </label>
                    {contextsLoading && contexts.length === 0 ? (
                      <div className="field animate-pulse bg-ink-100 text-ink-400">Загрузка…</div>
                    ) : (
                      <select
                        id="context"
                        className="field appearance-none bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-9"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235a7266' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                        }}
                        value={selectedContext}
                        onChange={(e) => setSelectedContext(e.target.value)}
                        required
                        disabled={contexts.length === 0}
                      >
                        {contexts.length === 0 ? (
                          <option value="">Нет контекстов</option>
                        ) : (
                          contexts.map((ctx) => (
                            <option key={ctx.name} value={ctx.name}>
                              {ctx.name}
                              {ctx.current ? ' (current)' : ''} — {ctx.cluster}
                            </option>
                          ))
                        )}
                      </select>
                    )}
                  </div>

                  {selectedContext && (
                    <div className="rounded-xl border border-ink-200 bg-ink-50/70 px-4 py-3 font-mono text-xs text-ink-600">
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
                </>
              ) : (
                <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 px-4 py-3 text-sm leading-relaxed text-ink-600">
                  Demo загружает локальный снимок кластера — без реального API. Удобно сразу
                  посмотреть UI сущностей.
                </p>
              )}
            </div>

            {(localError || error) && (
              <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
                {localError || error}
              </p>
            )}

            <button
              type="submit"
              className="btn-primary mt-6 w-full"
              disabled={
                connecting ||
                (mode === 'kubeconfig' && (!selectedContext || !!contextsError || contextsLoading))
              }
            >
              {connecting
                ? 'Подключение…'
                : mode === 'demo'
                  ? 'Открыть demo'
                  : 'Подключиться'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
