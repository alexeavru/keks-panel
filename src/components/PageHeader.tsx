import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  onRefresh?: () => void
  refreshing?: boolean
}

export function PageHeader({
  title,
  description,
  actions,
  onRefresh,
  refreshing,
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {onRefresh ? (
          <button
            type="button"
            className="btn-ghost border border-ink-200 bg-white/60"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        ) : null}
      </div>
    </div>
  )
}
