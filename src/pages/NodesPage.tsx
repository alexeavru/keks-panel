import { useEffect, useMemo, useState } from 'react'
import { useCluster } from '@/context/ClusterContext'
import { listNodes } from '@/lib/k8s-client'
import { formatAge } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import { ResourceDrawer } from '@/components/ResourceDrawer'
import { StatusBadge } from '@/components/StatusBadge'
import type { Node } from '@/types/k8s'

export function NodesPage() {
  const { connection } = useCluster()
  const [items, setItems] = useState<Node[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Node | null>(null)

  const load = async () => {
    if (!connection) return
    setLoading(true)
    try {
      setItems(await listNodes(connection))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? items.filter((n) => n.metadata.name.toLowerCase().includes(q)) : items
  }, [items, query])

  const columns: Column<Node>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => <span className="font-medium text-ink-900">{row.metadata.name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge tone={row.status.ready ? 'ok' : 'bad'}>
          {row.status.ready ? 'Ready' : 'NotReady'}
        </StatusBadge>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">{row.status.roles.join(', ')}</span>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">{row.status.version}</span>
      ),
    },
    {
      key: 'cpu',
      header: 'CPU',
      render: (row) => (
        <span className="font-mono text-xs">
          {row.status.allocatableCpu} / {row.status.cpu}
        </span>
      ),
    },
    {
      key: 'mem',
      header: 'Memory',
      render: (row) => (
        <span className="font-mono text-xs">
          {row.status.allocatableMemory} / {row.status.memory}
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
        title="Nodes"
        description="Узлы кластера и их готовность"
        onRefresh={load}
        refreshing={loading}
        actions={<SearchInput value={query} onChange={setQuery} placeholder="Фильтр по имени…" />}
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
        subtitle="Node"
        resource={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
