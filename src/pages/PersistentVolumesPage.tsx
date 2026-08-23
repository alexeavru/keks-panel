import { useEffect, useMemo, useState } from 'react'
import { useCluster } from '@/context/ClusterContext'
import { listPersistentVolumes } from '@/lib/k8s-client'
import { formatAge, parseStorageToBytes } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import { ResourceDrawer } from '@/components/ResourceDrawer'
import { StatusBadge, storagePhaseTone } from '@/components/StatusBadge'
import type { PersistentVolume } from '@/types/k8s'

export function PersistentVolumesPage() {
  const { connection } = useCluster()
  const [items, setItems] = useState<PersistentVolume[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<PersistentVolume | null>(null)

  const load = async () => {
    if (!connection) return
    setLoading(true)
    try {
      setItems(await listPersistentVolumes(connection))
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
      (pv) =>
        pv.metadata.name.toLowerCase().includes(q) ||
        pv.spec.storageClass.toLowerCase().includes(q) ||
        pv.spec.claim.toLowerCase().includes(q) ||
        pv.status.phase.toLowerCase().includes(q),
    )
  }, [items, query])

  const columns: Column<PersistentVolume>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => <span className="font-medium text-ink-900">{row.metadata.name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge tone={storagePhaseTone(row.status.phase)}>{row.status.phase}</StatusBadge>
      ),
    },
    {
      key: 'capacity',
      header: 'Capacity',
      className: 'whitespace-nowrap',
      sortValue: (row) => parseStorageToBytes(row.spec.capacity),
      render: (row) => (
        <span className="font-mono text-xs text-ink-700">{row.spec.capacity}</span>
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
      key: 'reclaim',
      header: 'Reclaim',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">{row.spec.reclaimPolicy}</span>
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
      key: 'claim',
      header: 'Claim',
      render: (row) => (
        <span className="font-mono text-xs text-ink-600">{row.spec.claim}</span>
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
        title="PersistentVolumes"
        description="Тома кластера, не привязанные к namespace"
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
        subtitle="PersistentVolume"
        resource={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
