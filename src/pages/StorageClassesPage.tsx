import { useEffect, useMemo, useState } from 'react'
import { useCluster } from '@/context/ClusterContext'
import { listStorageClasses } from '@/lib/k8s-client'
import { formatAge } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import { ResourceDrawer } from '@/components/ResourceDrawer'
import { StatusBadge } from '@/components/StatusBadge'
import type { StorageClass } from '@/types/k8s'

export function StorageClassesPage() {
  const { connection } = useCluster()
  const [items, setItems] = useState<StorageClass[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<StorageClass | null>(null)

  const load = async () => {
    if (!connection) return
    setLoading(true)
    try {
      setItems(await listStorageClasses(connection))
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
    if (!q) return items
    return items.filter(
      (sc) =>
        sc.metadata.name.toLowerCase().includes(q) ||
        sc.spec.provisioner.toLowerCase().includes(q),
    )
  }, [items, query])

  const columns: Column<StorageClass>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink-900">{row.metadata.name}</span>
          {row.spec.isDefault ? <StatusBadge tone="ok">default</StatusBadge> : null}
        </div>
      ),
    },
    {
      key: 'provisioner',
      header: 'Provisioner',
      render: (row) => (
        <span className="font-mono text-xs text-ink-700">{row.spec.provisioner}</span>
      ),
    },
    {
      key: 'reclaim',
      header: 'Reclaim',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">{row.spec.reclaimPolicy}</span>
      ),
    },
    {
      key: 'binding',
      header: 'Binding',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">{row.spec.volumeBindingMode}</span>
      ),
    },
    {
      key: 'expand',
      header: 'Expand',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">
          {row.spec.allowVolumeExpansion ? 'true' : 'false'}
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
        title="StorageClasses"
        description="Классы динамического provisioning томов"
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
        subtitle="StorageClass"
        resource={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
