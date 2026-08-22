import { formatCpuMillis, formatMemoryMi } from '@/lib/format'
import { GroupedNumber } from '@/components/GroupedNumber'
import { useMemo } from 'react'

interface SparklineProps {
  values: number[]
  color: string
  fill: string
}

function Sparkline({ values, color, fill }: SparklineProps) {
  const { d, area } = useMemo(() => {
    const w = 320
    const h = 88
    const pad = 4
    const pts = values.length >= 2 ? values : values.length === 1 ? [values[0], values[0]] : [0, 0]
    const max = Math.max(...pts, 1)
    const step = (w - pad * 2) / Math.max(pts.length - 1, 1)
    const coords = pts.map((v, i) => {
      const x = pad + i * step
      const y = h - pad - (v / max) * (h - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    const line = `M ${coords.join(' L ')}`
    const lastX = pad + (pts.length - 1) * step
    const areaPath = `${line} L ${lastX.toFixed(1)},${h - pad} L ${pad},${h - pad} Z`
    return { d: line, area: areaPath }
  }, [values])

  return (
    <svg viewBox="0 0 320 88" className="h-24 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={area} fill={fill} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

interface UsageCardProps {
  title: string
  hint: string
  value: string
  series: number[]
  color: string
  fill: string
}

function UsageCard({ title, hint, value, series, color, fill }: UsageCardProps) {
  return (
    <div className="surface overflow-hidden px-4 py-3">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
            {title}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">{hint}</p>
        </div>
        <p className="shrink-0 font-mono text-2xl font-semibold leading-none tabular-nums tracking-tight text-ink-900">
          <GroupedNumber value={value} />
        </p>
      </div>
      <Sparkline values={series} color={color} fill={fill} />
    </div>
  )
}

interface PodsUsageChartsProps {
  namespace?: string
  podCount: number
  cpuMillis: number
  memoryMi: number
  cpuSeries: number[]
  memorySeries: number[]
  hint?: string
}

export function PodsUsageCharts({
  namespace,
  podCount,
  cpuMillis,
  memoryMi,
  cpuSeries,
  memorySeries,
  hint,
}: PodsUsageChartsProps) {
  const scope = namespace ? namespace : 'все namespaces'
  const caption = hint ?? `${podCount} pods · ${scope}`

  return (
    <div className="mb-6 grid gap-3 md:grid-cols-2">
      <UsageCard
        title="CPU"
        hint={caption}
        value={formatCpuMillis(cpuMillis)}
        series={cpuSeries}
        color="#2f9e6e"
        fill="rgba(47,158,110,0.18)"
      />
      <UsageCard
        title="Memory"
        hint={caption}
        value={formatMemoryMi(memoryMi)}
        series={memorySeries}
        color="#d4892a"
        fill="rgba(232,165,75,0.22)"
      />
    </div>
  )
}

