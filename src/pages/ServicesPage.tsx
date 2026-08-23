import { useEffect, useMemo, useState } from 'react'
import { useCluster } from '@/context/ClusterContext'
import { listServices } from '@/lib/k8s-client'
import { formatAge } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import { ResourceDrawer } from '@/components/ResourceDrawer'
import { StatusBadge, serviceTypeTone } from '@/components/StatusBadge'
import type { Service } from '@/types/k8s'

export function ServicesPage() {
  const { connection, namespace: ns } = useCluster()
  const [items, setItems] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Service | null>(null)

  const load = async () => {
    if (!connection) return
    setLoading(true)
    try {
      setItems(await listServices(connection))
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

  const columns: Column<Service>[] = [
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
      key: 'type',
      header: 'Type',
      render: (row) => (
        <StatusBadge tone={serviceTypeTone(row.spec.type)}>{row.spec.type}</StatusBadge>
      ),
    },
    {
      key: 'ip',
      header: 'Cluster IP',
      render: (row) => (
        <span className="font-mono text-xs text-ink-700">{row.spec.clusterIP}</span>
      ),
    },
    {
      key: 'ports',
      header: 'Ports',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">
          {row.spec.ports
            .map((p) =>
              row.spec.type === 'NodePort' && p.nodePort
                ? `${p.port}:${p.nodePort}/${p.protocol}`
                : `${p.port}/${p.protocol}`,
            )
            .join(', ')}
        </span>
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
        title="Services"
        description="Сетевые эндпоинты внутри кластера"
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
        subtitle={`Service · ${selected?.metadata.namespace ?? ''}`}
        resource={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
