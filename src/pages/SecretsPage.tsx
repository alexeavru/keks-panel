import { useEffect, useMemo, useState } from 'react'
import { useCluster } from '@/context/ClusterContext'
import { listSecrets } from '@/lib/k8s-client'
import { formatAge } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import { ResourceDrawer } from '@/components/ResourceDrawer'
import type { Secret } from '@/types/k8s'

export function SecretsPage() {
  const { connection, namespace: ns } = useCluster()
  const [items, setItems] = useState<Secret[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Secret | null>(null)

  const load = async () => {
    if (!connection) return
    setLoading(true)
    try {
      setItems(await listSecrets(connection))
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
          (s.metadata.namespace ?? '').toLowerCase().includes(q) ||
          s.type.toLowerCase().includes(q) ||
          s.dataKeys.some((k) => k.toLowerCase().includes(q)),
      )
    }
    return result
  }, [items, ns, query])

  const columns: Column<Secret>[] = [
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
        <span className="font-mono text-xs text-ink-700" title={row.type}>
          {row.type}
        </span>
      ),
    },
    {
      key: 'data',
      header: 'Data',
      render: (row) => <span className="font-mono text-xs">{row.dataKeys.length}</span>,
    },
    {
      key: 'keys',
      header: 'Keys',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600" title={row.dataKeys.join(', ')}>
          {row.dataKeys.length ? row.dataKeys.join(', ') : '—'}
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
        title="Secrets"
        description="Секреты кластера. Значения не отображаются, только ключи"
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
        subtitle={`Secret · ${selected?.metadata.namespace ?? ''}`}
        resource={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
