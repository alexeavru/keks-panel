import { useEffect, useMemo, useState } from 'react'
import { useCluster } from '@/context/ClusterContext'
import { listPersistentVolumeClaims } from '@/lib/k8s-client'
import { formatAge, parseStorageToBytes } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import { ResourceDrawer } from '@/components/ResourceDrawer'
import { StatusBadge, storagePhaseTone } from '@/components/StatusBadge'
import type { PersistentVolumeClaim } from '@/types/k8s'

export function PersistentVolumeClaimsPage() {
  const { connection, namespace: ns } = useCluster()
  const [items, setItems] = useState<PersistentVolumeClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<PersistentVolumeClaim | null>(null)

  const load = async () => {
    if (!connection) return
    setLoading(true)
    try {
      setItems(await listPersistentVolumeClaims(connection))
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
    if (ns) result = result.filter((pvc) => pvc.metadata.namespace === ns)
    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (pvc) =>
          pvc.metadata.name.toLowerCase().includes(q) ||
          (pvc.metadata.namespace ?? '').toLowerCase().includes(q) ||
          pvc.spec.storageClass.toLowerCase().includes(q) ||
          pvc.spec.volumeName.toLowerCase().includes(q),
      )
    }
    return result
  }, [items, ns, query])

  const columns: Column<PersistentVolumeClaim>[] = [
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
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge tone={storagePhaseTone(row.status.phase)}>{row.status.phase}</StatusBadge>
      ),
    },
    {
      key: 'volume',
      header: 'Volume',
      render: (row) => (
        <span className="font-mono text-xs text-ink-700">{row.spec.volumeName}</span>
      ),
    },
    {
      key: 'capacity',
      header: 'Capacity',
      className: 'whitespace-nowrap',
      sortValue: (row) => parseStorageToBytes(row.status.capacity),
      render: (row) => (
        <span className="font-mono text-xs text-ink-700">{row.status.capacity}</span>
      ),
    },
    {
      key: 'modes',
      header: 'Access modes',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">{row.spec.accessModes}</span>
      ),
    },
    {
      key: 'class',
      header: 'StorageClass',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">{row.spec.storageClass}</span>
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
        title="PersistentVolumeClaims"
        description="Запросы томов в namespace"
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
        subtitle={`PersistentVolumeClaim · ${selected?.metadata.namespace ?? ''}`}
        resource={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
