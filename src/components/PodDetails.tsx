import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { useCluster } from '@/context/ClusterContext'
import { fetchPodDetail, fetchPodLogs } from '@/lib/k8s-client'
import { formatAge, formatCpuMillis, formatMemoryMi, parseCpuToMillis, parseMemoryToMi } from '@/lib/format'
import { GroupedNumber } from '@/components/GroupedNumber'
import { StatusBadge, phaseTone } from '@/components/StatusBadge'
import { SearchSelect } from '@/components/SearchSelect'
import { PodTerminal } from '@/components/PodTerminal'
import type { Pod, PodDetail } from '@/types/k8s'

type Tab = 'info' | 'yaml' | 'logs' | 'terminal'

const tabs: { id: Tab; label: string }[] = [
  { id: 'info', label: 'Сведения' },
  { id: 'yaml', label: 'YAML' },
  { id: 'logs', label: 'Логи' },
  { id: 'terminal', label: 'Terminal' },
]

interface PodDetailsProps {
  pod: Pod
  onBack: () => void
}

export function PodDetails({ pod, onBack }: PodDetailsProps) {
  const { connection } = useCluster()
  const [tab, setTab] = useState<Tab>('info')
  const [detail, setDetail] = useState<PodDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [logs, setLogs] = useState('')
  const [logContainer, setLogContainer] = useState('')
  const [logContainers, setLogContainers] = useState<string[]>([])
  const [logsError, setLogsError] = useState<string | null>(null)
  const [logsLoading, setLogsLoading] = useState(false)
  const [termNonce, setTermNonce] = useState(0)

  const ns = pod.metadata.namespace ?? ''
  const name = pod.metadata.name

  useEffect(() => {
    setTab('info')
    setDetail(null)
    setDetailError(null)
    setLogs('')
    setLogsError(null)
    setLogContainer('')
    setLogContainers([])
    setTermNonce(0)
  }, [pod.metadata.uid])

  useEffect(() => {
    if (!connection || !ns) return
    let cancelled = false
    setDetailLoading(true)
    void fetchPodDetail(connection, ns, name)
      .then((next) => {
        if (cancelled) return
        setDetail(next)
        setLogContainers(next.info.containers.filter((c) => !c.init).map((c) => c.name))
        setLogContainer((prev) => prev || next.info.spec.containers[0]?.name || '')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setDetailError(err instanceof Error ? err.message : 'Не удалось загрузить под')
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [connection, ns, name, pod.metadata.uid])

  const logContainerRef = useRef(logContainer)
  logContainerRef.current = logContainer
  const logsRequestId = useRef(0)

  const loadLogs = useCallback(
    async (container?: string, silent = false) => {
      if (!connection || !ns || !name) return
      const requestId = ++logsRequestId.current
      if (!silent) {
        setLogsLoading(true)
        setLogsError(null)
      }
      try {
        const result = await fetchPodLogs(connection, ns, name, container)
        if (requestId !== logsRequestId.current) return
        setLogs(result.logs)
        setLogContainers(result.containers)
        setLogContainer(result.container)
        setLogsError(null)
      } catch (err) {
        if (requestId !== logsRequestId.current) return
        if (!silent) {
          setLogsError(err instanceof Error ? err.message : 'Не удалось загрузить логи')
          setLogs('')
        }
      } finally {
        if (requestId === logsRequestId.current && !silent) setLogsLoading(false)
      }
    },
    [connection, ns, name],
  )

  useEffect(() => {
    if (tab !== 'logs') return
    void loadLogs(logContainerRef.current || undefined)
    const id = window.setInterval(() => {
      void loadLogs(logContainerRef.current || undefined, true)
    }, 2000)
    return () => {
      logsRequestId.current += 1
      window.clearInterval(id)
    }
  }, [pod.metadata.uid, tab, loadLogs])

  const info = detail?.info
  const cpu = info
    ? formatCpuMillis(parseCpuToMillis(info.status.cpuUsage, info.status.cpuMillis))
    : pod.status.cpuUsage
      ? formatCpuMillis(parseCpuToMillis(pod.status.cpuUsage, pod.status.cpuMillis))
      : null
  const memory = info
    ? formatMemoryMi(parseMemoryToMi(info.status.memoryUsage, info.status.memoryMi))
    : pod.status.memoryUsage
      ? formatMemoryMi(parseMemoryToMi(pod.status.memoryUsage, pod.status.memoryMi))
      : null

  const facts: { label: string; value: string }[] = [
    { label: 'Name', value: pod.metadata.name },
    { label: 'Namespace', value: pod.metadata.namespace ?? '—' },
    { label: 'Status', value: (info ?? pod).status.phase },
    { label: 'Ready', value: `${(info ?? pod).status.readyCount}/${(info ?? pod).status.containerCount}` },
    { label: 'Restarts', value: String((info ?? pod).status.restarts) },
    { label: 'Node', value: (info ?? pod).spec.nodeName ?? '—' },
    { label: 'Pod IP', value: (info ?? pod).status.podIP ?? '—' },
    { label: 'Host IP', value: info?.status.hostIP ?? '—' },
    { label: 'QoS', value: info?.status.qosClass ?? info?.spec.qosClass ?? '—' },
    { label: 'Service account', value: info?.spec.serviceAccount ?? '—' },
    { label: 'Restart policy', value: info?.spec.restartPolicy ?? '—' },
    { label: 'Created', value: formatAge(pod.metadata.creationTimestamp) },
    { label: 'Started', value: info?.status.startTime ? formatAge(info.status.startTime) : '—' },
  ]

  const onRefresh = () => {
    if (tab === 'logs') void loadLogs(logContainer || undefined)
    else if (tab === 'terminal') setTermNonce((n) => n + 1)
    else if (connection && ns) {
      setDetailLoading(true)
      void fetchPodDetail(connection, ns, name)
        .then(setDetail)
        .catch((err: unknown) => {
          setDetailError(err instanceof Error ? err.message : 'Не удалось загрузить под')
        })
        .finally(() => setDetailLoading(false))
    }
  }

  const execContainers = detail?.info.containers.filter((c) => !c.init).map((c) => c.name) ?? []
  const terminalContainers =
    execContainers.length > 0 ? execContainers : pod.spec.containers.map((c) => c.name)

  return (
    <div>
      <nav className="mb-3 flex items-center gap-1.5 font-mono text-xs text-ink-500">
        <button
          type="button"
          className="text-leaf-600 underline-offset-2 hover:underline"
          onClick={onBack}
        >
          Pods
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-ink-400" />
        <span>Pod details</span>
      </nav>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate font-display text-3xl font-bold tracking-tight text-ink-900">
              {pod.metadata.name}
            </h1>
            <StatusBadge tone={phaseTone((info ?? pod).status.phase)}>
              {(info ?? pod).status.phase}
            </StatusBadge>
          </div>
          <p className="mt-1 font-mono text-sm text-ink-500">{pod.metadata.namespace}</p>
        </div>
        <button
          type="button"
          className="btn-ghost shrink-0 border border-ink-200 bg-white/60"
          onClick={onRefresh}
          disabled={tab === 'logs' ? logsLoading : tab === 'terminal' ? false : detailLoading}
        >
          <RefreshCw
            className={`h-4 w-4 ${
              (tab === 'logs' && logsLoading) || (tab !== 'logs' && tab !== 'terminal' && detailLoading)
                ? 'animate-spin'
                : ''
            }`}
          />
          Обновить
        </button>
      </div>

      <div className="mb-6 flex gap-1 border-b border-ink-200">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === item.id
                ? 'border-leaf-600 text-ink-900'
                : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="space-y-6">
          {detailError && (
            <p className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
              {detailError}
            </p>
          )}
          {(cpu || memory) && (
            <p className="flex flex-wrap gap-4 font-mono text-xs text-ink-600">
              {cpu && (
                <span>
                  CPU <GroupedNumber value={cpu} />
                </span>
              )}
              {memory && (
                <span>
                  Memory <GroupedNumber value={memory} />
                </span>
              )}
            </p>
          )}
          <section className="surface px-5 py-4">
            <h2 className="mb-4 border-b border-ink-200/80 pb-3 font-display text-lg font-bold text-ink-900">
              Pod details
            </h2>
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {facts.map((row) => (
                <div key={row.label} className="min-w-0">
                  <dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                    {row.label}
                  </dt>
                  <dd className="mt-1 break-all font-mono text-sm text-ink-900" title={row.value}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            {info?.status.cpuRequest || info?.status.cpuLimit ? (
              <p className="mt-4 font-mono text-xs text-ink-500">
                Request {info.status.cpuRequest ?? '—'} / {info.status.memoryRequest ?? '—'}
                {' · '}
                Limit {info.status.cpuLimit ?? '—'} / {info.status.memoryLimit ?? '—'}
              </p>
            ) : null}
          </section>

          <section>
            <h3 className="mb-2 font-display text-base font-bold text-ink-900">Контейнеры</h3>
            <div className="overflow-hidden rounded border border-ink-200 bg-white/70">
              <table className="w-full text-left text-sm">
                <thead className="bg-ink-50/80 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-800">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">State</th>
                    <th className="px-3 py-2 font-medium">Ready</th>
                    <th className="px-3 py-2 font-medium">Restarts</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    info?.containers ??
                    pod.spec.containers.map((c) => ({
                      name: c.name,
                      image: c.image,
                      ready: false,
                      restarts: 0,
                      state: '—',
                      init: false,
                    }))
                  ).map((c) => (
                    <tr key={`${c.init ? 'init' : 'ctr'}:${c.name}`} className="border-t border-ink-100">
                      <td className="px-3 py-2">
                        <p className="font-medium text-ink-900">
                          {c.init ? `${c.name} (init)` : c.name}
                        </p>
                        <p className="font-mono text-[11px] text-ink-400">{c.image}</p>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{c.state}</td>
                      <td className="px-3 py-2 font-mono text-xs">{c.ready ? 'true' : 'false'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{c.restarts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {info?.conditions && info.conditions.length > 0 && (
            <section>
              <h3 className="mb-2 font-display text-base font-bold text-ink-900">Conditions</h3>
              <ul className="space-y-2">
                {info.conditions.map((c) => (
                  <li key={c.type} className="rounded border border-ink-200 bg-white/70 px-3 py-2">
                    <p className="font-mono text-sm text-ink-900">
                      {c.type}: {c.status}
                      {c.reason ? ` · ${c.reason}` : ''}
                    </p>
                    {c.message && <p className="mt-1 text-xs text-ink-500">{c.message}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {info?.volumes && info.volumes.length > 0 && (
            <section>
              <h3 className="mb-2 font-display text-base font-bold text-ink-900">Volumes</h3>
              <p className="font-mono text-xs text-ink-600">{info.volumes.join(', ')}</p>
            </section>
          )}

          {pod.metadata.labels && Object.keys(pod.metadata.labels).length > 0 && (
            <section>
              <h3 className="mb-2 font-display text-base font-bold text-ink-900">Labels</h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(pod.metadata.labels).map(([k, v]) => (
                  <span key={k} className="rounded bg-ink-100 px-2 py-0.5 font-mono text-[11px] text-ink-700">
                    {k}={v}
                  </span>
                ))}
              </div>
            </section>
          )}

          {detailLoading && !info && (
            <p className="font-mono text-sm text-ink-500">Загрузка сведений…</p>
          )}
        </div>
      )}

      {tab === 'yaml' && (
        <div>
          {detailError && (
            <p className="mb-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
              {detailError}
            </p>
          )}
          {detailLoading && !detail ? (
            <p className="font-mono text-sm text-ink-500">Загрузка YAML…</p>
          ) : (
            <pre className="overflow-x-auto rounded border border-ink-200 bg-ink-900 p-4 font-mono text-[12px] leading-relaxed text-leaf-400">
              {detail?.yaml ?? ''}
            </pre>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div>
          <div className="mb-3 max-w-[220px]">
            {logContainers.length > 0 && (
              <SearchSelect
                ariaLabel="Container"
                value={logContainer}
                options={logContainers}
                onChange={(next) => {
                  setLogContainer(next)
                  void loadLogs(next)
                }}
                placeholder="Контейнер"
                disabled={logsLoading && logContainers.length === 0}
              />
            )}
          </div>
          {logsError && (
            <p className="mb-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
              {logsError}
            </p>
          )}
          <pre className="max-h-[70vh] overflow-auto rounded border border-ink-200 bg-ink-900 p-4 font-mono text-[12px] leading-relaxed text-leaf-400">
            {logsLoading && !logs ? 'Загрузка логов…' : logs || 'Логов нет'}
          </pre>
        </div>
      )}

      {tab === 'terminal' && connection && (
        <PodTerminal
          connection={connection}
          namespace={ns}
          name={name}
          containers={terminalContainers}
          reconnectKey={termNonce}
        />
      )}
    </div>
  )
}
