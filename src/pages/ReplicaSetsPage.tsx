import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useCluster } from '@/context/ClusterContext'
import { listReplicaSets } from '@/lib/k8s-client'
import { formatAge } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import { ReplicaSetDetails } from '@/components/ReplicaSetDetails'
import { StatusBadge } from '@/components/StatusBadge'
import type { ReplicaSet } from '@/types/k8s'

const POLL_MS = 5000

export function ReplicaSetsPage() {
  const { connection, namespace: ns } = useCluster()
  const location = useLocation()
  const [items, setItems] = useState<ReplicaSet[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ReplicaSet | null>(null)

  const load = async (silent = false) => {
    if (!connection) return
    if (!silent) setLoading(true)
    try {
      setItems(await listReplicaSets(connection))
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
      return items.find((r) => r.metadata.uid === prev.metadata.uid) ?? prev
    })
  }, [items])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(true), POLL_MS)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection])

  const rows = useMemo(() => {
    let result = items
    if (ns) result = result.filter((r) => r.metadata.namespace === ns)
    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (r) =>
          r.metadata.name.toLowerCase().includes(q) ||
          (r.metadata.namespace ?? '').toLowerCase().includes(q) ||
          (r.owner ?? '').toLowerCase().includes(q),
      )
    }
    return result
  }, [items, ns, query])

  const columns: Column<ReplicaSet>[] = [
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
      key: 'ns',
      header: 'Namespace',
      render: (row) => (
        <span className={`font-mono text-xs ${row.spec.replicas === 0 ? 'text-ink-400' : 'text-ink-600'}`}>
          {row.metadata.namespace}
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
      key: 'owner',
      header: 'Owner',
      render: (row) => (
        <span className={`font-mono text-xs ${row.spec.replicas === 0 ? 'text-ink-400' : 'text-ink-600'}`}>
          {row.owner || '—'}
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
  ]

  if (selected) {
    return <ReplicaSetDetails replicaSet={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div>
      <PageHeader
        title="ReplicaSets"
        description="Наборы подов с общим шаблоном"
        actions={<SearchInput value={query} onChange={setQuery} placeholder="Имя…" />}
      />
      <ResourceTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.metadata.uid}
        loading={loading}
        onRowClick={setSelected}
        rowClassName={(r) =>
          r.spec.replicas === 0 ? 'bg-ink-50 hover:bg-ink-100' : undefined
        }
      />
    </div>
  )
}
