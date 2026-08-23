import { useEffect, useMemo, useState } from 'react'
import { useCluster } from '@/context/ClusterContext'
import { listDeployments } from '@/lib/k8s-client'
import { formatAge } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import { ResourceDrawer } from '@/components/ResourceDrawer'
import { StatusBadge } from '@/components/StatusBadge'
import type { Deployment } from '@/types/k8s'

export function DeploymentsPage() {
  const { connection, namespace: ns } = useCluster()
  const [items, setItems] = useState<Deployment[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Deployment | null>(null)

  const load = async () => {
    if (!connection) return
    setLoading(true)
    try {
      setItems(await listDeployments(connection))
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
    if (ns) result = result.filter((d) => d.metadata.namespace === ns)
    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (d) =>
          d.metadata.name.toLowerCase().includes(q) ||
          (d.metadata.namespace ?? '').toLowerCase().includes(q),
      )
    }
    return result
  }, [items, ns, query])

  const columns: Column<Deployment>[] = [
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
      key: 'up',
      header: 'Up-to-date',
      render: (row) => <span className="font-mono text-xs">{row.status.updatedReplicas}</span>,
    },
    {
      key: 'avail',
      header: 'Available',
      render: (row) => <span className="font-mono text-xs">{row.status.availableReplicas}</span>,
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
        title="Deployments"
        description="Контроллеры реплик приложений"
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
        subtitle={`Deployment · ${selected?.metadata.namespace ?? ''}`}
        resource={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
