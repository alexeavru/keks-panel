import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useCluster } from '@/context/ClusterContext'
import { listPods } from '@/lib/k8s-client'
import { formatAge, formatCpuMillis, formatMemoryMi, parseCpuToMillis, parseMemoryToMi } from '@/lib/format'
import { GroupedNumber } from '@/components/GroupedNumber'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import { PodDetails } from '@/components/PodDetails'
import { StatusBadge, phaseTone } from '@/components/StatusBadge'
import { PodsUsageCharts } from '@/components/PodsUsageCharts'
import type { Pod } from '@/types/k8s'

const HISTORY = 60
const POLL_MS = 5000

export function PodsPage() {
  const { connection, namespace: ns } = useCluster()
  const location = useLocation()
  const [items, setItems] = useState<Pod[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Pod | null>(null)
  const [cpuSeries, setCpuSeries] = useState<number[]>([])
  const [memorySeries, setMemorySeries] = useState<number[]>([])
  const lastNs = useRef(ns)

  const load = async (silent = false) => {
    if (!connection) return
    if (!silent) setLoading(true)
    try {
      setItems(await listPods(connection))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const resetAt = (location.state as { reset?: number } | null)?.reset

  useEffect(() => {
    setSelected(null)
  }, [location.key, resetAt, ns])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => {
      void load(true)
    }, POLL_MS)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection])

  const nsPods = useMemo(() => {
    return ns ? items.filter((p) => p.metadata.namespace === ns) : items
  }, [items, ns])

  const totals = useMemo(() => {
    let cpuMillis = 0
    let memoryMi = 0
    for (const pod of nsPods) {
      cpuMillis += parseCpuToMillis(pod.status.cpuUsage, pod.status.cpuMillis)
      memoryMi += parseMemoryToMi(pod.status.memoryUsage, pod.status.memoryMi)
    }
    return { cpuMillis, memoryMi }
  }, [nsPods])

  useEffect(() => {
    if (lastNs.current !== ns) {
      lastNs.current = ns
      setCpuSeries([totals.cpuMillis])
      setMemorySeries([totals.memoryMi])
      return
    }
    setCpuSeries((prev) => [...prev, totals.cpuMillis].slice(-HISTORY))
    setMemorySeries((prev) => [...prev, totals.memoryMi].slice(-HISTORY))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals.cpuMillis, totals.memoryMi, ns])

  const rows = useMemo(() => {
    let result = nsPods
    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (p) =>
          p.metadata.name.toLowerCase().includes(q) ||
          (p.metadata.namespace ?? '').toLowerCase().includes(q),
      )
    }
    return result
  }, [nsPods, query])

  const columns: Column<Pod>[] = [
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
      key: 'ns',
      header: 'Namespace',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">{row.metadata.namespace}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge tone={phaseTone(row.status.phase)}>{row.status.phase}</StatusBadge>
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
      sortValue: (row) =>
        row.status.cpuUsage
          ? parseCpuToMillis(row.status.cpuUsage, row.status.cpuMillis)
          : undefined,
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
      sortValue: (row) =>
        row.status.memoryUsage
          ? parseMemoryToMi(row.status.memoryUsage, row.status.memoryMi)
          : undefined,
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

  return (
    <div>
      {selected ? (
        <PodDetails pod={selected} onBack={() => setSelected(null)} />
      ) : (
        <>
          <PageHeader
            title="Pods"
            description="Запущенные и ожидающие контейнеры"
            onRefresh={() => void load()}
            refreshing={loading}
            actions={<SearchInput value={query} onChange={setQuery} placeholder="Имя…" />}
          />
          <PodsUsageCharts
            namespace={ns}
            podCount={nsPods.length}
            cpuMillis={totals.cpuMillis}
            memoryMi={totals.memoryMi}
            cpuSeries={cpuSeries}
            memorySeries={memorySeries}
          />
          <ResourceTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.metadata.uid}
            loading={loading}
            onRowClick={setSelected}
            rowClassName={(r) =>
              r.status.phase === 'Succeeded'
                ? 'bg-slate-100/90 text-slate-500 hover:bg-slate-200/60 [&_p]:!text-slate-500 [&_span]:!text-slate-500'
                : undefined
            }
          />
        </>
      )}
    </div>
  )
}
