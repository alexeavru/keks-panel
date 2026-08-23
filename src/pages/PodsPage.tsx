import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { useCluster } from '@/context/ClusterContext'
import { deletePod, listPods } from '@/lib/k8s-client'
import { formatAge, formatCpuMillis, formatMemoryMi, parseCpuToMillis, parseMemoryToMi } from '@/lib/format'
import { GroupedNumber } from '@/components/GroupedNumber'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PodDetails } from '@/components/PodDetails'
import { StatusBadge, podPhaseTone } from '@/components/StatusBadge'
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
  const [pendingDelete, setPendingDelete] = useState<Pod | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
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
    setSelected((prev) => {
      if (!prev) return prev
      return items.find((p) => p.metadata.uid === prev.metadata.uid) ?? prev
    })
  }, [items])

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

  const closeDelete = useCallback(() => {
    if (deleting) return
    setPendingDelete(null)
    setDeleteError(null)
  }, [deleting])

  const confirmDelete = useCallback(async () => {
    if (!connection || !pendingDelete?.metadata.namespace || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deletePod(connection, pendingDelete.metadata.namespace, pendingDelete.metadata.name)
      setItems((prev) => prev.filter((p) => p.metadata.uid !== pendingDelete.metadata.uid))
      setPendingDelete(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Не удалось удалить под')
    } finally {
      setDeleting(false)
    }
  }, [connection, pendingDelete, deleting])

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
    {
      key: 'delete',
      header: '',
      className: 'w-12 text-right',
      render: (row) => (
        <button
          type="button"
          className="inline-flex rounded-md p-1.5 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
          title="Удалить под"
          aria-label={`Удалить ${row.metadata.name}`}
          disabled={deleting && pendingDelete?.metadata.uid === row.metadata.uid}
          onClick={(e) => {
            e.stopPropagation()
            setDeleteError(null)
            setPendingDelete(row)
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
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
              r.status.phase === 'Succeeded' || r.status.state === 'Completed' || r.status.state === 'Succeeded'
                ? 'bg-slate-100/90 text-slate-500 hover:bg-slate-200/60 [&_p]:!text-slate-500 [&_span]:!text-slate-500'
                : undefined
            }
          />
          <ConfirmDialog
            open={Boolean(pendingDelete)}
            title="Удалить под?"
            description={
              pendingDelete ? (
                <>
                  Под{' '}
                  <span className="font-mono font-medium text-ink-900">{pendingDelete.metadata.name}</span>
                  {pendingDelete.metadata.namespace ? (
                    <>
                      {' '}
                      из namespace{' '}
                      <span className="font-mono font-medium text-ink-900">
                        {pendingDelete.metadata.namespace}
                      </span>
                    </>
                  ) : null}{' '}
                  будет удалён.
                </>
              ) : null
            }
            busy={deleting}
            error={deleteError}
            onConfirm={() => void confirmDelete()}
            onCancel={closeDelete}
          />
        </>
      )}
    </div>
  )
}
