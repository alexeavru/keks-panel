import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCluster } from '@/context/ClusterContext'
import { listNamespaces } from '@/lib/k8s-client'
import { formatAge } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { ResourceTable, type Column } from '@/components/ResourceTable'
import { StatusBadge, phaseTone } from '@/components/StatusBadge'
import type { Namespace } from '@/types/k8s'

export function NamespacesPage() {
  const { connection, setNamespace } = useCluster()
  const navigate = useNavigate()
  const [items, setItems] = useState<Namespace[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const load = async () => {
    if (!connection) return
    setLoading(true)
    try {
      setItems(await listNamespaces(connection))
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

  const openPods = (ns: Namespace) => {
    setNamespace(ns.metadata.name)
    navigate('/cluster/pods')
  }

  const columns: Column<Namespace>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => <span className="font-medium text-ink-900">{row.metadata.name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge tone={phaseTone(row.status.phase)}>{row.status.phase}</StatusBadge>
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
        title="Namespaces"
        description="Нажмите на namespace, чтобы открыть его pods"
        actions={<SearchInput value={query} onChange={setQuery} placeholder="Фильтр по имени…" />}
      />
      <ResourceTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.metadata.uid}
        loading={loading}
        onRowClick={openPods}
      />
    </div>
  )
}
