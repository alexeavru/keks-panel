import { useEffect, useMemo, useState } from 'react'
import { useCluster } from '@/context/ClusterContext'
import { listConfigMaps } from '@/lib/k8s-client'
import { formatAge } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import { ResourceDrawer } from '@/components/ResourceDrawer'
import type { ConfigMap } from '@/types/k8s'

function configMapKeys(row: ConfigMap): string[] {
  return [...Object.keys(row.data), ...row.binaryDataKeys]
}

export function ConfigMapsPage() {
  const { connection, namespace: ns } = useCluster()
  const [items, setItems] = useState<ConfigMap[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ConfigMap | null>(null)

  const load = async () => {
    if (!connection) return
    setLoading(true)
    try {
      setItems(await listConfigMaps(connection))
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
    if (ns) result = result.filter((c) => c.metadata.namespace === ns)
    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter((c) => {
        const keys = configMapKeys(c)
        return (
          c.metadata.name.toLowerCase().includes(q) ||
          (c.metadata.namespace ?? '').toLowerCase().includes(q) ||
          keys.some((k) => k.toLowerCase().includes(q))
        )
      })
    }
    return result
  }, [items, ns, query])

  const columns: Column<ConfigMap>[] = [
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
      key: 'data',
      header: 'Data',
      render: (row) => (
        <span className="font-mono text-xs">{configMapKeys(row).length}</span>
      ),
    },
    {
      key: 'keys',
      header: 'Keys',
      render: (row) => {
        const keys = configMapKeys(row)
        return (
          <span className="font-mono text-xs text-ink-600" title={keys.join(', ')}>
            {keys.length ? keys.join(', ') : '—'}
          </span>
        )
      },
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
        title="ConfigMaps"
        description="Конфигурация приложений в виде ключ–значение"
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
        subtitle={`ConfigMap · ${selected?.metadata.namespace ?? ''}`}
        resource={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
