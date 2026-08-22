import { useEffect, useMemo, useState } from 'react'
import { useCluster } from '@/context/ClusterContext'
import { listIngresses } from '@/lib/k8s-client'
import { formatAge } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import { ResourceDrawer } from '@/components/ResourceDrawer'
import { StatusBadge } from '@/components/StatusBadge'
import type { Ingress } from '@/types/k8s'

export function IngressesPage() {
  const { connection, namespace: ns } = useCluster()
  const [items, setItems] = useState<Ingress[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Ingress | null>(null)

  const load = async () => {
    if (!connection) return
    setLoading(true)
    try {
      setItems(await listIngresses(connection))
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
    if (ns) result = result.filter((ing) => ing.metadata.namespace === ns)
    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (ing) =>
          ing.metadata.name.toLowerCase().includes(q) ||
          (ing.metadata.namespace ?? '').toLowerCase().includes(q) ||
          ing.spec.hosts.some((host) => host.toLowerCase().includes(q)) ||
          ing.spec.className.toLowerCase().includes(q),
      )
    }
    return result
  }, [items, ns, query])

  const columns: Column<Ingress>[] = [
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
      key: 'class',
      header: 'Class',
      render: (row) => <span className="font-mono text-xs text-ink-600">{row.spec.className}</span>,
    },
    {
      key: 'hosts',
      header: 'Hosts',
      render: (row) => (
        <span className="font-mono text-xs text-ink-700">
          {row.spec.hosts.length > 0 ? row.spec.hosts.join(', ') : '*'}
        </span>
      ),
    },
    {
      key: 'address',
      header: 'Address',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">{row.status.address}</span>
      ),
    },
    {
      key: 'tls',
      header: 'TLS',
      render: (row) => (
        <StatusBadge tone={row.spec.tls ? 'ok' : 'neutral'}>
          {row.spec.tls ? 'TLS' : 'HTTP'}
        </StatusBadge>
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
        title="Ingresses"
        description="Внешние HTTP(S) маршруты в сервисы"
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
        subtitle={`Ingress · ${selected?.metadata.namespace ?? ''}`}
        resource={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
