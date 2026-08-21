import { useEffect, useMemo, useState } from 'react'
import { useCluster } from '@/context/ClusterContext'
import { listStatefulSets } from '@/lib/k8s-client'
import { formatAge } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import { ResourceDrawer } from '@/components/ResourceDrawer'
import { StatusBadge } from '@/components/StatusBadge'
import type { StatefulSet } from '@/types/k8s'

export function StatefulSetsPage() {
  const { connection, namespace: ns } = useCluster()
  const [items, setItems] = useState<StatefulSet[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<StatefulSet | null>(null)

  const load = async () => {
    if (!connection) return
    setLoading(true)
    try {
      setItems(await listStatefulSets(connection))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection])

  const rows = useMemo(() => {
    let result = items
    if (ns) result = result.filter((s) => s.metadata.namespace === ns)
    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (s) =>
          s.metadata.name.toLowerCase().includes(q) ||
          (s.metadata.namespace ?? '').toLowerCase().includes(q),
      )
    }
    return result
  }, [items, ns, query])

  const columns: Column<StatefulSet>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => <span className="font-medium text-ink-900">{row.metadata.name}</span>,
    },
    {
      key: 'ns',
      header: 'Namespace',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">{row.metadata.namespace}</span>
      ),
    },
    {
      key: 'ready',
      header: 'Ready',
      render: (row) => {
        const ok = row.status.readyReplicas >= row.spec.replicas
        return (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">
              {row.status.readyReplicas}/{row.spec.replicas}
            </span>
            <StatusBadge tone={ok ? 'ok' : 'warn'}>{ok ? 'Ready' : 'Progressing'}</StatusBadge>
          </div>
        )
      },
    },
    {
      key: 'svc',
      header: 'Service',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">{row.spec.serviceName || '—'}</span>
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
      <PageHeader
        title="StatefulSets"
        description="Упорядоченные реплики со стабильными именами и томами"
        onRefresh={load}
        refreshing={loading}
        actions={<SearchInput value={query} onChange={setQuery} placeholder="Имя…" />}
      />
      <ResourceTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.metadata.uid}
        loading={loading}
        onRowClick={setSelected}
      />
      <ResourceDrawer
        open={!!selected}
        title={selected?.metadata.name ?? ''}
        subtitle={`StatefulSet · ${selected?.metadata.namespace ?? ''}`}
        resource={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
