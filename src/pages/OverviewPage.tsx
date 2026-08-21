import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, Boxes, Database, Layers, Network, Server } from 'lucide-react'
import { useCluster } from '@/context/ClusterContext'
import { fetchSnapshot } from '@/lib/k8s-client'
import { formatAge } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge, phaseTone } from '@/components/StatusBadge'
import type { ClusterSnapshot } from '@/types/k8s'

export function OverviewPage() {
  const { connection } = useCluster()
  const [snap, setSnap] = useState<ClusterSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!connection) return
    setLoading(true)
    try {
      setSnap(await fetchSnapshot(connection))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection])

  const cards = snap
    ? [
        { label: 'Namespaces', value: snap.namespaces.length, to: '/cluster/namespaces', icon: Layers },
        { label: 'Pods', value: snap.pods.length, to: '/cluster/pods', icon: Box },
        {
          label: 'Deployments',
          value: snap.deployments.length,
          to: '/cluster/deployments',
          icon: Boxes,
        },
        {
          label: 'StatefulSets',
          value: snap.statefulSets.length,
          to: '/cluster/statefulsets',
          icon: Database,
        },
        { label: 'Services', value: snap.services.length, to: '/cluster/services', icon: Network },
        { label: 'Nodes', value: snap.nodes.length, to: '/cluster/nodes', icon: Server },
      ]
    : []

  const recentPods = snap?.pods.slice(0, 5) ?? []

  return (
    <div>
      <PageHeader
        title="Обзор кластера"
        description={
          connection
            ? `${connection.name} · подключено ${formatAge(connection.connectedAt)} назад`
            : undefined
        }
        onRefresh={load}
        refreshing={loading}
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="surface h-28 animate-pulse" />
            ))
          : cards.map(({ label, value, to, icon: Icon }) => (
              <Link
                key={label}
                to={to}
                className="surface group block px-4 py-4 transition hover:border-leaf-500/40 hover:bg-white"
              >
                <div className="flex items-center justify-between text-ink-500">
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em]">{label}</span>
                  <Icon className="h-4 w-4 transition group-hover:text-leaf-600" />
                </div>
                <p className="mt-3 font-mono text-2xl font-semibold leading-none tabular-nums tracking-tight text-ink-900">
                  {value}
                </p>
              </Link>
            ))}
      </div>

      <div className="surface overflow-hidden">
        <div className="border-b border-ink-200/80 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-ink-900">Недавние pods</h2>
        </div>
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-ink-100/80" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {recentPods.map((pod) => (
              <li
                key={pod.metadata.uid}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{pod.metadata.name}</p>
                  <p className="font-mono text-xs text-ink-500">
                    {pod.metadata.namespace} · {pod.spec.nodeName ?? '—'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={phaseTone(pod.status.phase)}>{pod.status.phase}</StatusBadge>
                  <span className="font-mono text-xs text-ink-500">
                    {formatAge(pod.metadata.creationTimestamp)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
