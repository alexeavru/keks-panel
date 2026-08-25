import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useCluster } from '@/context/ClusterContext'
import {
  fetchReplicaSetDetail,
  fetchReplicaSetEvents,
  listReplicaSetPods,
  saveReplicaSetYaml,
} from '@/lib/k8s-client'
import { formatAge, formatCpuMillis, formatMemoryMi, parseCpuToMillis, parseMemoryToMi } from '@/lib/format'
import { GroupedNumber } from '@/components/GroupedNumber'
import { StatusBadge, podPhaseTone } from '@/components/StatusBadge'
import { PanelUser } from '@/components/PanelUser'
import { PodDetails } from '@/components/PodDetails'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import type { Pod, PodEvent, ReplicaSet, ReplicaSetDetail } from '@/types/k8s'

type Tab = 'info' | 'yaml' | 'pods' | 'events'

const tabs: { id: Tab; label: string }[] = [
  { id: 'info', label: 'Сведения' },
  { id: 'yaml', label: 'YAML' },
  { id: 'pods', label: 'Pods' },
  { id: 'events', label: 'Events' },
]

interface ReplicaSetDetailsProps {
  replicaSet: ReplicaSet
  onBack: () => void
  backLabel?: string
}

export function ReplicaSetDetails({ replicaSet, onBack, backLabel = 'ReplicaSets' }: ReplicaSetDetailsProps) {
  const { connection } = useCluster()
  const [tab, setTab] = useState<Tab>('info')
  const [detail, setDetail] = useState<ReplicaSetDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [events, setEvents] = useState<PodEvent[]>([])
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [pods, setPods] = useState<Pod[]>([])
  const [podsError, setPodsError] = useState<string | null>(null)
  const [podsLoading, setPodsLoading] = useState(false)
  const [selectedPod, setSelectedPod] = useState<Pod | null>(null)
  const [yamlText, setYamlText] = useState('')
  const [yamlDirty, setYamlDirty] = useState(false)
  const [yamlSaving, setYamlSaving] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [yamlSaved, setYamlSaved] = useState(false)
  const detailRequestId = useRef(0)

  const ns = replicaSet.metadata.namespace ?? ''
  const name = replicaSet.metadata.name
  const info = detail?.info
  const ready = (info ?? replicaSet).status.readyReplicas
  const desired = (info ?? replicaSet).spec.replicas
  const healthy = ready >= desired

  useEffect(() => {
    setTab('info')
    setDetail(null)
    setDetailError(null)
    setEvents([])
    setEventsError(null)
    setPods([])
    setPodsError(null)
    setSelectedPod(null)
    setYamlText('')
    setYamlDirty(false)
    setYamlSaving(false)
    setYamlError(null)
    setYamlSaved(false)
  }, [replicaSet.metadata.uid])

  const loadDetail = useCallback(
    async (silent = false) => {
      if (!connection || !ns || !name) return
      const requestId = ++detailRequestId.current
      if (!silent) {
        setDetailLoading(true)
        setDetailError(null)
      }
      try {
        const next = await fetchReplicaSetDetail(connection, ns, name)
        if (requestId !== detailRequestId.current) return
        setDetail(next)
        setDetailError(null)
      } catch (err) {
        if (requestId !== detailRequestId.current) return
        if (!silent) {
          setDetailError(err instanceof Error ? err.message : 'Не удалось загрузить replicaset')
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
  }, [loadDetail, replicaSet.metadata.uid])

  useEffect(() => {
    setDetail((prev) => {
      if (!prev || prev.info.metadata.uid !== replicaSet.metadata.uid) return prev
      return {
        ...prev,
        info: {
          ...prev.info,
          spec: { ...prev.info.spec, ...replicaSet.spec },
          status: { ...prev.info.status, ...replicaSet.status },
          owner: replicaSet.owner ?? prev.info.owner,
        },
      }
    })
  }, [replicaSet])

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
      const next = await saveReplicaSetYaml(connection, ns, name, yamlText)
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

  const loadEvents = useCallback(async () => {
    if (!connection || !ns || !name) return
    setEventsLoading(true)
    setEventsError(null)
    try {
      setEvents(await fetchReplicaSetEvents(connection, ns, name, replicaSet.metadata.uid))
    } catch (err) {
      setEventsError(err instanceof Error ? err.message : 'Не удалось загрузить events')
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }, [connection, ns, name, replicaSet.metadata.uid])

  useEffect(() => {
    if (tab !== 'events') return
    void loadEvents()
    const id = window.setInterval(() => void loadEvents(), 5000)
    return () => window.clearInterval(id)
  }, [tab, loadEvents])

  const loadPods = useCallback(
    async (silent = false) => {
      if (!connection || !ns || !name) return
      if (!silent) {
        setPodsLoading(true)
        setPodsError(null)
      }
      try {
        const next = await listReplicaSetPods(connection, ns, name)
        setPods(next)
        setSelectedPod((prev) =>
          prev ? (next.find((p) => p.metadata.uid === prev.metadata.uid) ?? prev) : prev,
        )
        setPodsError(null)
      } catch (err) {
        if (!silent) {
          setPodsError(err instanceof Error ? err.message : 'Не удалось загрузить поды')
        }
      } finally {
        if (!silent) setPodsLoading(false)
      }
    },
    [connection, ns, name],
  )

  useEffect(() => {
    if (tab !== 'pods' && !selectedPod) return
    void loadPods()
    const id = window.setInterval(() => void loadPods(true), 5000)
    return () => window.clearInterval(id)
  }, [tab, selectedPod, loadPods, replicaSet.metadata.uid])

  const current = info ?? replicaSet
  const facts: { label: string; value: string }[] = [
    { label: 'Name', value: replicaSet.metadata.name },
    { label: 'Namespace', value: replicaSet.metadata.namespace ?? '—' },
    { label: 'Ready', value: `${ready}/${desired}` },
    { label: 'Current', value: String(current.status.replicas) },
    { label: 'Available', value: String(current.status.availableReplicas) },
    { label: 'Fully labeled', value: String(current.status.fullyLabeledReplicas) },
    { label: 'Owner', value: current.owner || '—' },
    { label: 'Selector', value: current.spec.selector },
    { label: 'Generation', value: info?.status.observedGeneration != null ? String(info.status.observedGeneration) : '—' },
    {
      label: 'Min ready',
      value: info?.spec.minReadySeconds != null ? `${info.spec.minReadySeconds}s` : '—',
    },
    { label: 'Created', value: formatAge(replicaSet.metadata.creationTimestamp) },
  ]

  const podColumns: Column<Pod>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div>
          <p className="font-medium text-ink-900">{row.metadata.name}</p>
          <p className="font-mono text-[11px] text-ink-400">
            {row.spec.containers.map((c) => c.image).join(', ')}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge tone={podPhaseTone(row.status.state, row.status.ready)}>
          {row.status.state}
        </StatusBadge>
      ),
    },
    {
      key: 'ready',
      header: 'Ready',
      render: (row) => (
        <span className="font-mono text-xs">
          {row.status.readyCount}/{row.status.containerCount}
        </span>
      ),
    },
    {
      key: 'restarts',
      header: 'Restarts',
      render: (row) => <span className="font-mono text-xs">{row.status.restarts}</span>,
    },
    {
      key: 'cpu',
      header: 'CPU',
      className: 'whitespace-nowrap',
      render: (row) => (
        <span className="inline-block whitespace-nowrap font-mono text-xs text-ink-600">
          {row.status.cpuUsage ? (
            <GroupedNumber
              value={formatCpuMillis(parseCpuToMillis(row.status.cpuUsage, row.status.cpuMillis))}
            />
          ) : (
            '—'
          )}
        </span>
      ),
    },
    {
      key: 'mem',
      header: 'Memory',
      className: 'whitespace-nowrap',
      render: (row) => (
        <span className="inline-block whitespace-nowrap font-mono text-xs text-ink-600">
          {row.status.memoryUsage ? (
            <GroupedNumber
              value={formatMemoryMi(parseMemoryToMi(row.status.memoryUsage, row.status.memoryMi))}
            />
          ) : (
            '—'
          )}
        </span>
      ),
    },
    {
      key: 'node',
      header: 'Node',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">{row.spec.nodeName ?? '—'}</span>
      ),
    },
    {
      key: 'age',
      header: 'Age',
      render: (row) => (
        <span className="font-mono text-xs text-ink-500">
          {formatAge(row.metadata.creationTimestamp)}
        </span>
      ),
    },
  ]

  if (selectedPod) {
    return (
      <PodDetails
        pod={selectedPod}
        backLabel={name}
        onBack={() => {
          setSelectedPod(null)
          setTab('pods')
        }}
      />
    )
  }

  return (
    <div>
      <nav className="mb-3 flex items-center gap-1.5 font-mono text-xs text-ink-500">
        <button
          type="button"
          className="text-leaf-600 underline-offset-2 hover:underline"
          onClick={onBack}
        >
          {backLabel}
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-ink-400" />
        <span>ReplicaSet details</span>
      </nav>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate font-display text-3xl font-bold tracking-tight text-ink-900">
              {replicaSet.metadata.name}
            </h1>
            <StatusBadge tone={healthy ? 'ok' : 'warn'}>{healthy ? 'Ready' : 'Progressing'}</StatusBadge>
          </div>
          <p className="mt-1 font-mono text-sm text-ink-500">{replicaSet.metadata.namespace}</p>
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
          <section className="surface px-5 py-4">
            <h2 className="mb-4 border-b border-ink-200/80 pb-3 font-display text-lg font-bold text-ink-900">
              ReplicaSet details
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
          </section>

          {info?.containers && info.containers.length > 0 && (
            <section>
              <h3 className="mb-2 font-display text-base font-bold text-ink-900">Контейнеры</h3>
              <div className="overflow-hidden rounded border border-ink-200 bg-white/70">
                <table className="w-full text-left text-sm">
                  <thead className="bg-ink-50/80 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-800">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Image</th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.containers.map((c) => (
                      <tr key={c.name} className="border-t border-ink-100">
                        <td className="px-3 py-2 font-medium text-ink-900">{c.name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-ink-600">{c.image}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

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

          {replicaSet.metadata.labels && Object.keys(replicaSet.metadata.labels).length > 0 && (
            <section>
              <h3 className="mb-2 font-display text-base font-bold text-ink-900">Labels</h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(replicaSet.metadata.labels).map(([k, v]) => (
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

      {tab === 'pods' && (
        <div>
          {podsError && (
            <p className="mb-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
              {podsError}
            </p>
          )}
          <ResourceTable
            columns={podColumns}
            rows={pods}
            rowKey={(r) => r.metadata.uid}
            loading={podsLoading && pods.length === 0}
            onRowClick={setSelectedPod}
            empty="Подов этого replicaset нет"
          />
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
    </div>
  )
}
