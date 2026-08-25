export function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'сейчас'
  if (mins < 60) return `${mins}м`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}ч`
  const days = Math.floor(hours / 24)
  return `${days}д`
}

export function formatAgeAgo(iso: string): string {
  const age = formatAge(iso)
  return age === 'сейчас' ? 'сейчас' : `${age} назад`
}

export function formatCreatedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function shortHost(host: string): string {
  try {
    const url = new URL(host)
    return url.host
  } catch {
    return host.replace(/^https?:\/\//, '')
  }
}

/** usage / request, or whichever is known */
export function formatResourcePair(usage?: string, request?: string): string {
  if (usage && request) return `${usage} / ${request}`
  if (usage) return usage
  if (request) return `— / ${request}`
  return '—'
}

export function parseCpuToMillis(value?: string, millis?: number): number {
  if (typeof millis === 'number' && Number.isFinite(millis)) return millis
  if (!value) return 0
  const s = value.trim()
  if (s.endsWith('m')) return Number(s.slice(0, -1)) || 0
  return (Number(s) || 0) * 1000
}

export function parseMemoryToMi(value?: string, mi?: number): number {
  if (typeof mi === 'number' && Number.isFinite(mi)) return mi
  if (!value) return 0
  const s = value.trim()
  if (s.endsWith('Mi')) return Number(s.slice(0, -2)) || 0
  if (s.endsWith('Gi')) return (Number(s.slice(0, -2)) || 0) * 1024
  if (s.endsWith('Ki')) return (Number(s.slice(0, -2)) || 0) / 1024
  return Number(s) || 0
}

export function parseStorageToBytes(value?: string): number | undefined {
  if (!value || value === '—') return undefined
  const m = value.trim().match(/^([0-9]*\.?[0-9]+)\s*([A-Za-z]+)?$/)
  if (!m) return undefined
  const n = Number(m[1])
  if (!Number.isFinite(n)) return undefined
  const unit = m[2] ?? ''
  const mul: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
    k: 1e3,
    K: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    P: 1e15,
    E: 1e18,
  }
  return n * (mul[unit] ?? 1)
}

/** Marker for thousands grouping; render with a CSS gap, not as a full mono space. */
export const THIN_SPACE = '\u202F'

export function groupThousands(n: number, fractionDigits?: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  let intPart: string
  let fracPart: string | undefined
  if (fractionDigits != null) {
    const [i, f] = abs.toFixed(fractionDigits).split('.')
    intPart = i
    fracPart = f
  } else {
    intPart = String(Math.round(abs))
  }
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE)
  return fracPart ? `${sign}${grouped}.${fracPart}` : `${sign}${grouped}`
}

export function formatCpuMillis(millis: number): string {
  if (millis < 1000) return `${groupThousands(Math.round(millis))}${THIN_SPACE}m`
  const cores = millis / 1000
  return Number.isInteger(cores) ? groupThousands(cores) : groupThousands(cores, 2)
}

export function formatMemoryMi(mi: number): string {
  if (mi <= 0) return `0${THIN_SPACE}Mi`
  if (mi < 1) return `${mi.toFixed(1)}${THIN_SPACE}Mi`
  return `${groupThousands(Math.round(mi))}${THIN_SPACE}Mi`
}
