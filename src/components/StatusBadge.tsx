import type { ReactNode } from 'react'

export type BadgeTone = 'ok' | 'info' | 'warn' | 'bad' | 'muted' | 'fade' | 'neutral'

interface StatusBadgeProps {
  tone: BadgeTone
  children: ReactNode
}

const tones: Record<BadgeTone, string> = {
  ok: 'bg-leaf-500/15 text-leaf-700 ring-leaf-500/25',
  info: 'bg-sky-500/15 text-sky-800 ring-sky-500/25',
  warn: 'bg-ember-400/20 text-ink-800 ring-ember-400/30',
  bad: 'bg-rose-500/15 text-rose-500 ring-rose-500/25',
  muted: 'bg-slate-200/80 text-slate-600 ring-slate-300',
  fade: 'bg-violet-500/15 text-violet-800 ring-violet-500/25',
  neutral: 'bg-ink-100 text-ink-600 ring-ink-200',
}

export const toneRow: Record<BadgeTone, string> = {
  ok: 'bg-leaf-500/15',
  info: 'bg-sky-500/15',
  warn: 'bg-ember-400/20',
  bad: 'bg-rose-500/15',
  muted: 'bg-slate-200/80',
  fade: 'bg-violet-500/15',
  neutral: 'bg-ink-50',
}

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function serviceTypeTone(type: string): BadgeTone {
  switch (type) {
    case 'NodePort':
      return 'warn'
    case 'LoadBalancer':
      return 'ok'
    default:
      return 'neutral'
  }
}

export function phaseTone(phase: string): BadgeTone {
  switch (phase) {
    case 'Running':
    case 'Active':
      return 'ok'
    case 'Succeeded':
      return 'info'
    case 'Pending':
      return 'warn'
    case 'Terminating':
      return 'fade'
    case 'Failed':
      return 'bad'
    case 'Unknown':
      return 'muted'
    default:
      return 'neutral'
  }
}

export function podPhaseTone(state: string, ready: boolean): BadgeTone {
  const key = state.replace(/^Init:/, '')
  if (key === 'Running') return ready ? 'ok' : 'warn'
  if (key === 'Completed' || key === 'Succeeded') return 'info'
  if (key === 'Terminating') return 'fade'
  if (key === 'Unknown') return 'muted'
  if (key === 'Failed' || /Error|BackOff|OOMKilled|ErrImage/.test(key)) return 'bad'
  if (key === 'Active') return 'ok'
  return 'warn'
}

export function storagePhaseTone(phase: string): BadgeTone {
  switch (phase) {
    case 'Bound':
      return 'ok'
    case 'Available':
      return 'info'
    case 'Pending':
      return 'warn'
    case 'Released':
      return 'fade'
    case 'Failed':
    case 'Lost':
      return 'bad'
    default:
      return 'neutral'
  }
}
