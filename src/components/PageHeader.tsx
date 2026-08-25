import type { ReactNode } from 'react'
import { PanelUser } from '@/components/PanelUser'

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink-900">{title}</h1>
        {description ? (
          typeof description === 'string' ? (
            <p className="mt-1 text-sm text-ink-500">{description}</p>
          ) : (
            description
          )
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <PanelUser />
      </div>
    </div>
  )
}
