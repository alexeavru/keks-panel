import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, Boxes, Database, FileCode, Layers, Network, Server } from 'lucide-react'
import { useCluster } from '@/context/ClusterContext'
import { fetchSnapshot } from '@/lib/k8s-client'
import { formatAge, parseCpuToMillis, parseMemoryToMi } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { PodsUsageCharts } from '@/components/PodsUsageCharts'
import type { ClusterSnapshot } from '@/types/k8s'

const HISTORY = 60
const POLL_MS = 5000

export function OverviewPage() {
  const { connection } = useCluster()
  const [snap, setSnap] = useState<ClusterSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [cpuSeries, setCpuSeries] = useState<number[]>([])
  const [memorySeries, setMemorySeries] = useState<number[]>([])

  const load = async (silent = false) => {
    if (!connection) return
    if (!silent) setLoading(true)
    try {
      setSnap(await fetchSnapshot(connection))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    setCpuSeries([])
    setMemorySeries([])
    void load()
    const id = window.setInterval(() => {
      void load(true)
    }, POLL_MS)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection])

  const totals = useMemo(() => {
    const pods = snap?.pods ?? []
    let cpuMillis = 0
    let memoryMi = 0
    for (const pod of pods) {
      cpuMillis += parseCpuToMillis(pod.status.cpuUsage, pod.status.cpuMillis)
      memoryMi += parseMemoryToMi(pod.status.memoryUsage, pod.status.memoryMi)
    }
    return { cpuMillis, memoryMi, podCount: pods.length, nodeCount: snap?.nodes.length ?? 0 }
  }, [snap])

  useEffect(() => {
    if (!snap) return
    setCpuSeries((prev) => [...prev, totals.cpuMillis].slice(-HISTORY))
    setMemorySeries((prev) => [...prev, totals.memoryMi].slice(-HISTORY))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals.cpuMillis, totals.memoryMi])

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
        {
          label: 'ConfigMaps',
          value: snap.configMaps.length,
          to: '/cluster/configmaps',
          icon: FileCode,
        },
        { label: 'Nodes', value: snap.nodes.length, to: '/cluster/nodes', icon: Server },
      ]
    : []

  return (
    <div>
      <PageHeader
        title="Обзор кластера"
        description={
          connection
            ? `${connection.name} · подключено ${formatAge(connection.connectedAt)} назад`
            : undefined
        }
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <PodsUsageCharts
        podCount={totals.podCount}
        cpuMillis={totals.cpuMillis}
        memoryMi={totals.memoryMi}
        cpuSeries={cpuSeries}
        memorySeries={memorySeries}
        hint={`${totals.nodeCount} nodes · ${totals.podCount} pods · кластер`}
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading && !snap
          ? Array.from({ length: 7 }).map((_, i) => (
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

      {snap?.info && (
        <section className="surface px-5 py-4">
          <h2 className="mb-4 font-display text-lg font-bold text-ink-900">Кластер</h2>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: 'Context', value: snap.info.context },
              { label: 'Cluster', value: snap.info.name },
              { label: 'API', value: snap.info.server },
              { label: 'User', value: snap.info.user },
              { label: 'Version', value: snap.info.version },
              { label: 'Platform', value: snap.info.platform ?? '—' },
              { label: 'Namespace', value: snap.info.namespace || '—' },
              {
                label: 'Nodes',
                value: `${snap.nodes.filter((n) => n.status.ready).length} ready / ${snap.nodes.length}`,
              },
              {
                label: 'Режим',
                value:
                  connection?.mode === 'demo'
                    ? 'demo'
                    : connection?.mode === 'kubeconfig'
                      ? 'kubeconfig'
                      : connection?.mode ?? '—',
              },
              {
                label: 'Подключено',
                value: connection ? `${formatAge(connection.connectedAt)} назад` : '—',
              },
            ].map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                  {row.label}
                </dt>
                <dd className="mt-1 truncate font-mono text-sm text-ink-900" title={row.value}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
