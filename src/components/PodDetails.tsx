import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, Download } from 'lucide-react'
import { useCluster } from '@/context/ClusterContext'
import { fetchPodDetail, fetchPodLogs, fetchPodEvents, savePodYaml } from '@/lib/k8s-client'
import { formatAge, formatCpuMillis, formatMemoryMi, parseCpuToMillis, parseMemoryToMi } from '@/lib/format'
import { GroupedNumber } from '@/components/GroupedNumber'
import { StatusBadge, podPhaseTone, toneRow } from '@/components/StatusBadge'
import { SearchSelect } from '@/components/SearchSelect'
import { PanelUser } from '@/components/PanelUser'
import { PodTerminal } from '@/components/PodTerminal'
import type { Pod, PodDetail, PodEvent } from '@/types/k8s'

type Tab = 'info' | 'yaml' | 'events' | 'logs' | 'terminal'

const tabs: { id: Tab; label: string }[] = [
  { id: 'info', label: 'Сведения' },
  { id: 'yaml', label: 'YAML' },
  { id: 'events', label: 'Events' },
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
  const [logsLoading, setLogsLoading] = useState(false)
  const [events, setEvents] = useState<PodEvent[]>([])
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [yamlText, setYamlText] = useState('')
  const [yamlDirty, setYamlDirty] = useState(false)
  const [yamlSaving, setYamlSaving] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [yamlSaved, setYamlSaved] = useState(false)
  const detailRequestId = useRef(0)

  const ns = pod.metadata.namespace ?? ''
  const name = pod.metadata.name

  useEffect(() => {
    setTab('info')
    setDetail(null)
    setDetailError(null)
    setLogs('')
    setLogContainer('')
    setLogContainers([])
    setEvents([])
    setEventsError(null)
    setYamlText('')
    setYamlDirty(false)
    setYamlSaving(false)
    setYamlError(null)
    setYamlSaved(false)
  }, [pod.metadata.uid])

  const loadDetail = useCallback(
    async (silent = false) => {
      if (!connection || !ns || !name) return
      const requestId = ++detailRequestId.current
      if (!silent) {
        setDetailLoading(true)
        setDetailError(null)
      }
      try {
        const next = await fetchPodDetail(connection, ns, name)
        if (requestId !== detailRequestId.current) return
        setDetail(next)
        setLogContainers(next.info.containers.filter((c) => !c.init).map((c) => c.name))
        setLogContainer((prev) => prev || next.info.spec.containers[0]?.name || '')
        setDetailError(null)
      } catch (err) {
        if (requestId !== detailRequestId.current) return
        if (!silent) {
          setDetailError(err instanceof Error ? err.message : 'Не удалось загрузить под')
        }
      } finally {
        if (requestId === detailRequestId.current && !silent) setDetailLoading(false)
      }
    },
    [connection, ns, name],
  )

  useEffect(() => {
    void loadDetail()
    const id = window.setInterval(() => void loadDetail(true), 5000)
    return () => {
      detailRequestId.current += 1
      window.clearInterval(id)
    }
  }, [loadDetail, pod.metadata.uid])

  useEffect(() => {
    setDetail((prev) => {
      if (!prev || prev.info.metadata.uid !== pod.metadata.uid) return prev
      return {
        ...prev,
        info: {
          ...prev.info,
          spec: {
            ...prev.info.spec,
            nodeName: pod.spec.nodeName ?? prev.info.spec.nodeName,
          },
          status: {
            ...prev.info.status,
            ...pod.status,
          },
        },
      }
    })
  }, [pod])

  useEffect(() => {
    if (!detail?.yaml || yamlDirty || yamlSaving) return
    setYamlText(detail.yaml)
  }, [detail?.yaml, yamlDirty, yamlSaving])

  const saveYaml = useCallback(async () => {
    if (!connection || !ns || !name || yamlSaving) return
    setYamlSaving(true)
    setYamlError(null)
    setYamlSaved(false)
    try {
      const next = await savePodYaml(connection, ns, name, yamlText)
      setDetail(next)
      setYamlText(next.yaml)
      setYamlDirty(false)
      setYamlSaved(true)
    } catch (err) {
      setYamlError(err instanceof Error ? err.message : 'Не удалось сохранить YAML')
    } finally {
      setYamlSaving(false)
    }
  }, [connection, ns, name, yamlText, yamlSaving])

  useEffect(() => {
    if (tab !== 'yaml') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void saveYaml()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, saveYaml])

  const logContainerRef = useRef(logContainer)
  logContainerRef.current = logContainer
  const logsRequestId = useRef(0)

  const loadLogs = useCallback(
    async (container?: string, silent = false) => {
      if (!connection || !ns || !name) return
      const requestId = ++logsRequestId.current
      if (!silent) {
        setLogsLoading(true)
      }
      try {
        const result = await fetchPodLogs(connection, ns, name, container)
        if (requestId !== logsRequestId.current) return
        setLogs(result.logs)
        setLogContainers(result.containers)
        setLogContainer(result.container)
      } catch {
        if (requestId !== logsRequestId.current) return
        if (!silent) setLogs('')
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

  const loadEvents = useCallback(async () => {
    if (!connection || !ns || !name) return
    setEventsLoading(true)
    setEventsError(null)
    try {
      setEvents(await fetchPodEvents(connection, ns, name, pod.metadata.uid))
    } catch (err) {
      setEventsError(err instanceof Error ? err.message : 'Не удалось загрузить events')
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }, [connection, ns, name, pod.metadata.uid])

  useEffect(() => {
    if (tab !== 'events') return
    void loadEvents()
  }, [tab, loadEvents, pod.metadata.uid])

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
    { label: 'Status', value: (info ?? pod).status.state },
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

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate font-display text-3xl font-bold tracking-tight text-ink-900">
              {pod.metadata.name}
            </h1>
            <StatusBadge tone={podPhaseTone((info ?? pod).status.state, (info ?? pod).status.ready)}>
              {(info ?? pod).status.state}
            </StatusBadge>
          </div>
          <p className="mt-1 font-mono text-sm text-ink-500">{pod.metadata.namespace}</p>
        </div>
        <PanelUser />
      </div>

      <div className="mb-6 flex gap-1 border-b border-ink-200">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`-mb-px border-b-2 px-3 py-2 text-base font-medium transition ${
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
                <div key={row.label} className="min-w-0 rounded-lg bg-ink-50 px-3.5 py-3">
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
                      <td className="p-px">
                        <div
                          className={`rounded-md px-2.5 py-2 font-mono text-xs ${toneRow[podPhaseTone(c.state && c.state !== '—' ? c.state : (info ?? pod).status.state, c.ready)]}`}
                        >
                          {c.state}
                        </div>
                      </td>
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
          {yamlError && (
            <p className="mb-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
              {yamlError}
            </p>
          )}
          {yamlSaved && !yamlDirty && (
            <p className="mb-3 rounded border border-leaf-500/30 bg-leaf-500/10 px-3 py-2 text-sm text-leaf-700">
              YAML сохранён в кластер
            </p>
          )}
          <div className="mb-3 flex items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-8 min-w-[7.5rem] items-center justify-center rounded-lg border border-ink-300 bg-white px-3 text-sm font-medium text-ink-500 transition hover:bg-ink-50 hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={yamlSaving}
              onClick={() => {
                setYamlDirty(false)
                setYamlError(null)
                setYamlSaved(false)
                void loadDetail()
              }}
            >
              Reload
            </button>
            <button
              type="button"
              className="inline-flex h-8 min-w-[7.5rem] items-center justify-center rounded-lg border border-leaf-500/50 bg-leaf-400/5 px-3 text-sm font-medium text-leaf-600 transition hover:bg-leaf-400/10 hover:text-leaf-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={yamlSaving || !yamlText.trim()}
              onClick={() => void saveYaml()}
            >
              {yamlSaving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
          {detailLoading && !detail ? (
            <p className="font-mono text-sm text-ink-500">Загрузка YAML…</p>
          ) : (
            <textarea
              value={yamlText}
              spellCheck={false}
              onChange={(e) => {
                const next = e.target.value
                setYamlText(next)
                setYamlDirty(next !== (detail?.yaml ?? ''))
                setYamlSaved(false)
                setYamlError(null)
              }}
              className="min-h-[70vh] w-full resize-y rounded border border-ink-200 bg-ink-900 p-4 font-mono text-[13px] leading-relaxed text-white outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-500/20"
            />
          )}
        </div>
      )}

      {tab === 'events' && (
        <div>
          {eventsError && (
            <p className="mb-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
              {eventsError}
            </p>
          )}
          {eventsLoading && events.length === 0 ? (
            <p className="font-mono text-sm text-ink-500">Загрузка events…</p>
          ) : events.length === 0 ? (
            <p className="font-mono text-sm text-ink-500">Эвентов нет</p>
          ) : (
            <div className="overflow-hidden rounded border border-ink-200 bg-white/70">
              <table className="w-full text-left text-sm">
                <thead className="bg-ink-50/80 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-800">
                  <tr>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                    <th className="px-3 py-2 font-medium">Age</th>
                    <th className="px-3 py-2 font-medium">From</th>
                    <th className="px-3 py-2 font-medium">Message</th>
                    <th className="px-3 py-2 font-medium">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.uid} className="border-t border-ink-100 align-top">
                      <td className="px-3 py-2">
                        <StatusBadge tone={ev.type === 'Warning' ? 'warn' : 'ok'}>
                          {ev.type}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-ink-900">{ev.reason}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-500">
                        {ev.lastTimestamp ? formatAge(ev.lastTimestamp) : '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-ink-600">{ev.source}</td>
                      <td className="px-3 py-2 text-xs text-ink-800">{ev.message || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-ink-600">{ev.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="max-w-[220px] flex-1">
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
            <button
              type="button"
              className="btn-ghost shrink-0 border border-ink-200 bg-white/60"
              title="Выгрузить логи в файл"
              aria-label="Выгрузить логи в файл"
              disabled={!logs || logsLoading}
              onClick={() => {
                const blob = new Blob([logs], { type: 'text/plain;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                const suffix = logContainer ? `-${logContainer}` : ''
                link.href = url
                link.download = `${name}${suffix}.log`
                link.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
          <pre className="max-h-[70vh] overflow-auto rounded border border-ink-200 bg-ink-900 p-4 font-mono text-[12px] leading-relaxed text-white">
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
        />
      )}
    </div>
  )
}
