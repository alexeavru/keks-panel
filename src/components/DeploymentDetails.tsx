import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Columns2, X } from 'lucide-react'
import { useCluster } from '@/context/ClusterContext'
import {
  fetchDeploymentDetail,
  fetchDeploymentEvents,
  listDeploymentPods,
  listDeploymentReplicaSets,
  listDeployments,
  listNamespaces,
  saveDeploymentYaml,
} from '@/lib/k8s-client'
import { formatAge, formatCreatedAt, formatCpuMillis, formatMemoryMi, parseCpuToMillis, parseMemoryToMi } from '@/lib/format'
import { GroupedNumber } from '@/components/GroupedNumber'
import { StatusBadge, podPhaseTone } from '@/components/StatusBadge'
import { SearchInput } from '@/components/SearchInput'
import { NamespaceFilter } from '@/components/NamespaceFilter'
import { PanelUser } from '@/components/PanelUser'
import { PodDetails } from '@/components/PodDetails'
import { ReplicaSetDetails } from '@/components/ReplicaSetDetails'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import type { Deployment, DeploymentDetail, Pod, PodEvent, ReplicaSet } from '@/types/k8s'

type Tab = 'info' | 'yaml' | 'replicasets' | 'pods' | 'events'

const tabs: { id: Tab; label: string }[] = [
  { id: 'info', label: 'Сведения' },
  { id: 'yaml', label: 'YAML' },
  { id: 'replicasets', label: 'ReplicaSets' },
  { id: 'pods', label: 'Pods' },
  { id: 'events', label: 'Events' },
]

interface DeploymentDetailsProps {
  deployment: Deployment
  onBack: () => void
  allowSplit?: boolean
  showUser?: boolean
  onCloseSplit?: () => void
}

function SecondDeploymentPicker({
  excludeUid,
  onSelect,
  onClose,
}: {
  excludeUid: string
  onSelect: (deployment: Deployment) => void
  onClose: () => void
}) {
  const { connection, namespace: clusterNs } = useCluster()
  const [items, setItems] = useState<Deployment[]>([])
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [filterNs, setFilterNs] = useState(clusterNs ?? '')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setFilterNs(clusterNs ?? '')
  }, [clusterNs])

  useEffect(() => {
    if (!connection) return
    let cancelled = false
    setLoading(true)
    void Promise.all([
      listDeployments(connection),
      listNamespaces(connection).catch(() => [] as { metadata: { name: string } }[]),
    ])
      .then(([all, nsItems]) => {
        if (cancelled) return
        const deps = all.filter((d) => d.metadata.uid !== excludeUid)
        setItems(deps)
        const fromList = nsItems.map((n) => n.metadata.name)
        const fromDeps = deps
          .map((d) => d.metadata.namespace)
          .filter((name): name is string => Boolean(name))
        setNamespaces([...new Set([...fromList, ...fromDeps])].sort())
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [connection, excludeUid])

  const rows = useMemo(() => {
    let list = filterNs ? items.filter((d) => d.metadata.namespace === filterNs) : items
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (d) =>
          d.metadata.name.toLowerCase().includes(q) ||
          (d.metadata.namespace ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [items, filterNs, query])

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Второй deployment</h1>
          <p className="mt-1 text-sm text-ink-500">Выбор deployment</p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-300 bg-white text-ink-500 transition hover:bg-ink-50 hover:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
          title="Закрыть второе окно"
          aria-label="Закрыть второе окно"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-[180px] sm:max-w-[240px]">
          <NamespaceFilter namespaces={namespaces} value={filterNs} onChange={setFilterNs} />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Имя…" />
      </div>
      {loading ? (
        <p className="font-mono text-sm text-ink-500">Загрузка deployments…</p>
      ) : rows.length === 0 ? (
        <p className="font-mono text-sm text-ink-500">Подходящих deployment нет</p>
      ) : (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded border border-ink-200 bg-white/70">
          {rows.map((d) => {
            const ok = d.status.readyReplicas >= d.spec.replicas
            return (
              <li key={d.metadata.uid}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-leaf-500/[0.06]"
                  onClick={() => onSelect(d)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink-900">{d.metadata.name}</span>
                    <span className="font-mono text-[11px] text-ink-500">{d.metadata.namespace}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs text-ink-600">
                      {d.status.readyReplicas}/{d.spec.replicas}
                    </span>
                    <StatusBadge tone={ok ? 'ok' : 'warn'}>{ok ? 'Ready' : 'Progressing'}</StatusBadge>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function DeploymentDetails({
  deployment,
  onBack,
  allowSplit = true,
  showUser = true,
  onCloseSplit,
}: DeploymentDetailsProps) {
  const { connection } = useCluster()
  const [tab, setTab] = useState<Tab>('info')
  const [detail, setDetail] = useState<DeploymentDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [events, setEvents] = useState<PodEvent[]>([])
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [pods, setPods] = useState<Pod[]>([])
  const [podsError, setPodsError] = useState<string | null>(null)
  const [podsLoading, setPodsLoading] = useState(false)
  const [selectedPod, setSelectedPod] = useState<Pod | null>(null)
  const [replicaSets, setReplicaSets] = useState<ReplicaSet[]>([])
  const [replicaSetsError, setReplicaSetsError] = useState<string | null>(null)
  const [replicaSetsLoading, setReplicaSetsLoading] = useState(false)
  const [selectedReplicaSet, setSelectedReplicaSet] = useState<ReplicaSet | null>(null)
  const [yamlText, setYamlText] = useState('')
  const [yamlDirty, setYamlDirty] = useState(false)
  const [yamlSaving, setYamlSaving] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [yamlSaved, setYamlSaved] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [secondDeployment, setSecondDeployment] = useState<Deployment | null>(null)
  const detailRequestId = useRef(0)

  const ns = deployment.metadata.namespace ?? ''
  const name = deployment.metadata.name
  const info = detail?.info
  const ready = (info ?? deployment).status.readyReplicas
  const desired = (info ?? deployment).spec.replicas
  const healthy = ready >= desired && desired > 0

  useEffect(() => {
    setTab('info')
    setDetail(null)
    setDetailError(null)
    setEvents([])
    setEventsError(null)
    setPods([])
    setPodsError(null)
    setSelectedPod(null)
    setReplicaSets([])
    setReplicaSetsError(null)
    setSelectedReplicaSet(null)
    setYamlText('')
    setYamlDirty(false)
    setYamlSaving(false)
    setYamlError(null)
    setYamlSaved(false)
    setSplitOpen(false)
    setSecondDeployment(null)
  }, [deployment.metadata.uid])

  const loadDetail = useCallback(
    async (silent = false) => {
      if (!connection || !ns || !name) return
      const requestId = ++detailRequestId.current
      if (!silent) {
        setDetailLoading(true)
        setDetailError(null)
      }
      try {
        const next = await fetchDeploymentDetail(connection, ns, name)
        if (requestId !== detailRequestId.current) return
        setDetail(next)
        setDetailError(null)
      } catch (err) {
        if (requestId !== detailRequestId.current) return
        if (!silent) {
          setDetailError(err instanceof Error ? err.message : 'Не удалось загрузить deployment')
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
  }, [loadDetail, deployment.metadata.uid])

  useEffect(() => {
    setDetail((prev) => {
      if (!prev || prev.info.metadata.uid !== deployment.metadata.uid) return prev
      return {
        ...prev,
        info: {
          ...prev.info,
          spec: { ...prev.info.spec, ...deployment.spec },
          status: { ...prev.info.status, ...deployment.status },
        },
      }
    })
  }, [deployment])

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
      const next = await saveDeploymentYaml(connection, ns, name, yamlText)
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
      setEvents(await fetchDeploymentEvents(connection, ns, name, deployment.metadata.uid))
    } catch (err) {
      setEventsError(err instanceof Error ? err.message : 'Не удалось загрузить events')
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }, [connection, ns, name, deployment.metadata.uid])

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
        const next = await listDeploymentPods(connection, ns, name)
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
  }, [tab, selectedPod, loadPods, deployment.metadata.uid])

  const loadReplicaSets = useCallback(
    async (silent = false) => {
      if (!connection || !ns || !name) return
      if (!silent) {
        setReplicaSetsLoading(true)
        setReplicaSetsError(null)
      }
      try {
        const next = await listDeploymentReplicaSets(connection, ns, name)
        setReplicaSets(next)
        setSelectedReplicaSet((prev) =>
          prev ? (next.find((r) => r.metadata.uid === prev.metadata.uid) ?? prev) : prev,
        )
        setReplicaSetsError(null)
      } catch (err) {
        if (!silent) {
          setReplicaSetsError(err instanceof Error ? err.message : 'Не удалось загрузить replicaset')
        }
      } finally {
        if (!silent) setReplicaSetsLoading(false)
      }
    },
    [connection, ns, name],
  )

  useEffect(() => {
    if (tab !== 'replicasets' && !selectedReplicaSet) return
    void loadReplicaSets()
    const id = window.setInterval(() => void loadReplicaSets(true), 5000)
    return () => window.clearInterval(id)
  }, [tab, selectedReplicaSet, loadReplicaSets, deployment.metadata.uid])

  const facts: { label: string; value: string }[] = [
    { label: 'Name', value: deployment.metadata.name },
    { label: 'Namespace', value: deployment.metadata.namespace ?? '—' },
    { label: 'Ready', value: `${ready}/${desired}` },
    { label: 'Up-to-date', value: String((info ?? deployment).status.updatedReplicas) },
    { label: 'Available', value: String((info ?? deployment).status.availableReplicas) },
    { label: 'Replicas', value: String(info?.status.replicas ?? desired) },
    { label: 'Unavailable', value: String(info?.status.unavailableReplicas ?? 0) },
    { label: 'Strategy', value: info?.spec.strategy ?? '—' },
    { label: 'Selector', value: (info ?? deployment).spec.selector },
    { label: 'Generation', value: info?.status.observedGeneration != null ? String(info.status.observedGeneration) : '—' },
    {
      label: 'Revision history',
      value: info?.spec.revisionHistoryLimit != null ? String(info.spec.revisionHistoryLimit) : '—',
    },
    {
      label: 'Progress deadline',
      value: info?.spec.progressDeadlineSeconds != null ? `${info.spec.progressDeadlineSeconds}s` : '—',
    },
    {
      label: 'Min ready',
      value: info?.spec.minReadySeconds != null ? `${info.spec.minReadySeconds}s` : '—',
    },
    { label: 'Created', value: formatAge(deployment.metadata.creationTimestamp) },
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

  const replicaSetColumns: Column<ReplicaSet>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <span className={`font-medium ${row.spec.replicas === 0 ? 'text-ink-400' : 'text-ink-900'}`}>
          {row.metadata.name}
        </span>
      ),
    },
    {
      key: 'ready',
      header: 'Ready',
      render: (row) => {
        const inactive = row.spec.replicas === 0
        const ok = row.status.readyReplicas >= row.spec.replicas
        return (
          <div className="flex items-center gap-2">
            <span className={`font-mono text-xs ${inactive ? 'text-ink-400' : ''}`}>
              {row.status.readyReplicas}/{row.spec.replicas}
            </span>
            <span className={inactive ? 'opacity-50' : undefined}>
              <StatusBadge tone={ok ? 'ok' : 'warn'}>{ok ? 'Ready' : 'Progressing'}</StatusBadge>
            </span>
          </div>
        )
      },
    },
    {
      key: 'current',
      header: 'Current',
      render: (row) => (
        <span className={`font-mono text-xs ${row.spec.replicas === 0 ? 'text-ink-400' : ''}`}>
          {row.status.replicas}
        </span>
      ),
    },
    {
      key: 'age',
      header: 'Age',
      render: (row) => (
        <span className={`font-mono text-xs ${row.spec.replicas === 0 ? 'text-ink-400' : 'text-ink-500'}`}>
          {formatAge(row.metadata.creationTimestamp)}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      className: 'w-px whitespace-nowrap',
      render: (row) => (
        <span className={`font-mono text-xs ${row.spec.replicas === 0 ? 'text-ink-400' : 'text-ink-500'}`}>
          {formatCreatedAt(row.metadata.creationTimestamp)}
        </span>
      ),
    },
  ]

  if (selectedReplicaSet) {
    return (
      <ReplicaSetDetails
        replicaSet={selectedReplicaSet}
        backLabel={name}
        onBack={() => {
          setSelectedReplicaSet(null)
          setTab('replicasets')
        }}
        allowSplit={allowSplit}
        showUser={showUser}
        onCloseSplit={onCloseSplit}
      />
    )
  }

  if (selectedPod) {
    return (
      <PodDetails
        pod={selectedPod}
        backLabel={name}
        onBack={() => {
          setSelectedPod(null)
          setTab('pods')
        }}
        allowSplit={allowSplit}
        showUser={showUser}
        onCloseSplit={onCloseSplit}
      />
    )
  }

  const pane = (
    <div>
      <nav className="mb-3 flex items-center gap-1.5 font-mono text-xs text-ink-500">
        <button
          type="button"
          className="text-leaf-600 underline-offset-2 hover:underline"
          onClick={onBack}
        >
          Deployments
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-ink-400" />
        <span>Deployment details</span>
      </nav>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate font-display text-3xl font-bold tracking-tight text-ink-900">
              {deployment.metadata.name}
            </h1>
            <StatusBadge tone={healthy ? 'ok' : 'warn'}>{healthy ? 'Ready' : 'Progressing'}</StatusBadge>
          </div>
          <p className="mt-1 font-mono text-sm text-ink-500">{deployment.metadata.namespace}</p>
        </div>
        {showUser ? (
          <PanelUser />
        ) : onCloseSplit ? (
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-300 bg-white text-ink-500 transition hover:bg-ink-50 hover:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
            title="Закрыть второе окно"
            aria-label="Закрыть второе окно"
            onClick={onCloseSplit}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="mb-6 flex items-end justify-between gap-2 border-b border-ink-200">
        <div className="flex gap-1">
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
        {allowSplit ? (
          <button
            type="button"
            className={`mb-1 inline-flex h-8 w-8 items-center justify-center rounded-lg border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 ${
              splitOpen
                ? 'border-leaf-500/50 bg-leaf-400/10 text-leaf-700'
                : 'border-ink-300 bg-white text-ink-500 hover:bg-ink-50 hover:text-ink-800'
            }`}
            title={splitOpen ? 'Закрыть второе окно' : 'Открыть второе окно'}
            aria-label={splitOpen ? 'Закрыть второе окно' : 'Открыть второе окно'}
            aria-pressed={splitOpen}
            onClick={() => {
              if (splitOpen) {
                setSplitOpen(false)
                setSecondDeployment(null)
              } else {
                setSplitOpen(true)
              }
            }}
          >
            <span className="relative inline-flex">
              <Columns2 className="h-4 w-4" />
              <span className="absolute -right-1.5 -top-1.5 font-mono text-[9px] font-bold leading-none">
                ±
              </span>
            </span>
          </button>
        ) : null}
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
              Deployment details
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

          {deployment.metadata.labels && Object.keys(deployment.metadata.labels).length > 0 && (
            <section>
              <h3 className="mb-2 font-display text-base font-bold text-ink-900">Labels</h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(deployment.metadata.labels).map(([k, v]) => (
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

      {tab === 'replicasets' && (
        <div>
          {replicaSetsError && (
            <p className="mb-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
              {replicaSetsError}
            </p>
          )}
          <ResourceTable
            columns={replicaSetColumns}
            rows={replicaSets}
            rowKey={(r) => r.metadata.uid}
            loading={replicaSetsLoading && replicaSets.length === 0}
            onRowClick={setSelectedReplicaSet}
            empty="ReplicaSet этого deployment нет"
            rowClassName={(r) =>
              r.spec.replicas === 0 ? 'bg-ink-50 hover:bg-ink-100' : undefined
            }
          />
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
            empty="Подов этого deployment нет"
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

  if (allowSplit && splitOpen) {
    return (
      <div className="flex min-h-0 items-stretch gap-0">
        <div className="min-w-0 flex-1 overflow-auto pr-4">{pane}</div>
        <div className="w-px shrink-0 bg-ink-200" />
        <div className="min-w-0 flex-1 overflow-auto pl-4">
          {secondDeployment ? (
            <DeploymentDetails
              deployment={secondDeployment}
              onBack={() => setSecondDeployment(null)}
              allowSplit={false}
              showUser={false}
              onCloseSplit={() => {
                setSplitOpen(false)
                setSecondDeployment(null)
              }}
            />
          ) : (
            <SecondDeploymentPicker
              excludeUid={deployment.metadata.uid}
              onSelect={setSecondDeployment}
              onClose={() => {
                setSplitOpen(false)
                setSecondDeployment(null)
              }}
            />
          )}
        </div>
      </div>
    )
  }

  return pane
}
