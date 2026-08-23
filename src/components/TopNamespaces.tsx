import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCluster } from '@/context/ClusterContext'
import { formatCpuMillis, formatMemoryMi, parseCpuToMillis, parseMemoryToMi } from '@/lib/format'
import { GroupedNumber } from '@/components/GroupedNumber'
import type { Pod } from '@/types/k8s'

interface NsUsage {
  name: string
  pods: number
  cpuMillis: number
  memoryMi: number
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

export function TopNamespaces({ pods }: { pods: Pod[] }) {
  const { setNamespace } = useCluster()
  const navigate = useNavigate()

  const top = useMemo(() => {
    const map = new Map<string, NsUsage>()
    for (const pod of pods) {
      const name = pod.metadata.namespace ?? 'default'
      const cur = map.get(name) ?? { name, pods: 0, cpuMillis: 0, memoryMi: 0 }
      cur.pods += 1
      cur.cpuMillis += parseCpuToMillis(pod.status.cpuUsage, pod.status.cpuMillis)
      cur.memoryMi += parseMemoryToMi(pod.status.memoryUsage, pod.status.memoryMi)
      map.set(name, cur)
    }
    return [...map.values()]
      .sort((a, b) => b.memoryMi - a.memoryMi || b.pods - a.pods || a.name.localeCompare(b.name))
      .slice(0, 5)
  }, [pods])

  const barMaxCpu = Math.max(...top.map((n) => n.cpuMillis), 1)
  const barMaxMem = Math.max(...top.map((n) => n.memoryMi), 1)

  const openPods = (name: string) => {
    setNamespace(name)
    navigate('/cluster/pods')
  }

  return (
    <section className="surface mb-8 px-5 py-4">
      <div className="mb-4 border-b border-ink-200/80 pb-4">
        <h2 className="font-display text-lg font-bold text-ink-900">Топ-5 namespaces</h2>
        <p className="mt-1 text-sm text-ink-500">По потребляемой Memory</p>
      </div>
      {top.length === 0 ? (
        <p className="font-mono text-sm text-ink-500">Нет данных по потреблению</p>
      ) : (
        <ol className="space-y-1">
          {top.map((ns, i) => (
            <li key={ns.name}>
              <button
                type="button"
                onClick={() => openPods(ns.name)}
                className="w-full rounded-lg px-2 py-2.5 text-left transition hover:bg-leaf-500/[0.06]"
              >
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate font-mono text-sm text-ink-900">
                    <span className="mr-2 font-semibold text-ink-400">{i + 1}.</span>
                    {ns.name}
                  </p>
                  <p className="shrink-0 font-mono text-[11px] text-ink-500">{ns.pods} pods</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <div className="mb-0.5 flex w-full items-baseline justify-between gap-3">
                      <span className="font-mono text-[11px] text-ink-500">CPU</span>
                      <span className="shrink-0 text-right font-mono text-sm tabular-nums text-ink-800">
                        <GroupedNumber value={formatCpuMillis(ns.cpuMillis)} />
                      </span>
                    </div>
                    <Bar value={ns.cpuMillis} max={barMaxCpu} color="#2f9e6e" />
                  </div>
                  <div>
                    <div className="mb-0.5 flex w-full items-baseline justify-between gap-3">
                      <span className="font-mono text-[11px] text-ink-500">Memory</span>
                      <span className="shrink-0 text-right font-mono text-sm tabular-nums text-ink-800">
                        <GroupedNumber value={formatMemoryMi(ns.memoryMi)} />
                      </span>
                    </div>
                    <Bar value={ns.memoryMi} max={barMaxMem} color="#d4892a" />
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
